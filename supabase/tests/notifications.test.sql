-- =====================================================================
-- Tests de la génération quotidienne des notifications
-- (destinataires, périmètres, anti-doublon, file e-mail, droits).
-- Même principe que permissions.test.sql : transaction entièrement annulée,
-- le script se termine TOUJOURS par une erreur « RÉSULTATS » qui liste les
-- vérifications (OK / ÉCHEC). Aucune donnée n'est conservée.
-- Prérequis : schéma appliqué, destinataires initiaux présents.
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

CREATE OR REPLACE FUNCTION pg_temp.nb(_user uuid, _kind text, _emp uuid) RETURNS int
LANGUAGE sql AS $$
  SELECT count(*)::int FROM public.notifications
  WHERE user_id = _user AND kind = _kind AND payload ->> 'employee_id' = _emp::text;
$$;

DO $$
DECLARE
  u_drh uuid := gen_random_uuid(); u_gest uuid := gen_random_uuid(); u_dir uuid := gen_random_uuid();
  u_mgr uuid := gen_random_uuid(); u_paie uuid := gen_random_uuid(); u_old uuid := gen_random_uuid();
  u_gone uuid := gen_random_uuid();
  e_boss uuid; e1 uuid; e2 uuid; e3 uuid; e4 uuid; c1 uuid; c3 uuid;
  n int; n2 int; keys text; dk text; ok boolean;
  total int := 0; failed int := 0; out text := '';
