-- 02-appreciations.sql — table employee_reviews, permissions « reviews », RLS, audit expurgé
-- Dépend de : rien d'autre (01 n'est pas requis). Idempotent.
BEGIN;

-- 1. Permissions
INSERT INTO public.permissions (resource, action, label)
SELECT 'reviews', a.action, a.label
FROM (VALUES ('view','Appréciations : voir'), ('create','Appréciations : créer'),
             ('edit','Appréciations : modifier'), ('archive','Appréciations : archiver')) a(action, label)
WHERE NOT EXISTS (SELECT 1 FROM public.permissions p WHERE p.resource='reviews' AND p.action=a.action);

-- 2. Table
CREATE TABLE IF NOT EXISTS public.employee_reviews (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id  uuid NOT NULL REFERENCES public.employees(id),
  contract_id  uuid REFERENCES public.contracts(id),
  kind         text NOT NULL CHECK (kind IN ('contract','performance','other')),
  review_date  date NOT NULL,
  rating       smallint CHECK (rating BETWEEN 1 AND 5),
  title        text CHECK (title IS NULL OR length(title) <= 150),
  comment      text NOT NULL CHECK (length(comment) BETWEEN 1 AND 4000),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid,
  updated_by   uuid,
  archived_at  timestamptz
);
CREATE INDEX IF NOT EXISTS employee_reviews_employee_idx ON public.employee_reviews (employee_id, review_date DESC);

-- 3. Le contrat doit appartenir au même employé
CREATE OR REPLACE FUNCTION public.reviews_check_contract() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.contract_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.contracts c WHERE c.id = NEW.contract_id AND c.employee_id = NEW.employee_id) THEN
    RAISE EXCEPTION 'Le contrat n''appartient pas à cet employé' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

-- 4. Journal expurgé : ni le commentaire ni le titre ne sont recopiés dans audit_log
CREATE OR REPLACE FUNCTION public.log_review_audit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _old jsonb; _new jsonb; _fields text[];
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN _old := to_jsonb(OLD) - 'comment' - 'title'; END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN _new := to_jsonb(NEW) - 'comment' - 'title'; END IF;
  IF TG_OP = 'UPDATE' THEN
    SELECT array_agg(k ORDER BY k) INTO _fields FROM (
      SELECT n.key AS k FROM jsonb_each(to_jsonb(NEW)) n
      WHERE n.key NOT IN ('updated_at','updated_by')
        AND (to_jsonb(OLD) -> n.key) IS DISTINCT FROM n.value) d;
    IF _fields IS NULL THEN RETURN NEW; END IF;
    _fields := array_remove(array_remove(_fields, 'comment'), 'title')
               || CASE WHEN OLD.comment IS DISTINCT FROM NEW.comment THEN ARRAY['comment'] ELSE '{}'::text[] END;
  END IF;
  INSERT INTO public.audit_log (created_by, table_name, record_id, action, old_data, new_data, changed_fields, employee_id)
  VALUES (auth.uid(), TG_TABLE_NAME, COALESCE(NEW.id, OLD.id), TG_OP, _old, _new, _fields,
          COALESCE(NEW.employee_id, OLD.employee_id));
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS employee_reviews_set_audit ON public.employee_reviews;
CREATE TRIGGER employee_reviews_set_audit BEFORE INSERT OR UPDATE ON public.employee_reviews
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_columns();
DROP TRIGGER IF EXISTS employee_reviews_check_contract ON public.employee_reviews;
CREATE TRIGGER employee_reviews_check_contract BEFORE INSERT OR UPDATE OF contract_id, employee_id ON public.employee_reviews
  FOR EACH ROW EXECUTE FUNCTION public.reviews_check_contract();
DROP TRIGGER IF EXISTS employee_reviews_archive_perm ON public.employee_reviews;
CREATE TRIGGER employee_reviews_archive_perm BEFORE UPDATE OF archived_at ON public.employee_reviews
  FOR EACH ROW EXECUTE FUNCTION public.enforce_archive_permission('reviews');
