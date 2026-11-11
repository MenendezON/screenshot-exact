-- 05-documents.sql — bucket privé, politiques de stockage, contraintes, versions, journal d'accès, expiration
-- Idempotent. Les contraintes sont posées NOT VALID : l'historique existant n'est pas contrôlé, les nouvelles lignes le sont.
BEGIN;

-- a) Bucket privé, 10 Mo, PDF/JPEG/PNG
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('employee-documents', 'employee-documents', false, 10485760, ARRAY['application/pdf','image/jpeg','image/png'])
ON CONFLICT (id) DO UPDATE
  SET public = false, file_size_limit = 10485760, allowed_mime_types = ARRAY['application/pdf','image/jpeg','image/png'];

-- b) Stockage : aucune lecture directe (URL signée par le serveur uniquement), dépôt resserré, pas d'UPDATE/DELETE client
DROP POLICY IF EXISTS "Lire les fichiers de documents visibles" ON storage.objects;
DROP POLICY IF EXISTS "Déposer un fichier de document" ON storage.objects;
CREATE POLICY "Déposer un fichier de document" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'employee-documents'
    AND name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}$'
    AND EXISTS (SELECT 1 FROM public.employees e WHERE e.id = ((storage.foldername(name))[1])::uuid)
    AND (public.has_permission_on('documents', 'create', ((storage.foldername(name))[1])::uuid)
      OR public.has_permission_on('confidential_documents', 'create', ((storage.foldername(name))[1])::uuid))
  );

-- c) Table documents : le client ne décide pas du format ni de la taille
ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_mime_check;
ALTER TABLE public.documents ADD CONSTRAINT documents_mime_check
  CHECK (mime_type IN ('application/pdf','image/jpeg','image/png')) NOT VALID;
ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_size_check;
ALTER TABLE public.documents ADD CONSTRAINT documents_size_check
  CHECK (size_bytes > 0 AND size_bytes <= 10485760) NOT VALID;
ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_path_check;
ALTER TABLE public.documents ADD CONSTRAINT documents_path_check
  CHECK (storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}$' AND split_part(storage_path, '/', 1) = employee_id::text) NOT VALID;

-- c bis + d) Contrôle de l'objet stocké et des versions, à l'insertion
CREATE OR REPLACE FUNCTION public.documents_before_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o record; prev record;
BEGIN
  SELECT metadata INTO o FROM storage.objects WHERE bucket_id = 'employee-documents' AND name = NEW.storage_path LIMIT 1;
  IF FOUND THEN
    IF o.metadata ->> 'size' IS NOT NULL AND (o.metadata ->> 'size')::bigint IS DISTINCT FROM NEW.size_bytes THEN
      RAISE EXCEPTION 'La taille déclarée ne correspond pas au fichier déposé.' USING ERRCODE = 'check_violation';
    END IF;
    IF o.metadata ->> 'mimetype' IS NOT NULL AND o.metadata ->> 'mimetype' IS DISTINCT FROM NEW.mime_type THEN
      RAISE EXCEPTION 'Le format déclaré ne correspond pas au fichier déposé.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.replaces_document_id IS NOT NULL THEN
    SELECT employee_id, document_type_id, version INTO prev FROM public.documents WHERE id = NEW.replaces_document_id;
    IF NOT FOUND OR prev.employee_id <> NEW.employee_id OR prev.document_type_id <> NEW.document_type_id THEN
      RAISE EXCEPTION 'Le document remplacé doit appartenir au même employé et être du même type.' USING ERRCODE = 'check_violation';
    END IF;
    NEW.version := prev.version + 1;
  ELSE
    NEW.version := 1;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS documents_before_insert ON public.documents;
CREATE TRIGGER documents_before_insert BEFORE INSERT ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.documents_before_insert();

-- Un document n'a qu'un seul successeur actif
CREATE UNIQUE INDEX IF NOT EXISTS documents_one_successor
  ON public.documents (replaces_document_id) WHERE replaces_document_id IS NOT NULL AND archived_at IS NULL;

-- e) Journal d'accès : insertion seule, ni modification ni suppression
REVOKE UPDATE, DELETE, TRUNCATE ON public.document_access_log FROM anon, authenticated;

