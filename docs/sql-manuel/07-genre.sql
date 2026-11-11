-- 07-genre.sql — genre (sexe) de l'employé : colonne employees.gender ('F' ou 'M') et vue v_employee_current
-- Idempotent. Facultatif en base (les fiches existantes restent valides, à compléter progressivement).
BEGIN;

ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS gender text;
-- Valeur par défaut « M » pour les NOUVELLES fiches ; les fiches existantes ne sont pas modifiées.
ALTER TABLE public.employees ALTER COLUMN gender SET DEFAULT 'M';
ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_gender_check;
ALTER TABLE public.employees ADD CONSTRAINT employees_gender_check CHECK (gender IS NULL OR gender IN ('F','M'));

-- Vue : « gender » ajouté en FIN de liste (CREATE OR REPLACE interdit de réordonner les colonnes)
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
    GREATEST(e.updated_at, lc.last_child_change) AS last_change,
    e.gender
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
