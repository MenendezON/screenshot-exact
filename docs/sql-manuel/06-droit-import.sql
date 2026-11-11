-- 06-droit-import.sql — action « import » de la ressource import_export, réservée à drh et gestionnaire_rh
-- Idempotent. Le bouton « Importer » s'affichera alors grâce à la matrice (au lieu du repli par rôle).
BEGIN;
INSERT INTO public.permissions (resource, action, label)
SELECT 'import_export', 'import', 'Import et export'
WHERE NOT EXISTS (SELECT 1 FROM public.permissions WHERE resource = 'import_export' AND action = 'import');

UPDATE public.permissions SET label = 'Import et export' WHERE resource = 'import_export' AND label <> 'Import et export';

INSERT INTO public.role_permissions (role_id, permission_id, scope)
SELECT r.id, p.id, 'all'
FROM unnest(ARRAY['drh','gestionnaire_rh']::public.app_role[]) AS c(role_code)
JOIN public.roles r ON r.code = c.role_code AND r.archived_at IS NULL
JOIN public.permissions p ON p.resource = 'import_export' AND p.action = 'import'
WHERE NOT EXISTS (SELECT 1 FROM public.role_permissions x WHERE x.role_id = r.id AND x.permission_id = p.id AND x.archived_at IS NULL);
COMMIT;
