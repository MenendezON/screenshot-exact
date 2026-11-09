-- Aucune suppression physique, aucun accès anonyme : privilèges explicites et minimaux.
REVOKE ALL ON public.audit_log, public.profiles, public.user_roles, public.settings FROM anon;
REVOKE ALL ON public.audit_log, public.profiles, public.user_roles, public.settings FROM authenticated;

GRANT SELECT ON public.audit_log TO authenticated;
GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE (full_name) ON public.profiles TO authenticated;
GRANT SELECT, INSERT ON public.user_roles TO authenticated;
GRANT UPDATE (role, archived_at) ON public.user_roles TO authenticated;
GRANT SELECT ON public.settings TO authenticated;
GRANT UPDATE (value) ON public.settings TO authenticated;

-- Tables futures : jamais de DELETE/TRUNCATE accordé par défaut aux clients.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE DELETE, TRUNCATE ON TABLES FROM anon, authenticated;
