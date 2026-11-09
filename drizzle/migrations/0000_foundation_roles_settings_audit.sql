-- =========================================================
-- Étape 1 : socle (rôles, profils, paramètres, journal d'audit)
-- =========================================================

-- ---------- Rôles ----------
CREATE TYPE public.app_role AS ENUM ('admin_rh', 'gestionnaire_rh', 'direction');

-- ---------- Colonnes d'audit communes ----------
CREATE OR REPLACE FUNCTION public.set_audit_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := now();
    NEW.updated_at := now();
    NEW.created_by := COALESCE(auth.uid(), NEW.created_by);
    NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by, NEW.created_by);
  ELSE
    NEW.id := OLD.id;
    NEW.created_at := OLD.created_at;
    NEW.created_by := OLD.created_by;
    NEW.updated_at := now();
    NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by);
  END IF;
  RETURN NEW;
END;
$$;

-- ---------- Journal d'audit (append-only) ----------
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  table_name text NOT NULL,
  record_id uuid,
  action text NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_data jsonb,
  new_data jsonb,
  changed_fields text[]
);
CREATE INDEX audit_log_created_at_idx ON public.audit_log (created_at DESC);
CREATE INDEX audit_log_table_record_idx ON public.audit_log (table_name, record_id);

GRANT SELECT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.log_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _old jsonb;
  _new jsonb;
  _fields text[];
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN _old := to_jsonb(OLD); END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN _new := to_jsonb(NEW); END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT array_agg(n.key ORDER BY n.key) INTO _fields
    FROM jsonb_each(_new) n
    WHERE n.key NOT IN ('updated_at', 'updated_by')
      AND (_old -> n.key) IS DISTINCT FROM n.value;
    IF _fields IS NULL THEN
      RETURN NEW; -- aucun changement réel
    END IF;
  END IF;

  INSERT INTO public.audit_log (created_by, table_name, record_id, action, old_data, new_data, changed_fields)
  VALUES (
    auth.uid(),
    TG_TABLE_NAME,
    COALESCE((_new ->> 'id')::uuid, (_old ->> 'id')::uuid),
    TG_OP,
    _old,
    _new,
    _fields
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.log_audit() FROM PUBLIC, anon, authenticated;

-- ---------- Profils ----------
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  archived_at timestamptz
);
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ---------- Rôles utilisateurs (un rôle actif par utilisateur) ----------
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  archived_at timestamptz,
  CONSTRAINT user_roles_user_id_key UNIQUE (user_id)
);
GRANT SELECT, INSERT, UPDATE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ---------- Fonctions de contrôle d'accès ----------
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role AND archived_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND archived_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS public.app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles
  WHERE user_id = auth.uid() AND archived_at IS NULL
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_any_role(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_any_role(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated, service_role;

-- ---------- Paramètres métier ----------
CREATE TABLE public.settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  value integer NOT NULL CHECK (value > 0),
  unit text NOT NULL CHECK (unit IN ('ans', 'mois', 'jours')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  archived_at timestamptz
);
GRANT SELECT, UPDATE ON public.settings TO authenticated;
GRANT ALL ON public.settings TO service_role;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- Seules les colonnes "value" (et l'archivage) sont modifiables depuis l'application
REVOKE UPDATE ON public.settings FROM authenticated;
GRANT UPDATE (value) ON public.settings TO authenticated;

-- ---------- Politiques RLS ----------
-- audit_log : lecture admin RH uniquement, aucune écriture client
CREATE POLICY "Admin RH lit le journal"
  ON public.audit_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin_rh'));

-- profiles
CREATE POLICY "Lire son profil ou admin RH"
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin_rh'));
CREATE POLICY "Modifier son profil ou admin RH"
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin_rh'))
  WITH CHECK (id = auth.uid() OR public.has_role(auth.uid(), 'admin_rh'));

-- profils : l'utilisateur ne peut changer que son nom ; email réservé au système
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (full_name) ON public.profiles TO authenticated;

-- user_roles
CREATE POLICY "Lire son rôle ou admin RH"
  ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin_rh'));
CREATE POLICY "Admin RH attribue les rôles"
  ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin_rh'));
CREATE POLICY "Admin RH modifie les rôles"
  ON public.user_roles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin_rh'))
  WITH CHECK (public.has_role(auth.uid(), 'admin_rh'));

-- settings
CREATE POLICY "Utilisateurs avec rôle lisent les paramètres"
  ON public.settings FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid()));
CREATE POLICY "Admin RH modifie les paramètres"
  ON public.settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin_rh'))
  WITH CHECK (public.has_role(auth.uid(), 'admin_rh'));

-- ---------- Garde-fou : jamais sans administrateur RH ----------
CREATE OR REPLACE FUNCTION public.prevent_last_admin_removal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.role = 'admin_rh' AND OLD.archived_at IS NULL
     AND (NEW.role <> 'admin_rh' OR NEW.archived_at IS NOT NULL)
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles
       WHERE role = 'admin_rh' AND archived_at IS NULL AND id <> OLD.id
     ) THEN
    RAISE EXCEPTION 'Impossible de retirer le dernier administrateur RH.';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.prevent_last_admin_removal() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER user_roles_keep_one_admin
  BEFORE UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_last_admin_removal();

-- ---------- Triggers d'audit ----------
CREATE TRIGGER profiles_set_audit BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_columns();
CREATE TRIGGER user_roles_set_audit BEFORE INSERT OR UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_columns();
CREATE TRIGGER settings_set_audit BEFORE INSERT OR UPDATE ON public.settings
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_columns();

CREATE TRIGGER profiles_log_audit AFTER INSERT OR UPDATE OR DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();
CREATE TRIGGER user_roles_log_audit AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();
CREATE TRIGGER settings_log_audit AFTER INSERT OR UPDATE OR DELETE ON public.settings
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

-- ---------- Création automatique du profil ; premier compte = admin RH ----------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', '')
  );

  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin_rh' AND archived_at IS NULL) THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin_rh');
  END IF;

  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------- Valeurs initiales des paramètres ----------
INSERT INTO public.settings (key, label, description, value, unit, sort_order) VALUES
  ('retirement_age', 'Âge de départ à la retraite', 'Sert au calcul de la date de retraite.', 60, 'ans', 10),
  ('fixed_term_max_months', 'Durée maximale d''un contrat à durée déterminée', 'S''applique aux CDD et aux contrats Consultant.', 24, 'mois', 20),
  ('notice_days_cdi', 'Délai de notification — CDI', 'Nombre de jours avant la date de retraite.', 60, 'jours', 30),
  ('notice_days_cdd', 'Délai de notification — CDD', 'Nombre de jours avant la date de fin de contrat.', 45, 'jours', 40),
  ('notice_days_stage', 'Délai de notification — Stage', 'Nombre de jours avant la date de fin de stage.', 35, 'jours', 50),
  ('notice_days_consultant', 'Délai de notification — Consultant', 'Nombre de jours avant la date de fin de contrat.', 45, 'jours', 60);
