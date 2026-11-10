-- =====================================================================
-- Tests des droits par rôle (RLS, périmètres, MFA, règles de gestion).
-- S'exécute dans une transaction entièrement annulée à la fin :
-- le script se termine TOUJOURS par une erreur « RÉSULTATS » qui liste
-- chaque vérification (OK / ÉCHEC). Aucune donnée n'est conservée.
-- Prérequis : données de démonstration chargées (supabase/seed.sql).
-- =====================================================================
CREATE OR REPLACE FUNCTION pg_temp.act_as(_uid uuid, _aal text DEFAULT 'aal2') RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', _uid, 'role', 'authenticated', 'aal', _aal)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END $$;

CREATE OR REPLACE FUNCTION pg_temp.as_admin() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
END $$;

DO $$
DECLARE
  u_admin uuid := gen_random_uuid(); u_drh uuid := gen_random_uuid(); u_gest uuid := gen_random_uuid();
  u_paie uuid := gen_random_uuid(); u_mgr uuid := gen_random_uuid(); u_dir uuid := gen_random_uuid();
  u_aud uuid := gen_random_uuid(); u_site uuid := gen_random_uuid();
  e_mgr uuid; e_lm uuid; e_one uuid; e_sub uuid; e_head uuid;
  n int; n2 int; txt text; ok boolean;
  total int := 0; failed int := 0; out text := '';
  sindia uuid; expected_site int;
