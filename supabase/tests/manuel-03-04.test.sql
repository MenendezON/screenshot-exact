-- Tests de docs/sql-manuel/03-api.sql et 04-matrice-permissions.sql (après application, avec supabase/seed.sql).
-- Transaction annulée : se termine toujours par « RÉSULTATS ».
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
  u_admin uuid := gen_random_uuid(); u_drh uuid := gen_random_uuid();
  cid uuid; rp_admin uuid; rp_drh uuid; n int; ok boolean; msg text;
  total int := 0; failed int := 0; out text := '';
BEGIN
  INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  SELECT u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', e || '@test.local',
         json_build_object('full_name', e)::jsonb, now(), now()
  FROM (VALUES (u_admin,'admin'),(u_drh,'drh')) v(u,e) ORDER BY (e <> 'admin');
  DELETE FROM public.user_roles WHERE user_id = u_admin AND role = 'drh';
  DELETE FROM public.user_roles WHERE user_id = u_drh;
  INSERT INTO public.user_roles (user_id, role) VALUES (u_drh, 'drh');

  -- 03 : durée de vie des clés
  FOR n IN 1..3 LOOP
    BEGIN
      INSERT INTO public.api_clients (name, level, key_prefix, key_hash, expires_at)
      VALUES ('t' || n, 'identite', '0000000' || n, repeat('a', 64),
              CASE n WHEN 1 THEN now() - interval '1 day' WHEN 2 THEN now() + interval '400 days' ELSE now() + interval '30 days' END)
      RETURNING id INTO cid;
      ok := n = 3;
    EXCEPTION WHEN check_violation THEN ok := n < 3; msg := SQLERRM; END;
    total := total + 1; IF NOT ok THEN failed := failed + 1; END IF;
    out := out || format(E'\n[%s] clé d''API cas %s (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END,
      CASE n WHEN 1 THEN 'expirée refusée' WHEN 2 THEN '400 jours refusée' ELSE '30 jours acceptée' END, COALESCE(left(msg, 60), '—'));
  END LOOP;
  BEGIN
    UPDATE public.api_clients SET expires_at = now() + interval '300 days' WHERE id = cid; ok := false;
  EXCEPTION WHEN check_violation THEN ok := true; END;
  total := total + 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] prolongation d''une clé refusée', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);
  UPDATE public.api_clients SET revoked_at = now() WHERE id = cid;
  GET DIAGNOSTICS n = ROW_COUNT;
  total := total + 1; ok := n = 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] révocation possible', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);

  PERFORM pg_temp.act_as(u_admin);
  BEGIN PERFORM 1 FROM public.api_clients; ok := false; EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  total := total + 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] admin_it lui-même n''a aucun accès direct à api_clients (passe par le serveur)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);
  PERFORM pg_temp.as_admin();

  -- 04 : matrice
  SELECT rp.id INTO rp_admin FROM public.role_permissions rp JOIN public.roles r ON r.id = rp.role_id JOIN public.permissions p ON p.id = rp.permission_id
   WHERE r.code = 'admin_it' AND p.resource = 'users' AND p.action = 'edit';
  SELECT rp.id INTO rp_drh FROM public.role_permissions rp JOIN public.roles r ON r.id = rp.role_id JOIN public.permissions p ON p.id = rp.permission_id
   WHERE r.code = 'drh' AND p.resource = 'documents' AND p.action = 'view' AND rp.archived_at IS NULL LIMIT 1;

  PERFORM pg_temp.act_as(u_admin);
  UPDATE public.role_permissions SET scope = 'site' WHERE id = rp_drh;
  GET DIAGNOSTICS n = ROW_COUNT;
  total := total + 1; ok := n = 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] admin_it modifie le périmètre d''un droit', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);
  BEGIN UPDATE public.role_permissions SET scope = 'team' WHERE id = rp_admin; ok := false;
  EXCEPTION WHEN check_violation THEN ok := true; END;
  total := total + 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] garde-fou : admin_it ne peut pas restreindre son propre droit users:edit', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);
  BEGIN UPDATE public.role_permissions SET archived_at = now() WHERE id = rp_admin; ok := false;
  EXCEPTION WHEN check_violation THEN ok := true; END;
  total := total + 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] garde-fou : ni archivage de users:edit', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);
  SELECT count(*) INTO n FROM public.audit_log WHERE table_name = 'role_permissions' AND record_id = rp_drh;
  total := total + 1; ok := n >= 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] la modification est tracée dans audit_log (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, n);

  PERFORM pg_temp.act_as(u_drh);
  UPDATE public.role_permissions SET scope = 'all' WHERE id = rp_drh;
  GET DIAGNOSTICS n = ROW_COUNT;
  total := total + 1; ok := n = 0; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] drh ne peut pas modifier la matrice (%s ligne)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, n);
  BEGIN
    INSERT INTO public.role_permissions (role_id, permission_id, scope)
    SELECT role_id, permission_id, 'all' FROM public.role_permissions WHERE id = rp_drh;
    ok := false;
  EXCEPTION WHEN others THEN ok := true; END;
  total := total + 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] drh ne peut pas ajouter de droit', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);

  PERFORM pg_temp.as_admin();
  RAISE EXCEPTION E'RÉSULTATS : % vérifications, % échec(s)%', total, failed, out;
END $$;