BEGIN
  -- ---------- Préparation (super-utilisateur) ----------
  INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  SELECT u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', e || '@notif.test',
         json_build_object('full_name', e)::jsonb, now(), now()
  FROM (VALUES (u_drh, 'drh'), (u_gest, 'gest'), (u_dir, 'dir'), (u_mgr, 'mgr'), (u_paie, 'paie'),
               (u_old, 'old'), (u_gone, 'gone')) v(u, e);
  DELETE FROM public.user_roles WHERE user_id IN (u_drh, u_gest, u_dir, u_mgr, u_paie, u_old, u_gone);
  INSERT INTO public.user_roles (user_id, role, archived_at) VALUES
    (u_drh, 'drh', NULL), (u_gest, 'gestionnaire_rh', NULL), (u_dir, 'direction', NULL),
    (u_mgr, 'manager', NULL), (u_paie, 'paie', NULL),
    (u_old, 'drh', now()),          -- rôle désactivé
    (u_gone, 'drh', NULL);          -- profil archivé ci-dessous
  UPDATE public.profiles SET archived_at = now() WHERE id = u_gone;
  UPDATE public.settings SET value = 0 WHERE key = 'notifications_email_enabled';

  INSERT INTO public.employees (matricule, first_names, last_name) VALUES ('NOTIF0', 'Chef', 'Equipe') RETURNING id INTO e_boss;
  INSERT INTO public.employees (matricule, first_names, last_name, manager_id) VALUES ('NOTIF1', 'Awa', 'Fin', e_boss) RETURNING id INTO e1;
  INSERT INTO public.employees (matricule, first_names, last_name, birth_date)
    VALUES ('NOTIF2', 'Moussa', 'Retraite', current_date - make_interval(years => (SELECT value FROM public.settings WHERE key = 'retirement_age')::int) + 30)
    RETURNING id INTO e2;
  INSERT INTO public.employees (matricule, first_names, last_name, manager_id) VALUES ('NOTIF3', 'Fatou', 'Echu', e_boss) RETURNING id INTO e3;
  INSERT INTO public.employees (matricule, first_names, last_name) VALUES ('NOTIF4', 'Ibou', 'Courriel') RETURNING id INTO e4;
  UPDATE public.profiles SET employee_id = e_boss WHERE id = u_mgr;

  INSERT INTO public.contracts (employee_id, type, start_date) VALUES (e_boss, 'cdi', current_date - 1000);
  INSERT INTO public.contracts (employee_id, type, start_date, duration_months)
    VALUES (e1, 'cdd', (current_date + 21 - interval '12 months')::date, 12) RETURNING id INTO c1;   -- fin dans ~20 jours
  INSERT INTO public.contracts (employee_id, type, start_date) VALUES (e2, 'cdi', current_date - 400);  -- retraite dans 30 jours
  INSERT INTO public.contracts (employee_id, type, start_date, duration_months)
    VALUES (e3, 'cdd', (current_date - interval '24 months')::date, 6) RETURNING id INTO c3;          -- échu, à régulariser

  -- Le manager reçoit tous les types, mais seulement pour son équipe
  INSERT INTO public.notification_recipients (kind, role) VALUES ('*', 'manager');

  PERFORM public.generate_contract_notifications();

  -- ---------- Destinataires ----------
  total := total + 1; ok := pg_temp.nb(u_drh, 'contract_ending', e1) = 1 AND pg_temp.nb(u_gest, 'contract_ending', e1) = 1;
  IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] fin de CDD : DRH et gestionnaire RH prévenus', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);

  total := total + 1; ok := pg_temp.nb(u_dir, 'retirement_upcoming', e2) = 1 AND pg_temp.nb(u_dir, 'contract_ending', e1) = 0;
  IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] Direction : retraite oui, fin de CDD non', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);

  SELECT count(*) INTO n FROM public.notifications WHERE user_id = u_paie;
  total := total + 1; ok := n = 0; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] Paie (non destinataire) : aucune notification (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, n);

  SELECT count(*) INTO n FROM public.notifications WHERE user_id IN (u_old, u_gone);
  total := total + 1; ok := n = 0; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] rôle désactivé ou profil archivé : aucune notification (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, n);

  -- ---------- Périmètre équipe ----------
  total := total + 1;
  ok := pg_temp.nb(u_mgr, 'contract_ending', e1) = 1 AND pg_temp.nb(u_mgr, 'contract_to_regularize', e3) = 1
        AND pg_temp.nb(u_mgr, 'retirement_upcoming', e2) = 0;
  IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] manager : alertes de son équipe uniquement', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);

  -- ---------- Contenu ----------
  SELECT string_agg(k, ',' ORDER BY k), max(n.dedupe_key) INTO keys, dk
  FROM public.notifications n, jsonb_object_keys(n.payload) k
  WHERE n.user_id = u_drh AND n.kind = 'contract_ending' AND n.payload ->> 'employee_id' = e1::text;
  total := total + 1; ok := keys = 'contract_id,contract_type,days_remaining,employee_id,employee_name,reference_date';
  IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] payload limité aux champs prévus (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, keys);

  total := total + 1; ok := dk = e1::text || ':' || (SELECT end_date FROM public.contracts WHERE id = c1)::text;
  IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] clé anti-doublon = employé:date de référence', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);

  SELECT dedupe_key INTO dk FROM public.notifications WHERE user_id = u_drh AND kind = 'contract_to_regularize' AND payload ->> 'employee_id' = e3::text;
  total := total + 1; ok := dk = c3::text; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] contrat à régulariser : clé = contrat', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);

  -- ---------- Anti-doublon ----------
  SELECT count(*) INTO n FROM public.notifications WHERE payload ->> 'employee_id' IN (e1::text, e2::text, e3::text);
  PERFORM public.generate_contract_notifications();
  SELECT count(*) INTO n2 FROM public.notifications WHERE payload ->> 'employee_id' IN (e1::text, e2::text, e3::text);
  total := total + 1; ok := n > 0 AND n = n2; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] seconde exécution : aucun doublon (%s puis %s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, n, n2);

  -- Nouvelle échéance (date de référence décalée) : nouvelle notification
  UPDATE public.contracts SET start_date = start_date + 5 WHERE id = c1;
  PERFORM public.generate_contract_notifications();
  total := total + 1; ok := pg_temp.nb(u_drh, 'contract_ending', e1) = 2; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] nouvelle échéance : nouvelle notification', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);

  -- ---------- File e-mail ----------
  SELECT count(*) INTO n FROM public.notification_outbox o JOIN public.notifications nt ON nt.id = o.notification_id
  WHERE nt.payload ->> 'employee_id' IN (e1::text, e2::text, e3::text);
  total := total + 1; ok := n = 0; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] e-mails désactivés : file vide (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, n);

  UPDATE public.settings SET value = 1 WHERE key = 'notifications_email_enabled';
  INSERT INTO public.contracts (employee_id, type, start_date, duration_months)
    VALUES (e4, 'cdd', (current_date + 6 - interval '6 months')::date, 6);
  PERFORM public.generate_contract_notifications();
  SELECT count(*) INTO n FROM public.notification_outbox o JOIN public.notifications nt ON nt.id = o.notification_id
  WHERE nt.payload ->> 'employee_id' = e4::text AND nt.user_id = u_drh
    AND o.status = 'pending' AND o.channel = 'email' AND o.recipient_email = 'drh@notif.test';
  total := total + 1; ok := n = 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] e-mails activés : message en attente pour la DRH (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, n);

  -- ---------- Droits ----------
  total := total + 1;
  ok := NOT has_function_privilege('authenticated', 'public.generate_contract_notifications()', 'EXECUTE')
        AND NOT has_function_privilege('anon', 'public.generate_contract_notifications()', 'EXECUTE')
        AND has_function_privilege('service_role', 'public.generate_contract_notifications()', 'EXECUTE');
  IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] génération réservée à service_role', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);

  total := total + 1;
  ok := NOT has_table_privilege('authenticated', 'public.notification_outbox', 'SELECT')
        AND NOT has_table_privilege('authenticated', 'public.notification_outbox', 'INSERT')
        AND NOT has_table_privilege('anon', 'public.notification_outbox', 'SELECT');
  IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] file e-mail : aucun accès client', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);

  PERFORM pg_temp.act_as(u_drh);
  SELECT count(*) INTO n FROM public.notification_recipients;
  PERFORM pg_temp.act_as(u_gest);
  SELECT count(*) INTO n2 FROM public.notification_recipients;
  total := total + 1; ok := n > 0 AND n2 = 0; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] destinataires : visibles par la DRH (%s), pas par le gestionnaire RH (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, n, n2);

  BEGIN
    INSERT INTO public.notification_recipients (kind, role) VALUES ('contract_ending', 'paie');
    ok := false;
  EXCEPTION WHEN others THEN ok := true;
  END;
  total := total + 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] gestionnaire RH ne peut pas ajouter de destinataire', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);

  PERFORM pg_temp.as_admin();
  RAISE EXCEPTION 'RÉSULTATS : % vérifications, % échec(s)%', total, failed, out;
END $$;
