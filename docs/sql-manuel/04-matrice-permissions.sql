-- 04-matrice-permissions.sql — édition de la matrice role_permissions par admin_it + garde-fou anti-verrouillage
-- Idempotent. Seul users:edit (admin_it) peut modifier ; pas de DELETE (archivage seulement).
BEGIN;

GRANT INSERT, UPDATE (scope, archived_at) ON public.role_permissions TO authenticated;
GRANT INSERT ON public.role_permissions TO authenticated;

DROP POLICY IF EXISTS "Créer matrice" ON public.role_permissions;
DROP POLICY IF EXISTS "Modifier matrice" ON public.role_permissions;
CREATE POLICY "Créer matrice" ON public.role_permissions FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('users', 'edit'));
CREATE POLICY "Modifier matrice" ON public.role_permissions FOR UPDATE TO authenticated
  USING (public.has_permission('users', 'edit'))
  WITH CHECK (public.has_permission('users', 'edit'));

-- Garde-fou : admin_it garde users:view et users:edit au périmètre « all », non archivés
CREATE OR REPLACE FUNCTION public.role_permissions_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _role text; _res text; _act text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;   -- éditeur SQL / service_role : réparation possible
  SELECT r.code::text INTO _role FROM public.roles r WHERE r.id = NEW.role_id;
  SELECT p.resource, p.action INTO _res, _act FROM public.permissions p WHERE p.id = NEW.permission_id;
  IF _role = 'admin_it' AND _res = 'users' AND _act IN ('view','edit')
     AND (NEW.scope <> 'all' OR NEW.archived_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Impossible de retirer à l''administrateur IT le droit « % » sur les utilisateurs : il ne pourrait plus gérer les accès.', _act
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS role_permissions_guard ON public.role_permissions;
CREATE TRIGGER role_permissions_guard BEFORE INSERT OR UPDATE ON public.role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.role_permissions_guard();

-- Archivage : même contrôle que partout (déjà présent, recréé par sécurité)
DROP TRIGGER IF EXISTS role_permissions_archive_perm ON public.role_permissions;
CREATE TRIGGER role_permissions_archive_perm BEFORE UPDATE OF archived_at ON public.role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_archive_permission('users');
COMMIT;