BEGIN
  -- ---------- Préparation (super-utilisateur) ----------
  INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  SELECT u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', e || '@test.local',
         json_build_object('full_name', e)::jsonb, now(), now()
  FROM (VALUES (u_admin, 'admin'), (u_drh, 'drh'), (u_gest, 'gest'), (u_paie, 'paie'), (u_mgr, 'mgr'),
               (u_dir, 'dir'), (u_aud, 'aud'), (u_site, 'site')) v(u, e)
  ORDER BY (e <> 'admin');
  -- le premier compte reçoit admin_it + drh : on ne garde que admin_it pour ce test
  DELETE FROM public.user_roles WHERE user_id = u_admin AND role = 'drh';
  DELETE FROM public.user_roles WHERE user_id <> u_admin AND user_id IN (u_drh, u_gest, u_paie, u_mgr, u_dir, u_aud, u_site);
  INSERT INTO public.user_roles (user_id, role) VALUES
    (u_drh, 'drh'), (u_gest, 'gestionnaire_rh'), (u_paie, 'paie'), (u_mgr, 'manager'),
    (u_dir, 'direction'), (u_aud, 'auditeur'), (u_site, 'direction');

  SELECT id INTO e_mgr FROM public.employees WHERE matricule = 'DEMO008';   -- chef d'équipe soudure
  SELECT id INTO e_lm FROM public.employees WHERE matricule = 'DEMO037';    -- sortie « Longue maladie »
  SELECT id INTO e_one FROM public.employees WHERE matricule = 'DEMO001';
  SELECT id INTO e_sub FROM public.employees WHERE matricule = 'DEMO009';
  SELECT id INTO e_head FROM public.employees WHERE matricule = 'DEMO005';
  UPDATE public.profiles SET employee_id = e_mgr WHERE id = u_mgr;

  -- périmètre site : la Direction « site » est limitée à Sindia
  SELECT id INTO sindia FROM public.sites WHERE name = 'Sindia';
  INSERT INTO public.user_scopes (user_id, site_id) VALUES (u_site, sindia);
  SELECT count(DISTINCT employee_id) INTO expected_site FROM public.employee_sites WHERE site_id = sindia AND archived_at IS NULL;

  -- ---------- admin_it ----------
  PERFORM pg_temp.act_as(u_admin);
  SELECT count(*) INTO n FROM public.employees;
  total := total + 1; ok := n = 0; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] admin_it ne voit aucun employé (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, n);
  SELECT count(*) INTO n FROM public.sites;
  total := total + 1; ok := n = 3; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] admin_it voit les sites (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, n);
  BEGIN
    INSERT INTO public.sites (name) VALUES ('Site test');
    ok := true;
  EXCEPTION WHEN others THEN ok := false; END;
  total := total + 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] admin_it crée un site', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);
  SELECT count(*) INTO n FROM public.audit_log WHERE table_name IN ('compensation', 'employees', 'contracts', 'exits');
  total := total + 1; ok := n = 0; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] admin_it ne lit pas le journal RH (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, n);
  SELECT count(*) INTO n FROM public.compensation;
  total := total + 1; ok := n = 0; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] admin_it ne voit aucune rémunération (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, n);

  -- ---------- drh ----------
  PERFORM pg_temp.act_as(u_drh, 'aal1');
  SELECT count(*) INTO n FROM public.employees;
  total := total + 1; ok := n = 0; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] drh sans double facteur : aucun accès (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, n);

  PERFORM pg_temp.act_as(u_drh);
  SELECT count(*) INTO n FROM public.employees;
  total := total + 1; ok := n = 40; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] drh voit tous les employés (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, n);
  SELECT count(*) INTO n FROM public.compensation;
  total := total + 1; ok := n > 0; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] drh voit les rémunérations (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, n);
  SELECT reason_name INTO txt FROM public.v_exit_details WHERE employee_id = e_lm;
  total := total + 1; ok := txt = 'Longue maladie'; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] drh voit le motif confidentiel (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, txt);
  BEGIN
    UPDATE public.employees SET archived_at = now() WHERE id = e_sub;
    GET DIAGNOSTICS n = ROW_COUNT; ok := n = 1;
    UPDATE public.employees SET archived_at = NULL WHERE id = e_sub;
  EXCEPTION WHEN others THEN ok := false; END;
  total := total + 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] drh archive un employé', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);
  BEGIN
    DELETE FROM public.employees WHERE id = e_sub; ok := false;
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  total := total + 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] suppression physique refusée', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);
  BEGIN
    UPDATE public.employees SET manager_id = e_sub WHERE id = e_head; ok := false;
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'Boucle hiérarchique%'; END;
  total := total + 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] boucle hiérarchique refusée', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);
  BEGIN
    INSERT INTO public.contracts (employee_id, type, start_date) VALUES (e_one, 'cdi', current_date); ok := false;
  EXCEPTION WHEN exclusion_violation THEN ok := true; END;
  total := total + 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] chevauchement de contrats refusé', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);
  BEGIN
    INSERT INTO public.contracts (employee_id, type, start_date, duration_months) VALUES (e_one, 'cdd', '2040-01-01', 30); ok := false;
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'Durée maximale%'; END;
  total := total + 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] durée CDD > paramètre refusée', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);
  INSERT INTO public.assignments (employee_id, org_unit_id, start_date)
    SELECT e_sub, org_unit_id, current_date + 10 FROM public.assignments WHERE employee_id = e_sub ORDER BY start_date DESC LIMIT 1;
  SELECT count(*) INTO n FROM public.assignments WHERE employee_id = e_sub AND end_date IS NULL AND archived_at IS NULL;
  SELECT count(*) INTO n2 FROM public.assignments WHERE employee_id = e_sub AND end_date = current_date + 9;
  total := total + 1; ok := n = 1 AND n2 = 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] nouvelle affectation clôture la précédente', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);
  BEGIN
    INSERT INTO public.user_roles (user_id, role) VALUES (u_gest, 'auditeur'); ok := false;
  EXCEPTION WHEN others THEN ok := true; END;
  total := total + 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] drh ne peut pas attribuer de rôle', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);

  -- ---------- gestionnaire_rh ----------
  PERFORM pg_temp.act_as(u_gest);
  SELECT count(*) INTO n FROM public.employees;
  total := total + 1; ok := n = 40; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] gestionnaire voit les employés (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, n);
  SELECT count(*) INTO n FROM public.compensation;
  total := total + 1; ok := n = 0; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] gestionnaire ne voit pas les rémunérations (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, n);
  SELECT count(*) INTO n FROM public.employee_sensitive;
  total := total + 1; ok := n > 0; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] gestionnaire voit les données sensibles (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, n);
  BEGIN
    UPDATE public.employees SET archived_at = now() WHERE id = e_sub; ok := false;
  EXCEPTION WHEN others THEN ok := true; END;
  total := total + 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] gestionnaire ne peut pas archiver', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);

  -- ---------- paie ----------
  PERFORM pg_temp.act_as(u_paie);
  SELECT count(*) INTO n FROM public.compensation;
  total := total + 1; ok := n > 0; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] paie voit les rémunérations (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, n);
  SELECT count(*) INTO n FROM public.employee_sensitive;
  total := total + 1; ok := n = 0; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] paie ne voit pas les données sensibles (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, n);
  UPDATE public.employees SET phone = '000' WHERE id = e_sub;
  GET DIAGNOSTICS n = ROW_COUNT;
  total := total + 1; ok := n = 0; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] paie ne modifie pas les employés (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, n);
  SELECT reason_name INTO txt FROM public.v_exit_details WHERE employee_id = e_lm;
  total := total + 1; ok := txt = 'Motif confidentiel'; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] paie : motif masqué (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, txt);
  BEGIN
    SELECT count(reason_id) INTO n FROM public.exits; ok := false;
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  total := total + 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] motif brut des sorties illisible', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);

  -- ---------- manager (périmètre équipe récursif) ----------
  PERFORM pg_temp.act_as(u_mgr);
  SELECT count(*) INTO n FROM public.employees;
  total := total + 1; ok := n = 9; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] manager voit son équipe directe et indirecte (%s / 9)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, n);
  SELECT count(*) INTO n FROM public.employees WHERE id = e_one;
  total := total + 1; ok := n = 0; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] manager ne voit pas hors équipe', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);
  SELECT count(*) INTO n FROM public.compensation;
  total := total + 1; ok := n = 0; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] manager ne voit pas les rémunérations (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, n);
  SELECT count(*) INTO n FROM public.contracts;
  total := total + 1; ok := n > 0; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] manager voit les contrats de son équipe (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, n);

  -- ---------- direction ----------
  PERFORM pg_temp.act_as(u_dir);
  SELECT count(*) INTO n FROM public.compensation;
  total := total + 1; ok := n > 0; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] direction voit les rémunérations (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, n);
  SELECT count(*) INTO n FROM public.employee_sensitive;
  total := total + 1; ok := n = 0; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] direction ne voit pas les données sensibles (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, n);
  SELECT reason_name INTO txt FROM public.v_exit_details WHERE employee_id = e_lm;
  total := total + 1; ok := txt = 'Motif confidentiel'; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] direction : « Longue maladie » masqué (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, txt);

  -- ---------- auditeur ----------
  PERFORM pg_temp.act_as(u_aud);
  SELECT count(*) INTO n FROM public.employee_sensitive;
  total := total + 1; ok := n > 0; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] auditeur lit les données sensibles (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, n);
  SELECT count(*) INTO n FROM public.audit_log WHERE table_name = 'compensation';
  total := total + 1; ok := n > 0; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] auditeur lit tout le journal (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, n);
  BEGIN
    INSERT INTO public.employees (matricule, first_names, last_name) VALUES ('TEST1', 'A', 'B'); ok := false;
  EXCEPTION WHEN others THEN ok := true; END;
  total := total + 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] auditeur ne peut rien créer', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);

  -- ---------- périmètre site ----------
  PERFORM pg_temp.as_admin();
  UPDATE public.role_permissions rp SET scope = 'site'
  FROM public.roles r, public.permissions p
  WHERE rp.role_id = r.id AND rp.permission_id = p.id AND r.code = 'direction' AND p.resource = 'employees' AND p.action = 'view';
  PERFORM pg_temp.act_as(u_site);
  SELECT count(*) INTO n FROM public.employees;
  total := total + 1; ok := n = expected_site; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] périmètre site Sindia (%s / %s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, n, expected_site);

  PERFORM pg_temp.as_admin();
  RAISE EXCEPTION 'RÉSULTATS : % vérifications, % échec(s)%', total, failed, out;
END $$;