-- f) Expiration : paramètre, destinataires, fonction quotidienne SÉPARÉE (celle des contrats n'est pas modifiée)
INSERT INTO public.settings (key, label, description, value, unit, sort_order)
SELECT 'document_expiry_notice_days', 'Délai de notification — expiration d''un document',
       'Nombre de jours avant l''échéance d''un document pour envoyer l''alerte.', 30, 'jours', 80
WHERE NOT EXISTS (SELECT 1 FROM public.settings WHERE key = 'document_expiry_notice_days');

ALTER TABLE public.notification_recipients DROP CONSTRAINT IF EXISTS notification_recipients_kind_check;
ALTER TABLE public.notification_recipients ADD CONSTRAINT notification_recipients_kind_check
  CHECK (kind IN ('contract_ending','retirement_upcoming','contract_to_regularize','document_expiring','*'));

INSERT INTO public.notification_recipients (kind, role)
SELECT 'document_expiring', r FROM unnest(ARRAY['drh','gestionnaire_rh']::public.app_role[]) r
WHERE NOT EXISTS (SELECT 1 FROM public.notification_recipients x
                  WHERE x.kind = 'document_expiring' AND x.role = r AND x.archived_at IS NULL);

CREATE OR REPLACE FUNCTION public.generate_document_notifications() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _days int; _email boolean; _count int;
BEGIN
  SELECT value INTO _days FROM public.settings WHERE key = 'document_expiry_notice_days' AND archived_at IS NULL;
  _days := COALESCE(_days, 30);
  SELECT COALESCE(bool_or(s.value = 1), false) INTO _email
  FROM public.settings s WHERE s.key = 'notifications_email_enabled' AND s.archived_at IS NULL;

  WITH docs AS (
    SELECT d.id AS document_id, d.employee_id, d.expires_on, dt.name AS document_type,
           (dt.confidentiality = 'confidential') AS confidential,
           e.first_names, e.last_name, (d.expires_on - current_date) AS days_remaining
    FROM public.documents d
    JOIN public.document_types dt ON dt.id = d.document_type_id
    JOIN public.employees e ON e.id = d.employee_id
    WHERE d.archived_at IS NULL AND e.archived_at IS NULL
      AND d.expires_on BETWEEN current_date AND current_date + _days
      AND NOT EXISTS (SELECT 1 FROM public.documents s WHERE s.replaces_document_id = d.id AND s.archived_at IS NULL)
  ),
  targets AS (
    SELECT DISTINCT ur.user_id, dd.*
    FROM docs dd
    JOIN public.notification_recipients nr ON nr.archived_at IS NULL AND nr.kind IN ('document_expiring','*')
    JOIN public.user_roles ur ON ur.role = nr.role AND ur.archived_at IS NULL
    JOIN public.profiles p ON p.id = ur.user_id AND p.archived_at IS NULL
    WHERE public.in_scope_for(ur.user_id, dd.employee_id)
      AND CASE WHEN dd.confidential
               THEN public.user_has_permission_on(ur.user_id, 'confidential_documents', 'view', dd.employee_id)
               ELSE public.user_has_permission_on(ur.user_id, 'documents', 'view', dd.employee_id) END
  ),
  ins AS (
    INSERT INTO public.notifications (user_id, kind, payload, dedupe_key)
    SELECT t.user_id, 'document_expiring',
           jsonb_build_object('employee_id', t.employee_id,
                              'employee_name', trim(t.first_names || ' ' || t.last_name),
                              'document_id', t.document_id, 'document_type', t.document_type,
                              'expires_on', t.expires_on, 'days_remaining', t.days_remaining),
           t.document_id::text || ':' || t.expires_on::text
    FROM targets t
    ON CONFLICT (user_id, kind, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
    RETURNING id, user_id
  ),
  outbox AS (
    INSERT INTO public.notification_outbox (notification_id, channel, recipient_email)
    SELECT ins.id, 'email', p.email FROM ins JOIN public.profiles p ON p.id = ins.user_id
    WHERE _email AND p.email IS NOT NULL AND p.email <> ''
    RETURNING 1
  )
  SELECT count(*) INTO _count FROM ins;
  RETURN _count;
END $$;
REVOKE EXECUTE ON FUNCTION public.generate_document_notifications() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_document_notifications() TO service_role;
COMMIT;