DROP TRIGGER IF EXISTS employee_reviews_log_audit ON public.employee_reviews;
CREATE TRIGGER employee_reviews_log_audit AFTER INSERT OR UPDATE OR DELETE ON public.employee_reviews
  FOR EACH ROW EXECUTE FUNCTION public.log_review_audit();

-- 5. RLS : personne ne voit ses propres appréciations
CREATE OR REPLACE FUNCTION public.review_is_mine(_employee_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.employee_id = _employee_id);
$$;

ALTER TABLE public.employee_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Voir appréciations" ON public.employee_reviews;
DROP POLICY IF EXISTS "Créer appréciations" ON public.employee_reviews;
DROP POLICY IF EXISTS "Modifier appréciations" ON public.employee_reviews;
CREATE POLICY "Voir appréciations" ON public.employee_reviews FOR SELECT TO authenticated
  USING (public.has_permission_on('reviews','view',employee_id) AND NOT public.review_is_mine(employee_id));
CREATE POLICY "Créer appréciations" ON public.employee_reviews FOR INSERT TO authenticated
  WITH CHECK (public.has_permission_on('reviews','create',employee_id) AND NOT public.review_is_mine(employee_id));
CREATE POLICY "Modifier appréciations" ON public.employee_reviews FOR UPDATE TO authenticated
  USING ((public.has_permission_on('reviews','edit',employee_id) OR public.has_permission_on('reviews','archive',employee_id))
         AND NOT public.review_is_mine(employee_id))
  WITH CHECK ((public.has_permission_on('reviews','edit',employee_id) OR public.has_permission_on('reviews','archive',employee_id))
         AND NOT public.review_is_mine(employee_id));
REVOKE ALL ON public.employee_reviews FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.employee_reviews TO authenticated;
GRANT ALL ON public.employee_reviews TO service_role;

-- 6. Droits par rôle (décisions validées)
INSERT INTO public.role_permissions (role_id, permission_id, scope)
SELECT r.id, p.id, m.scope
FROM (VALUES
  ('drh','view','all'),('drh','create','all'),('drh','edit','all'),('drh','archive','all'),
  ('gestionnaire_rh','view','all'),('gestionnaire_rh','create','all'),('gestionnaire_rh','edit','all'),
  ('manager','view','team'),
  ('direction','view','all'),
  ('auditeur','view','all')
) m(role_code, action, scope)
JOIN public.roles r ON r.code = m.role_code::public.app_role AND r.archived_at IS NULL
JOIN public.permissions p ON p.resource='reviews' AND p.action = m.action
WHERE NOT EXISTS (SELECT 1 FROM public.role_permissions x WHERE x.role_id=r.id AND x.permission_id=p.id AND x.archived_at IS NULL);

-- 7. Visibilité dans le journal d'audit (même règle que la table)
CREATE OR REPLACE FUNCTION public.can_read_audit_table(_table text, _employee_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE _table
    WHEN 'compensation' THEN public.has_permission_on('compensation', 'view', _employee_id)
    WHEN 'employee_sensitive' THEN public.has_permission_on('sensitive_data', 'view', _employee_id)
    WHEN 'exits' THEN public.has_permission_on('sensitive_data', 'view', _employee_id)
    WHEN 'documents' THEN public.has_permission_on('confidential_documents', 'view', _employee_id)
    WHEN 'document_access_log' THEN public.has_permission('confidential_documents', 'view')
    WHEN 'employees' THEN public.has_permission_on('employees', 'view', _employee_id)
    WHEN 'employee_sites' THEN public.has_permission_on('employees', 'view', _employee_id)
    WHEN 'assignments' THEN public.has_permission_on('assignments', 'view', _employee_id)
    WHEN 'contracts' THEN public.has_permission_on('contracts', 'view', _employee_id)
    WHEN 'employee_reviews' THEN public.has_permission_on('reviews', 'view', _employee_id) AND NOT public.review_is_mine(_employee_id)
    WHEN 'notification_outbox' THEN false
    ELSE true
  END;
$$;
COMMIT;
