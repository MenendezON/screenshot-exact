-- Tests de docs/sql-manuel/01-colonnes.sql et 02-appreciations.sql (à lancer APRÈS leur application,
-- avec le jeu de démonstration supabase/seed.sql). Transaction annulée : se termine toujours par « RÉSULTATS ».
CREATE OR REPLACE FUNCTION pg_temp.act_as(_uid uuid, _aal text DEFAULT 'aal2') RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _uid, 'role', 'authenticated', 'aal', _aal)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END $$;
CREATE OR REPLACE FUNCTION pg_temp.as_admin() RETURNS void LANGUAGE plpgsql AS $$
BEGIN EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims', '', true); END $$;

DO $$
DECLARE
  u_admin uuid := gen_random_uuid(); u_drh uuid := gen_random_uuid(); u_gest uuid := gen_random_uuid();
  u_paie uuid := gen_random_uuid(); u_mgr uuid := gen_random_uuid(); u_dir uuid := gen_random_uuid();
  e_mgr uuid; e_sub uuid; e_other uuid; c_sub uuid; c_other uuid; r1 uuid; r2 uuid;
  n int; ok boolean; txt text; total int := 0; failed int := 0; out text := '';
BEGIN
  INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  SELECT u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', e || '@test.local',
         json_build_object('full_name', e)::jsonb, now(), now()
  FROM (VALUES (u_admin,'admin'),(u_drh,'drh'),(u_gest,'gest'),(u_paie,'paie'),(u_mgr,'mgr'),(u_dir,'dir')) v(u,e)
  ORDER BY (e <> 'admin');
  DELETE FROM public.user_roles WHERE user_id = u_admin AND role = 'drh';
  DELETE FROM public.user_roles WHERE user_id IN (u_drh,u_gest,u_paie,u_mgr,u_dir);
  INSERT INTO public.user_roles (user_id, role) VALUES (u_drh,'drh'),(u_gest,'gestionnaire_rh'),(u_paie,'paie'),(u_mgr,'manager'),(u_dir,'direction');

  SELECT id INTO e_mgr FROM public.employees WHERE matricule = 'DEMO008';
  SELECT id INTO e_sub FROM public.employees WHERE matricule = 'DEMO009';
  SELECT id INTO e_other FROM public.employees WHERE matricule = 'DEMO001';
  UPDATE public.profiles SET employee_id = e_mgr WHERE id = u_mgr;
  UPDATE public.profiles SET employee_id = e_other WHERE id = u_dir;
  SELECT id INTO c_sub FROM public.contracts WHERE employee_id = e_sub AND archived_at IS NULL LIMIT 1;
  SELECT id INTO c_other FROM public.contracts WHERE employee_id = e_other AND archived_at IS NULL LIMIT 1;

  -- 01 : rémunération ↔ contrat
  BEGIN
    INSERT INTO public.compensation (employee_id, net_monthly_salary_fcfa, effective_date, contract_id)
    VALUES (e_sub, 100000, '1999-01-01', c_other);
    ok := false;
  EXCEPTION WHEN check_violation THEN ok := true; END;
  total := total + 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] rémunération refusée si le contrat est celui d''un autre employé', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);

  BEGIN
    INSERT INTO public.documents (employee_id, document_type_id, storage_path, file_name, description)
    VALUES (e_sub, (SELECT id FROM public.document_types LIMIT 1), 'x/' || gen_random_uuid(), 'a.pdf', repeat('x', 501));
    ok := false;
  EXCEPTION WHEN check_violation THEN ok := true; END;
  total := total + 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] description de document limitée à 500 caractères', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);

  SELECT count(*) INTO n FROM public.v_employee_current WHERE last_change IS NULL;
  total := total + 1; ok := n = 0; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] last_change renseigné pour chaque fiche (%s sans valeur)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, n);

  -- 02 : appréciations
  PERFORM pg_temp.act_as(u_drh);
  INSERT INTO public.employee_reviews (employee_id, contract_id, kind, review_date, rating, title, comment)
  VALUES (e_sub, c_sub, 'performance', current_date, 3, 'Titre secret', 'Commentaire confidentiel') RETURNING id INTO r1;
  INSERT INTO public.employee_reviews (employee_id, kind, review_date, comment) VALUES (e_mgr, 'other', current_date, 'Sur le manager') RETURNING id INTO r2;
  total := total + 1; ok := true; out := out || E'\n[OK] drh crée des appréciations';

  BEGIN
    INSERT INTO public.employee_reviews (employee_id, contract_id, kind, review_date, comment) VALUES (e_sub, c_other, 'contract', current_date, 'x');
    ok := false;
  EXCEPTION WHEN check_violation THEN ok := true; END;
  total := total + 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] contrat d''un autre employé refusé', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);

  SELECT count(*) INTO n FROM public.audit_log WHERE table_name = 'employee_reviews' AND record_id = r1
    AND (new_data::text LIKE '%confidentiel%' OR new_data::text LIKE '%secret%');
  total := total + 1; ok := n = 0; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] ni commentaire ni titre dans l''historique (%s fuites)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, n);

  PERFORM pg_temp.act_as(u_gest);
  SELECT count(*) INTO n FROM public.employee_reviews;
  total := total + 1; ok := n >= 2; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] gestionnaire_rh voit tout (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, n);
  UPDATE public.employee_reviews SET comment = 'Modifié' WHERE id = r1;
  GET DIAGNOSTICS n = ROW_COUNT;
  total := total + 1; ok := n = 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] gestionnaire_rh modifie', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);
  BEGIN
    UPDATE public.employee_reviews SET archived_at = now() WHERE id = r1; ok := false;
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  total := total + 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] gestionnaire_rh ne peut pas archiver', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);

  PERFORM pg_temp.act_as(u_mgr);
  SELECT count(*) INTO n FROM public.employee_reviews WHERE id = r1;
  total := total + 1; ok := n = 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] manager voit l''appréciation d''un membre de son équipe', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);
  SELECT count(*) INTO n FROM public.employee_reviews WHERE id = r2;
  total := total + 1; ok := n = 0; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] manager ne voit pas les appréciations le concernant', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);
  BEGIN
    INSERT INTO public.employee_reviews (employee_id, kind, review_date, comment) VALUES (e_sub, 'other', current_date, 'x'); ok := false;
  EXCEPTION WHEN others THEN ok := true; END;
  total := total + 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] manager ne peut pas créer', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);

  PERFORM pg_temp.act_as(u_dir);
  SELECT count(*) INTO n FROM public.employee_reviews WHERE id = r1;
  total := total + 1; ok := n = 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] direction voit les appréciations des autres', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);

  PERFORM pg_temp.act_as(u_paie);
  SELECT count(*) INTO n FROM public.employee_reviews;
  total := total + 1; ok := n = 0; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] paie ne voit aucune appréciation (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, n);
  PERFORM pg_temp.act_as(u_admin);
  SELECT count(*) INTO n FROM public.employee_reviews;
  total := total + 1; ok := n = 0; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] admin_it ne voit aucune appréciation (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, n);

  PERFORM pg_temp.as_admin();
  BEGIN UPDATE public.employees SET gender = 'X' WHERE id = e_sub; ok := false;
  EXCEPTION WHEN check_violation THEN ok := true; END;
  total := total + 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] genre limité à F ou M', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);
  UPDATE public.employees SET gender = 'F' WHERE id = e_sub;
  SELECT count(*) INTO n FROM public.v_employee_current WHERE employee_id = e_sub AND gender = 'F';
  total := total + 1; ok := n = 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] le genre apparaît dans v_employee_current', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);
  SELECT count(*) INTO n FROM public.permissions WHERE resource = 'reviews' AND label <> 'Appréciations';
  total := total + 1; ok := n = 0; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] libellé de la ressource « Appréciations » cohérent (%s écart)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, n);
  RAISE EXCEPTION E'RÉSULTATS : % vérifications, % échec(s)%', total, failed, out;
END $$;
