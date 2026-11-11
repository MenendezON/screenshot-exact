-- 01-colonnes.sql — colonnes manquantes + vue v_employee_current enrichie
-- Idempotent. À exécuter dans l'éditeur SQL Supabase (ou à faire exécuter par Lovable tel quel).
-- Testé sur PostgreSQL 16 local avec stubs Supabase (voir supabase/tests/README.md).
BEGIN;

-- 1. Employés : e-mail professionnel et nationalité (code ISO 3166-1 alpha-2)
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS professional_email text,
  ADD COLUMN IF NOT EXISTS nationality_code  text;

ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_nationality_code_check;
ALTER TABLE public.employees ADD CONSTRAINT employees_nationality_code_check
  CHECK (nationality_code IS NULL OR nationality_code ~ '^[A-Z]{2}$');
ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_professional_email_check;
ALTER TABLE public.employees ADD CONSTRAINT employees_professional_email_check
  CHECK (professional_email IS NULL OR professional_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');

-- 2. Rémunération rattachée à un contrat (même employé obligatoire)
ALTER TABLE public.compensation
  ADD COLUMN IF NOT EXISTS contract_id uuid REFERENCES public.contracts(id);
CREATE INDEX IF NOT EXISTS compensation_contract_idx ON public.compensation (contract_id);

CREATE OR REPLACE FUNCTION public.compensation_check_contract()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.contract_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.contracts c
    WHERE c.id = NEW.contract_id AND c.employee_id = NEW.employee_id
  ) THEN
    RAISE EXCEPTION 'Le contrat % n''appartient pas à l''employé %', NEW.contract_id, NEW.employee_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS compensation_check_contract ON public.compensation;
CREATE TRIGGER compensation_check_contract
  BEFORE INSERT OR UPDATE OF contract_id, employee_id ON public.compensation
  FOR EACH ROW EXECUTE FUNCTION public.compensation_check_contract();

-- Rattrapage : seulement si exactement un contrat actif couvre la date d'effet
UPDATE public.compensation k
SET contract_id = m.cid
FROM (
  SELECT k2.id AS kid, (array_agg(c.id))[1] AS cid
  FROM public.compensation k2
  JOIN public.contracts c
    ON c.employee_id = k2.employee_id AND c.archived_at IS NULL
   AND k2.effective_date >= c.start_date
   AND k2.effective_date <= COALESCE(c.terminated_on, c.end_date, 'infinity'::date)
  WHERE k2.contract_id IS NULL
  GROUP BY k2.id
  HAVING count(*) = 1
) m
WHERE k.id = m.kid;

-- 3. Documents : description courte
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_description_check;
ALTER TABLE public.documents ADD CONSTRAINT documents_description_check
  CHECK (description IS NULL OR length(description) <= 500);

-- 4. Vue : ajout en FIN de liste (CREATE OR REPLACE interdit de réordonner)
CREATE OR REPLACE VIEW public.v_employee_current WITH (security_invoker = true) AS
SELECT e.id AS employee_id,
    e.matricule, e.first_names, e.last_name, e.manager_id, e.birth_date, e.phone, e.email,
    e.archived_at,
    a.id AS assignment_id, a.org_unit_id, ou.name AS org_unit_name,
    a.job_title_id, jt.name AS job_title_name,
    a.category_id, cat.code AS category_code,
    a.status, a.start_date AS assignment_start,
    public.org_unit_ancestors(a.org_unit_id) AS org_unit_path,
    ps.site_id AS primary_site_id, s.name AS primary_site_name,
    COALESCE(st.site_ids, '{}'::uuid[]) AS site_ids,
    c.id AS contract_id, c.type AS contract_type, c.start_date AS contract_start,
    c.end_date AS contract_end, c.terminated_on AS contract_terminated_on,
    lx.exit_date, (lx.exit_date IS NULL) AS is_active,
    e.professional_email,
    e.nationality_code,
    GREATEST(e.updated_at, lc.last_child_change) AS last_change
FROM public.employees e
LEFT JOIN LATERAL (SELECT * FROM public.assignments x WHERE x.employee_id = e.id AND x.archived_at IS NULL
                   ORDER BY x.start_date DESC LIMIT 1) a ON true
LEFT JOIN public.org_units ou ON ou.id = a.org_unit_id
LEFT JOIN public.job_titles jt ON jt.id = a.job_title_id
LEFT JOIN public.categories cat ON cat.id = a.category_id
LEFT JOIN LATERAL (SELECT es.site_id FROM public.employee_sites es
                   WHERE es.employee_id = e.id AND es.is_primary AND es.archived_at IS NULL LIMIT 1) ps ON true
LEFT JOIN public.sites s ON s.id = ps.site_id
LEFT JOIN LATERAL (SELECT array_agg(es.site_id) AS site_ids
                   FROM public.employee_sites es WHERE es.employee_id = e.id AND es.archived_at IS NULL) st ON true
LEFT JOIN LATERAL (SELECT * FROM public.contracts x WHERE x.employee_id = e.id AND x.archived_at IS NULL
                   ORDER BY x.start_date DESC LIMIT 1) c ON true
LEFT JOIN LATERAL (SELECT x.exit_date FROM public.exits x
                   WHERE x.employee_id = e.id AND x.archived_at IS NULL
                     AND (c.start_date IS NULL OR x.exit_date >= c.start_date)
                   ORDER BY x.exit_date DESC LIMIT 1) lx ON true
-- last_change : lignes archivées comprises (un archivage est une modification) et rémunération
-- (la rémunération ne compte que si l'appelant peut la lire : la vue est security_invoker).
LEFT JOIN LATERAL (SELECT max(t.u) AS last_child_change FROM (
    SELECT updated_at AS u FROM public.assignments    WHERE employee_id = e.id
    UNION ALL SELECT updated_at FROM public.contracts      WHERE employee_id = e.id
    UNION ALL SELECT updated_at FROM public.employee_sites WHERE employee_id = e.id
    UNION ALL SELECT updated_at FROM public.exits          WHERE employee_id = e.id
    UNION ALL SELECT updated_at FROM public.compensation   WHERE employee_id = e.id) t) lc ON true;

GRANT SELECT ON public.v_employee_current TO authenticated;
COMMIT;
