-- Tests de docs/sql-manuel/05-documents.sql (après application, avec supabase/seed.sql).
-- Transaction annulée : se termine toujours par « RÉSULTATS ».
DO $$
DECLARE
  u_drh uuid := gen_random_uuid(); u_gest uuid := gen_random_uuid();
  e1 uuid; t_std uuid; t_conf uuid; d1 uuid; d2 uuid; d3 uuid; dconf uuid; dold uuid;
  n int; ok boolean; v int; total int := 0; failed int := 0; out text := '';
  p1 text; p2 text; p3 text; p4 text; p5 text;
BEGIN
  INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  VALUES (u_drh, '00000000-0000-0000-0000-000000000000','authenticated','authenticated','drh5@test.local','{"full_name":"drh"}',now(),now()),
         (u_gest, '00000000-0000-0000-0000-000000000000','authenticated','authenticated','gest5@test.local','{"full_name":"gest"}',now(),now());
  DELETE FROM public.user_roles WHERE user_id IN (u_drh, u_gest);
  INSERT INTO public.user_roles (user_id, role) VALUES (u_drh,'drh'),(u_gest,'gestionnaire_rh');
  SELECT id INTO e1 FROM public.employees WHERE matricule = 'DEMO009';
  SELECT id INTO t_std FROM public.document_types WHERE confidentiality = 'standard' AND archived_at IS NULL LIMIT 1;
  SELECT id INTO t_conf FROM public.document_types WHERE confidentiality = 'confidential' AND archived_at IS NULL LIMIT 1;
  p1 := e1 || '/' || gen_random_uuid(); p2 := e1 || '/' || gen_random_uuid(); p3 := e1 || '/' || gen_random_uuid();
  p4 := e1 || '/' || gen_random_uuid(); p5 := e1 || '/' || gen_random_uuid();

  INSERT INTO public.documents (employee_id, document_type_id, storage_path, file_name, mime_type, size_bytes, expires_on, version)
  VALUES (e1, t_std, p1, 'a.pdf', 'application/pdf', 1000, current_date + 10, 99) RETURNING id, version INTO d1, v;
  total := total + 1; ok := v = 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] version forcée à 1 (le client demandait 99) : %s', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, v);

  INSERT INTO public.documents (employee_id, document_type_id, storage_path, file_name, mime_type, size_bytes, replaces_document_id, expires_on)
  VALUES (e1, t_std, p2, 'b.pdf', 'application/pdf', 1000, d1, current_date + 400) RETURNING id, version INTO d2, v;
  total := total + 1; ok := v = 2; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] remplacement : version 2 (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, v);

  BEGIN
    INSERT INTO public.documents (employee_id, document_type_id, storage_path, file_name, mime_type, size_bytes, replaces_document_id)
    VALUES (e1, t_std, p3, 'c.pdf', 'application/pdf', 1000, d1); ok := false;
  EXCEPTION WHEN unique_violation THEN ok := true; END;
  total := total + 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] un seul successeur actif par document', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);

  BEGIN
    INSERT INTO public.documents (employee_id, document_type_id, storage_path, file_name, mime_type, size_bytes)
    VALUES (e1, t_std, p3, 'c.docx', 'application/msword', 1000); ok := false;
  EXCEPTION WHEN check_violation THEN ok := true; END;
  total := total + 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] format Word refusé', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);

  BEGIN
    INSERT INTO public.documents (employee_id, document_type_id, storage_path, file_name, mime_type, size_bytes)
    VALUES (e1, t_std, 'mauvais/chemin', 'c.pdf', 'application/pdf', 1000); ok := false;
  EXCEPTION WHEN check_violation THEN ok := true; END;
  total := total + 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] chemin invalide refusé', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);

  INSERT INTO storage.objects (bucket_id, name, metadata) VALUES ('employee-documents', p4, '{"size":"500","mimetype":"application/pdf"}');
  BEGIN
    INSERT INTO public.documents (employee_id, document_type_id, storage_path, file_name, mime_type, size_bytes)
    VALUES (e1, t_std, p4, 'd.pdf', 'application/pdf', 9000); ok := false;
  EXCEPTION WHEN check_violation THEN ok := true; END;
  total := total + 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] taille déclarée différente du fichier refusée', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);

  BEGIN
    INSERT INTO public.documents (employee_id, document_type_id, storage_path, file_name, mime_type, size_bytes, replaces_document_id)
    VALUES (e1, t_conf, p5, 'e.pdf', 'application/pdf', 1000, d1); ok := false;
  EXCEPTION WHEN check_violation OR unique_violation THEN ok := true; END;
  total := total + 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] remplacement par un autre type refusé', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);

  -- Notifications : d1 (remplacé) ne notifie plus, d2 expire dans 400 jours (hors délai)
  SELECT public.generate_document_notifications() INTO n;
  SELECT count(*) INTO n FROM public.notifications WHERE kind = 'document_expiring' AND payload ->> 'document_id' = d1::text;
  total := total + 1; ok := n = 0; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] document remplacé : plus d''alerte (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, n);

  INSERT INTO public.documents (employee_id, document_type_id, storage_path, file_name, mime_type, size_bytes, expires_on)
  VALUES (e1, t_std, p5, 'f.pdf', 'application/pdf', 1000, current_date + 5) RETURNING id INTO d3;
  PERFORM public.generate_document_notifications();
  SELECT count(DISTINCT user_id) INTO n FROM public.notifications WHERE kind = 'document_expiring' AND payload ->> 'document_id' = d3::text AND user_id IN (u_drh, u_gest);
  total := total + 1; ok := n = 2; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] drh et gestionnaire_rh alertés pour un document standard (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, n);
  SELECT count(*) INTO n FROM public.notifications WHERE kind = 'document_expiring' AND payload ->> 'document_id' = d3::text;
  PERFORM public.generate_document_notifications();
  total := total + 1; ok := (SELECT count(*) FROM public.notifications WHERE kind = 'document_expiring' AND payload ->> 'document_id' = d3::text) = n;
  IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] pas de doublon au second passage', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);
  total := total + 1; ok := (SELECT bool_and(payload::text NOT LIKE '%f.pdf%') FROM public.notifications WHERE kind = 'document_expiring');
  IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] le nom de fichier n''apparaît jamais dans l''alerte', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);

  total := total + 1; ok := NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'storage.objects'::regclass AND polname = 'Lire les fichiers de documents visibles');
  IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] plus aucune lecture directe du stockage pour les clients', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);

  RAISE EXCEPTION E'RÉSULTATS : % vérifications, % échec(s)%', total, failed, out;
END $$;
