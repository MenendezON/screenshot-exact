ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'admin_it';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'drh';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'paie';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'manager';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'auditeur';
COMMENT ON TYPE public.app_role IS 'Role codes. admin_rh is DEPRECATED (replaced by admin_it + drh).';
