-- =====================================================================
-- Étapes 1 et 2 : schéma complet, matrice de permissions, RLS
-- =====================================================================
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

CREATE TYPE public.employee_status AS ENUM ('cadre', 'agent_maitrise', 'employe', 'ouvrier', 'stagiaire');
CREATE TYPE public.contract_type AS ENUM ('cdi', 'cdd', 'stage', 'consultant');
CREATE TYPE public.org_unit_type AS ENUM ('direction', 'departement', 'service', 'equipe');

-- ---------------------------------------------------------------------
-- Accès : rôles, permissions, périmètres
-- ---------------------------------------------------------------------
CREATE TABLE public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code public.app_role NOT NULL UNIQUE,
  label text NOT NULL,
  requires_mfa boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, archived_at timestamptz
);
CREATE TABLE public.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource text NOT NULL,
  action text NOT NULL CHECK (action IN ('view', 'create', 'edit', 'archive', 'export', 'import')),
  label text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, archived_at timestamptz,
  UNIQUE (resource, action)
);
CREATE TABLE public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES public.roles(id),
  permission_id uuid NOT NULL REFERENCES public.permissions(id),
  scope text NOT NULL DEFAULT 'all' CHECK (scope IN ('all', 'site', 'unit', 'team', 'self')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, archived_at timestamptz,
  UNIQUE (role_id, permission_id)
);

ALTER TABLE public.user_roles DROP CONSTRAINT user_roles_user_id_key;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);

-- ---------------------------------------------------------------------
-- Référentiels
-- ---------------------------------------------------------------------
CREATE TABLE public.sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, archived_at timestamptz
);
CREATE UNIQUE INDEX sites_name_key ON public.sites (lower(name));

CREATE TABLE public.org_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  type public.org_unit_type NOT NULL,
  parent_id uuid REFERENCES public.org_units(id),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, archived_at timestamptz,
  CHECK (parent_id IS NULL OR parent_id <> id)
);
CREATE INDEX org_units_parent_idx ON public.org_units (parent_id);

CREATE TABLE public.job_titles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, archived_at timestamptz
);
CREATE UNIQUE INDEX job_titles_name_key ON public.job_titles (upper(name));

CREATE TABLE public.job_title_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alias text NOT NULL CHECK (length(trim(alias)) > 0),
  job_title_id uuid NOT NULL REFERENCES public.job_titles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, archived_at timestamptz
);
CREATE UNIQUE INDEX job_title_aliases_alias_key ON public.job_title_aliases (upper(alias)) WHERE archived_at IS NULL;

CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL CHECK (length(trim(code)) > 0),
  default_status public.employee_status NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, archived_at timestamptz
);
CREATE UNIQUE INDEX categories_code_key ON public.categories (upper(code));

CREATE TABLE public.exit_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  is_confidential boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, archived_at timestamptz
);
CREATE UNIQUE INDEX exit_reasons_name_key ON public.exit_reasons (lower(name));

CREATE TABLE public.document_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  confidentiality text NOT NULL DEFAULT 'standard' CHECK (confidentiality IN ('standard', 'confidential')),
  retention_months integer CHECK (retention_months IS NULL OR retention_months > 0),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, archived_at timestamptz
);
CREATE UNIQUE INDEX document_types_name_key ON public.document_types (lower(name));

-- ---------------------------------------------------------------------
-- Employés
-- ---------------------------------------------------------------------
CREATE TABLE public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  matricule text NOT NULL CHECK (length(trim(matricule)) > 0),
  first_names text NOT NULL CHECK (length(trim(first_names)) > 0),
  last_name text NOT NULL CHECK (length(trim(last_name)) > 0),
  birth_date date,
  birth_place text,
  address text,
  marital_status text CHECK (marital_status IN ('celibataire', 'marie', 'divorce', 'veuf')),
  children_count integer NOT NULL DEFAULT 0 CHECK (children_count >= 0),
  phone text,
  email text,
  manager_id uuid REFERENCES public.employees(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, archived_at timestamptz,
  CONSTRAINT employees_manager_not_self CHECK (manager_id IS NULL OR manager_id <> id)
);
CREATE UNIQUE INDEX employees_matricule_key ON public.employees (matricule);
CREATE INDEX employees_manager_idx ON public.employees (manager_id);
CREATE INDEX employees_last_name_idx ON public.employees (lower(last_name));

CREATE TABLE public.employee_sensitive (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL UNIQUE REFERENCES public.employees(id),
  id_document_type text CHECK (id_document_type IN ('cni', 'passport', 'consular_card')),
  id_document_number text,
  emergency_contact_name text,
  emergency_contact_relation text,
  emergency_contact_phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, archived_at timestamptz
);

CREATE TABLE public.employee_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id),
  site_id uuid NOT NULL REFERENCES public.sites(id),
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, archived_at timestamptz
);
CREATE UNIQUE INDEX employee_sites_unique ON public.employee_sites (employee_id, site_id) WHERE archived_at IS NULL;
CREATE UNIQUE INDEX employee_sites_one_primary ON public.employee_sites (employee_id) WHERE is_primary AND archived_at IS NULL;

CREATE TABLE public.assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id),
  org_unit_id uuid REFERENCES public.org_units(id),
  job_title_id uuid REFERENCES public.job_titles(id),
  category_id uuid REFERENCES public.categories(id),
  status public.employee_status,
  start_date date NOT NULL,
  end_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, archived_at timestamptz,
  CHECK (end_date IS NULL OR end_date >= start_date),
  CONSTRAINT assignments_no_overlap EXCLUDE USING gist (
    employee_id WITH =, daterange(start_date, end_date, '[]') WITH &&
  ) WHERE (archived_at IS NULL)
);
CREATE INDEX assignments_employee_idx ON public.assignments (employee_id, start_date DESC);

CREATE TABLE public.contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id),
  type public.contract_type NOT NULL,
  start_date date NOT NULL,
  duration_months integer,
  end_date date,
  terminated_on date,
  previous_contract_id uuid REFERENCES public.contracts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, archived_at timestamptz,
  CONSTRAINT contracts_duration_rule CHECK (
    (type = 'cdi' AND duration_months IS NULL) OR (type <> 'cdi' AND duration_months IS NOT NULL AND duration_months > 0)
  ),
  CONSTRAINT contracts_no_overlap EXCLUDE USING gist (
    employee_id WITH =, daterange(start_date, COALESCE(terminated_on, end_date), '[]') WITH &&
  ) WHERE (archived_at IS NULL)
);
CREATE INDEX contracts_employee_idx ON public.contracts (employee_id, start_date DESC);
COMMENT ON COLUMN public.contracts.terminated_on IS 'Set automatically when an exit is recorded during the contract.';

CREATE TABLE public.exits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id),
  exit_date date NOT NULL,
  reason_id uuid NOT NULL REFERENCES public.exit_reasons(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, archived_at timestamptz
);
CREATE INDEX exits_employee_idx ON public.exits (employee_id, exit_date DESC);

CREATE TABLE public.compensation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id),
  net_monthly_salary_fcfa bigint NOT NULL CHECK (net_monthly_salary_fcfa > 0),
  effective_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, archived_at timestamptz
);
CREATE UNIQUE INDEX compensation_unique_date ON public.compensation (employee_id, effective_date) WHERE archived_at IS NULL;

-- ---------------------------------------------------------------------
-- Documents
-- ---------------------------------------------------------------------
CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id),
  contract_id uuid REFERENCES public.contracts(id),
  document_type_id uuid NOT NULL REFERENCES public.document_types(id),
  storage_path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  document_date date,
  expires_on date,
  version integer NOT NULL DEFAULT 1,
  replaces_document_id uuid REFERENCES public.documents(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, archived_at timestamptz
);
CREATE INDEX documents_employee_idx ON public.documents (employee_id);

CREATE TABLE public.document_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id),
  user_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('view', 'download')),
  at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Accès (suite) et notifications
-- ---------------------------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN employee_id uuid REFERENCES public.employees(id);

CREATE TABLE public.user_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  site_id uuid REFERENCES public.sites(id),
  org_unit_id uuid REFERENCES public.org_units(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, archived_at timestamptz,
  CHECK ((site_id IS NULL) <> (org_unit_id IS NULL))
);

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  kind text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, archived_at timestamptz
);

ALTER TABLE public.audit_log ADD COLUMN employee_id uuid;
CREATE INDEX audit_log_employee_idx ON public.audit_log (employee_id, created_at DESC);

ALTER TABLE public.settings DROP CONSTRAINT settings_unit_check;
ALTER TABLE public.settings ADD CONSTRAINT settings_unit_check CHECK (unit IN ('ans', 'mois', 'jours', 'minutes'));

-- ---------------------------------------------------------------------
-- Fonctions d'autorisation
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mfa_ok()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.code = ur.role
    WHERE ur.user_id = auth.uid() AND ur.archived_at IS NULL AND r.requires_mfa
  ) OR COALESCE(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;

CREATE OR REPLACE FUNCTION public.has_permission(_resource text, _action text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.mfa_ok() AND EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.code = ur.role AND r.archived_at IS NULL
    JOIN public.role_permissions rp ON rp.role_id = r.id AND rp.archived_at IS NULL
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE ur.user_id = auth.uid() AND ur.archived_at IS NULL
      AND p.resource = _resource AND p.action = _action
  );
$$;

CREATE OR REPLACE FUNCTION public.org_unit_ancestors(_unit_id uuid)
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH RECURSIVE up AS (
    SELECT id, parent_id, 1 AS depth FROM public.org_units WHERE id = _unit_id
    UNION ALL
    SELECT o.id, o.parent_id, up.depth + 1 FROM public.org_units o JOIN up ON o.id = up.parent_id
    WHERE up.depth < 50
  )
  SELECT COALESCE(array_agg(id), '{}') FROM up;
$$;

CREATE OR REPLACE FUNCTION public.org_unit_ancestor_of_type(_unit_id uuid, _type public.org_unit_type)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH RECURSIVE up AS (
    SELECT id, parent_id, type, 1 AS depth FROM public.org_units WHERE id = _unit_id
    UNION ALL
    SELECT o.id, o.parent_id, o.type, up.depth + 1 FROM public.org_units o JOIN up ON o.id = up.parent_id
    WHERE up.depth < 50
  )
  SELECT id FROM up WHERE type = _type ORDER BY depth LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_subordinate(_employee_id uuid, _manager_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH RECURSIVE up AS (
    SELECT manager_id, 1 AS depth FROM public.employees WHERE id = _employee_id
    UNION ALL
    SELECT e.manager_id, up.depth + 1 FROM public.employees e JOIN up ON e.id = up.manager_id
    WHERE up.depth < 50 AND up.manager_id IS NOT NULL
  )
  SELECT EXISTS (SELECT 1 FROM up WHERE manager_id = _manager_id);
$$;

CREATE OR REPLACE FUNCTION public.has_permission_on(_resource text, _action text, _employee_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _scope text;
  _my_employee uuid;
BEGIN
  IF _uid IS NULL OR NOT public.mfa_ok() THEN RETURN false; END IF;

  FOR _scope IN
    SELECT DISTINCT rp.scope
    FROM public.user_roles ur
    JOIN public.roles r ON r.code = ur.role AND r.archived_at IS NULL
    JOIN public.role_permissions rp ON rp.role_id = r.id AND rp.archived_at IS NULL
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE ur.user_id = _uid AND ur.archived_at IS NULL
      AND p.resource = _resource AND p.action = _action
  LOOP
    IF _scope = 'all' THEN RETURN true; END IF;

    IF _scope = 'site' AND EXISTS (
      SELECT 1 FROM public.employee_sites es
      JOIN public.user_scopes us ON us.site_id = es.site_id AND us.user_id = _uid AND us.archived_at IS NULL
      WHERE es.employee_id = _employee_id AND es.archived_at IS NULL
    ) THEN RETURN true; END IF;

    IF _scope = 'unit' AND EXISTS (
      SELECT 1 FROM public.user_scopes us
      WHERE us.user_id = _uid AND us.archived_at IS NULL AND us.org_unit_id IS NOT NULL
        AND us.org_unit_id = ANY (public.org_unit_ancestors((
          SELECT a.org_unit_id FROM public.assignments a
          WHERE a.employee_id = _employee_id AND a.archived_at IS NULL
          ORDER BY a.start_date DESC LIMIT 1
        )))
    ) THEN RETURN true; END IF;

    IF _scope IN ('team', 'self') THEN
      IF _my_employee IS NULL THEN
        SELECT employee_id INTO _my_employee FROM public.profiles WHERE id = _uid;
      END IF;
      IF _my_employee IS NOT NULL THEN
        IF _scope = 'self' AND _employee_id = _my_employee THEN RETURN true; END IF;
        IF _scope = 'team' AND public.is_subordinate(_employee_id, _my_employee) THEN RETURN true; END IF;
      END IF;
    END IF;
  END LOOP;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.in_scope(_employee_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_permission_on('employees', 'view', _employee_id);
$$;

CREATE OR REPLACE FUNCTION public.is_confidential_document_type(_type_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT confidentiality = 'confidential' FROM public.document_types WHERE id = _type_id), false);
$$;

CREATE OR REPLACE FUNCTION public.is_confidential_exit_reason(_reason_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT is_confidential FROM public.exit_reasons WHERE id = _reason_id), false);
$$;

CREATE OR REPLACE FUNCTION public.get_my_roles()
RETURNS SETOF public.app_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.user_roles WHERE user_id = auth.uid() AND archived_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.get_my_permissions()
RETURNS TABLE (resource text, action text, scope text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT p.resource, p.action, rp.scope
  FROM public.user_roles ur
  JOIN public.roles r ON r.code = ur.role AND r.archived_at IS NULL
  JOIN public.role_permissions rp ON rp.role_id = r.id AND rp.archived_at IS NULL
  JOIN public.permissions p ON p.id = rp.permission_id
  WHERE ur.user_id = auth.uid() AND ur.archived_at IS NULL AND public.mfa_ok();
$$;

CREATE OR REPLACE FUNCTION public.my_mfa_required()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.code = ur.role
    WHERE ur.user_id = auth.uid() AND ur.archived_at IS NULL AND r.requires_mfa
  );
$$;

CREATE OR REPLACE FUNCTION public.get_user_names(_ids uuid[])
RETURNS TABLE (id uuid, full_name text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, COALESCE(NULLIF(p.full_name, ''), p.email)
  FROM public.profiles p
  WHERE p.id = ANY (_ids) AND public.has_any_role(auth.uid());
$$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'mfa_ok()', 'has_permission(text, text)', 'org_unit_ancestors(uuid)',
    'org_unit_ancestor_of_type(uuid, public.org_unit_type)', 'is_subordinate(uuid, uuid)',
    'has_permission_on(text, text, uuid)', 'in_scope(uuid)', 'is_confidential_document_type(uuid)',
    'is_confidential_exit_reason(uuid)', 'get_my_roles()', 'get_my_permissions()',
    'my_mfa_required()', 'get_user_names(uuid[])'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated, service_role', f);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- Règles de gestion (triggers)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_archive_permission()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND OLD.archived_at IS DISTINCT FROM NEW.archived_at
     AND NOT public.has_permission(TG_ARGV[0], 'archive') THEN
    RAISE EXCEPTION 'Archivage non autorisé.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_employee()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.matricule := upper(trim(NEW.matricule));
  NEW.last_name := trim(NEW.last_name);
  NEW.first_names := trim(NEW.first_names);
  IF TG_OP = 'UPDATE' AND NEW.matricule <> OLD.matricule THEN
    RAISE EXCEPTION 'Le matricule est permanent et ne peut pas être modifié.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_manager_loop()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.manager_id IS NOT NULL THEN
    IF NEW.manager_id = NEW.id THEN
      RAISE EXCEPTION 'Un employé ne peut pas être son propre responsable.';
    END IF;
    IF public.is_subordinate(NEW.manager_id, NEW.id) THEN
      RAISE EXCEPTION 'Boucle hiérarchique : ce responsable dépend déjà de cet employé.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_org_unit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL AND NEW.id = ANY (public.org_unit_ancestors(NEW.parent_id)) THEN
    RAISE EXCEPTION 'Déplacement impossible : une unité ne peut pas être placée sous l''une de ses sous-unités.';
  END IF;
  IF NEW.parent_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.org_units WHERE id = NEW.parent_id AND archived_at IS NOT NULL) THEN
    RAISE EXCEPTION 'L''unité parente est archivée.';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.archived_at IS NOT NULL AND OLD.archived_at IS NULL
     AND EXISTS (SELECT 1 FROM public.org_units WHERE parent_id = NEW.id AND archived_at IS NULL) THEN
    RAISE EXCEPTION 'Archivez d''abord les sous-unités de cette unité.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.compute_contract()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _max integer;
BEGIN
  IF NEW.type = 'cdi' THEN
    NEW.duration_months := NULL;
    NEW.end_date := NULL;
  ELSE
    SELECT value INTO _max FROM public.settings WHERE key = 'fixed_term_max_months' AND archived_at IS NULL;
    IF NEW.duration_months IS NULL OR NEW.duration_months <= 0 THEN
      RAISE EXCEPTION 'La durée en mois est obligatoire pour ce type de contrat.';
    END IF;
    IF _max IS NOT NULL AND NEW.duration_months > _max THEN
      RAISE EXCEPTION 'Durée maximale dépassée : % mois au plus.', _max;
    END IF;
    NEW.end_date := (NEW.start_date + make_interval(months => NEW.duration_months) - interval '1 day')::date;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_previous_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _prev public.assignments;
BEGIN
  SELECT * INTO _prev FROM public.assignments
  WHERE employee_id = NEW.employee_id AND archived_at IS NULL AND id <> NEW.id
  ORDER BY start_date DESC LIMIT 1;
  IF FOUND THEN
    IF NEW.start_date <= _prev.start_date THEN
      RAISE EXCEPTION 'La nouvelle affectation doit commencer après le %.', to_char(_prev.start_date, 'DD/MM/YYYY');
    END IF;
    IF _prev.end_date IS NULL OR _prev.end_date >= NEW.start_date THEN
      UPDATE public.assignments SET end_date = NEW.start_date - 1 WHERE id = _prev.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_exit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _last_start date;
BEGIN
  SELECT max(start_date) INTO _last_start FROM public.contracts
  WHERE employee_id = NEW.employee_id AND archived_at IS NULL AND start_date <= NEW.exit_date;
  IF _last_start IS NULL THEN
    RAISE EXCEPTION 'Aucun contrat ne couvre cette date de sortie.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.exits WHERE employee_id = NEW.employee_id AND archived_at IS NULL
             AND id <> NEW.id AND exit_date >= _last_start) THEN
    RAISE EXCEPTION 'Une sortie est déjà enregistrée pour le contrat en cours.';
  END IF;
  UPDATE public.contracts SET terminated_on = NEW.exit_date
  WHERE employee_id = NEW.employee_id AND archived_at IS NULL AND start_date = _last_start
    AND (end_date IS NULL OR end_date > NEW.exit_date);
  UPDATE public.assignments SET end_date = NEW.exit_date
  WHERE employee_id = NEW.employee_id AND archived_at IS NULL AND start_date <= NEW.exit_date
    AND (end_date IS NULL OR end_date > NEW.exit_date);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _old jsonb; _new jsonb; _fields text[]; _emp uuid;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN _old := to_jsonb(OLD); END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN _new := to_jsonb(NEW); END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT array_agg(n.key ORDER BY n.key) INTO _fields
    FROM jsonb_each(_new) n
    WHERE n.key NOT IN ('updated_at', 'updated_by')
      AND (_old -> n.key) IS DISTINCT FROM n.value;
    IF _fields IS NULL THEN RETURN NEW; END IF;
  END IF;

  IF TG_TABLE_NAME = 'employees' THEN
    _emp := COALESCE((_new ->> 'id')::uuid, (_old ->> 'id')::uuid);
  ELSE
    _emp := COALESCE((_new ->> 'employee_id')::uuid, (_old ->> 'employee_id')::uuid);
  END IF;

  INSERT INTO public.audit_log (created_by, table_name, record_id, action, old_data, new_data, changed_fields, employee_id)
  VALUES (auth.uid(), TG_TABLE_NAME, COALESCE((_new ->> 'id')::uuid, (_old ->> 'id')::uuid),
          TG_OP, _old, _new, _fields, _emp);
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_last_admin_removal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.role = 'admin_it' AND OLD.archived_at IS NULL
     AND (NEW.role <> 'admin_it' OR NEW.archived_at IS NOT NULL)
     AND NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin_it' AND archived_at IS NULL AND id <> OLD.id) THEN
    RAISE EXCEPTION 'Impossible de retirer le dernier administrateur IT.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_self_role_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NEW.user_id = auth.uid() THEN
    RAISE EXCEPTION 'Vous ne pouvez pas modifier vos propres rôles.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER user_roles_not_self BEFORE INSERT OR UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_self_role_change();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, COALESCE(NEW.email, ''), COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''));
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin_it' AND archived_at IS NULL) THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin_it'), (NEW.id, 'drh');
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['prevent_manager_loop()', 'check_org_unit()', 'compute_contract()',
    'close_previous_assignment()', 'apply_exit()'] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
  END LOOP;
END $$;

CREATE TRIGGER employees_normalize BEFORE INSERT OR UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.normalize_employee();
CREATE TRIGGER employees_no_loop BEFORE INSERT OR UPDATE OF manager_id ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.prevent_manager_loop();
CREATE TRIGGER org_units_check BEFORE INSERT OR UPDATE ON public.org_units
  FOR EACH ROW EXECUTE FUNCTION public.check_org_unit();
CREATE TRIGGER contracts_compute BEFORE INSERT OR UPDATE OF type, start_date, duration_months ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.compute_contract();
CREATE TRIGGER assignments_close_previous BEFORE INSERT ON public.assignments
  FOR EACH ROW EXECUTE FUNCTION public.close_previous_assignment();
CREATE TRIGGER exits_apply AFTER INSERT ON public.exits
  FOR EACH ROW EXECUTE FUNCTION public.apply_exit();

DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT * FROM (VALUES
    ('roles', 'users'), ('permissions', 'users'), ('role_permissions', 'users'), ('user_scopes', 'users'),
    ('sites', 'referentials'), ('org_units', 'referentials'), ('job_titles', 'referentials'),
    ('job_title_aliases', 'referentials'), ('categories', 'referentials'), ('exit_reasons', 'referentials'),
    ('document_types', 'referentials'),
    ('employees', 'employees'), ('employee_sensitive', 'sensitive_data'), ('employee_sites', 'employees'),
    ('assignments', 'assignments'), ('contracts', 'contracts'), ('exits', 'employees'),
    ('compensation', 'compensation'), ('documents', 'documents'), ('notifications', NULL)
  ) AS v(tbl, res) LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_audit_columns()', t.tbl || '_set_audit', t.tbl);
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.log_audit()', t.tbl || '_log_audit', t.tbl);
    IF t.res IS NOT NULL THEN
      EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OF archived_at ON public.%I FOR EACH ROW EXECUTE FUNCTION public.enforce_archive_permission(%L)', t.tbl || '_archive_perm', t.tbl, t.res);
    END IF;
  END LOOP;
END $$;
CREATE TRIGGER settings_archive_perm BEFORE UPDATE OF archived_at ON public.settings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_archive_permission('referentials');
CREATE TRIGGER user_roles_archive_perm BEFORE UPDATE OF archived_at ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_archive_permission('users');
CREATE TRIGGER document_access_log_audit AFTER INSERT ON public.document_access_log
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

-- ---------------------------------------------------------------------
-- Privilèges (jamais de DELETE côté client)
-- ---------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['roles', 'permissions', 'role_permissions', 'user_scopes', 'sites', 'org_units',
    'job_titles', 'job_title_aliases', 'categories', 'exit_reasons', 'document_types', 'employees',
    'employee_sensitive', 'employee_sites', 'assignments', 'contracts', 'exits', 'compensation',
    'documents', 'document_access_log', 'notifications'] LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

GRANT SELECT ON public.roles, public.permissions, public.role_permissions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.user_scopes, public.sites, public.org_units, public.job_titles,
  public.job_title_aliases, public.categories, public.exit_reasons, public.document_types,
  public.employees, public.employee_sensitive, public.employee_sites, public.assignments,
  public.contracts, public.compensation, public.documents TO authenticated;
GRANT SELECT, INSERT ON public.document_access_log TO authenticated;
GRANT SELECT ON public.notifications TO authenticated;
GRANT UPDATE (read_at) ON public.notifications TO authenticated;
GRANT SELECT (id, employee_id, exit_date, created_at, updated_at, created_by, updated_by, archived_at) ON public.exits TO authenticated;
GRANT INSERT (employee_id, exit_date, reason_id, notes) ON public.exits TO authenticated;
GRANT UPDATE (exit_date, reason_id, notes, archived_at) ON public.exits TO authenticated;
GRANT UPDATE (role, archived_at) ON public.user_roles TO authenticated;
GRANT UPDATE (value) ON public.settings TO authenticated;

-- ---------------------------------------------------------------------
-- Politiques RLS
-- ---------------------------------------------------------------------
CREATE POLICY "Lecture matrice" ON public.roles FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "Lecture matrice" ON public.permissions FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "Lecture matrice" ON public.role_permissions FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));

DROP POLICY "Lire son rôle ou admin RH" ON public.user_roles;
DROP POLICY "Admin RH attribue les rôles" ON public.user_roles;
DROP POLICY "Admin RH modifie les rôles" ON public.user_roles;
CREATE POLICY "Voir rôles" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_permission('users', 'view'));
CREATE POLICY "Attribuer rôles" ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('users', 'create'));
CREATE POLICY "Modifier rôles" ON public.user_roles FOR UPDATE TO authenticated
  USING (public.has_permission('users', 'edit')) WITH CHECK (public.has_permission('users', 'edit'));

CREATE POLICY "Voir périmètres" ON public.user_scopes FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_permission('users', 'view'));
CREATE POLICY "Créer périmètres" ON public.user_scopes FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('users', 'create'));
CREATE POLICY "Modifier périmètres" ON public.user_scopes FOR UPDATE TO authenticated
  USING (public.has_permission('users', 'edit')) WITH CHECK (public.has_permission('users', 'edit'));

DROP POLICY "Lire son profil ou admin RH" ON public.profiles;
DROP POLICY "Modifier son profil ou admin RH" ON public.profiles;
CREATE POLICY "Voir profils" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_permission('users', 'view'));
CREATE POLICY "Modifier profils" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.has_permission('users', 'edit'))
  WITH CHECK (id = auth.uid() OR public.has_permission('users', 'edit'));
GRANT UPDATE (employee_id) ON public.profiles TO authenticated;
CREATE OR REPLACE FUNCTION public.protect_profile_link()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NEW.employee_id IS DISTINCT FROM OLD.employee_id
     AND NOT public.has_permission('users', 'edit') THEN
    RAISE EXCEPTION 'Seul un administrateur peut lier un compte à un employé.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER profiles_protect_link BEFORE UPDATE OF employee_id ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_link();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sites', 'org_units', 'job_titles', 'job_title_aliases', 'categories', 'document_types'] LOOP
    EXECUTE format('CREATE POLICY "Voir référentiel" ON public.%I FOR SELECT TO authenticated USING (public.has_permission(''referentials'', ''view''))', t);
    EXECUTE format('CREATE POLICY "Créer référentiel" ON public.%I FOR INSERT TO authenticated WITH CHECK (public.has_permission(''referentials'', ''create''))', t);
    EXECUTE format('CREATE POLICY "Modifier référentiel" ON public.%I FOR UPDATE TO authenticated USING (public.has_permission(''referentials'', ''edit'') OR public.has_permission(''referentials'', ''archive'')) WITH CHECK (public.has_permission(''referentials'', ''edit'') OR public.has_permission(''referentials'', ''archive''))', t);
  END LOOP;
END $$;
CREATE POLICY "Voir motifs" ON public.exit_reasons FOR SELECT TO authenticated
  USING (public.has_permission('referentials', 'view')
         AND (NOT is_confidential OR public.has_permission('sensitive_data', 'view')));
CREATE POLICY "Créer motifs" ON public.exit_reasons FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('referentials', 'create'));
CREATE POLICY "Modifier motifs" ON public.exit_reasons FOR UPDATE TO authenticated
  USING ((public.has_permission('referentials', 'edit') OR public.has_permission('referentials', 'archive'))
         AND (NOT is_confidential OR public.has_permission('sensitive_data', 'view')))
  WITH CHECK (public.has_permission('referentials', 'edit') OR public.has_permission('referentials', 'archive'));

DROP POLICY "Utilisateurs avec rôle lisent les paramètres" ON public.settings;
DROP POLICY "Admin RH modifie les paramètres" ON public.settings;
CREATE POLICY "Voir paramètres" ON public.settings FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid()));
CREATE POLICY "Modifier paramètres" ON public.settings FOR UPDATE TO authenticated
  USING (public.has_permission('referentials', 'edit')) WITH CHECK (public.has_permission('referentials', 'edit'));

CREATE POLICY "Voir employés" ON public.employees FOR SELECT TO authenticated
  USING (public.has_permission_on('employees', 'view', id));
CREATE POLICY "Créer employés" ON public.employees FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('employees', 'create'));
CREATE POLICY "Modifier employés" ON public.employees FOR UPDATE TO authenticated
  USING (public.has_permission_on('employees', 'edit', id) OR public.has_permission_on('employees', 'archive', id))
  WITH CHECK (public.has_permission_on('employees', 'edit', id) OR public.has_permission_on('employees', 'archive', id));

CREATE POLICY "Voir données sensibles" ON public.employee_sensitive FOR SELECT TO authenticated
  USING (public.has_permission_on('sensitive_data', 'view', employee_id));
CREATE POLICY "Créer données sensibles" ON public.employee_sensitive FOR INSERT TO authenticated
  WITH CHECK (public.has_permission_on('sensitive_data', 'edit', employee_id));
CREATE POLICY "Modifier données sensibles" ON public.employee_sensitive FOR UPDATE TO authenticated
  USING (public.has_permission_on('sensitive_data', 'edit', employee_id))
  WITH CHECK (public.has_permission_on('sensitive_data', 'edit', employee_id));

CREATE POLICY "Voir sites employé" ON public.employee_sites FOR SELECT TO authenticated
  USING (public.has_permission_on('employees', 'view', employee_id));
CREATE POLICY "Créer sites employé" ON public.employee_sites FOR INSERT TO authenticated
  WITH CHECK (public.has_permission_on('employees', 'edit', employee_id) OR public.has_permission('employees', 'create'));
CREATE POLICY "Modifier sites employé" ON public.employee_sites FOR UPDATE TO authenticated
  USING (public.has_permission_on('employees', 'edit', employee_id))
  WITH CHECK (public.has_permission_on('employees', 'edit', employee_id));

DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT * FROM (VALUES ('assignments', 'assignments'), ('contracts', 'contracts'), ('compensation', 'compensation')) v(tbl, res) LOOP
    EXECUTE format('CREATE POLICY "Voir" ON public.%I FOR SELECT TO authenticated USING (public.has_permission_on(%L, ''view'', employee_id))', t.tbl, t.res);
    EXECUTE format('CREATE POLICY "Créer" ON public.%I FOR INSERT TO authenticated WITH CHECK (public.has_permission_on(%L, ''create'', employee_id))', t.tbl, t.res);
    EXECUTE format('CREATE POLICY "Modifier" ON public.%I FOR UPDATE TO authenticated USING (public.has_permission_on(%L, ''edit'', employee_id) OR public.has_permission_on(%L, ''archive'', employee_id)) WITH CHECK (public.has_permission_on(%L, ''edit'', employee_id) OR public.has_permission_on(%L, ''archive'', employee_id))', t.tbl, t.res, t.res, t.res, t.res);
  END LOOP;
END $$;

CREATE POLICY "Voir sorties" ON public.exits FOR SELECT TO authenticated
  USING (public.has_permission_on('employees', 'view', employee_id));
CREATE POLICY "Créer sorties" ON public.exits FOR INSERT TO authenticated
  WITH CHECK (public.has_permission_on('employees', 'edit', employee_id)
              AND (NOT public.is_confidential_exit_reason(reason_id) OR public.has_permission_on('sensitive_data', 'edit', employee_id)));
CREATE POLICY "Modifier sorties" ON public.exits FOR UPDATE TO authenticated
  USING (public.has_permission_on('employees', 'edit', employee_id))
  WITH CHECK (public.has_permission_on('employees', 'edit', employee_id)
              AND (NOT public.is_confidential_exit_reason(reason_id) OR public.has_permission_on('sensitive_data', 'edit', employee_id)));

CREATE POLICY "Voir documents" ON public.documents FOR SELECT TO authenticated
  USING (CASE WHEN public.is_confidential_document_type(document_type_id)
              THEN public.has_permission_on('confidential_documents', 'view', employee_id)
              ELSE public.has_permission_on('documents', 'view', employee_id) END);
CREATE POLICY "Créer documents" ON public.documents FOR INSERT TO authenticated
  WITH CHECK (CASE WHEN public.is_confidential_document_type(document_type_id)
              THEN public.has_permission_on('confidential_documents', 'create', employee_id)
              ELSE public.has_permission_on('documents', 'create', employee_id) END);
CREATE POLICY "Modifier documents" ON public.documents FOR UPDATE TO authenticated
  USING (CASE WHEN public.is_confidential_document_type(document_type_id)
              THEN public.has_permission_on('confidential_documents', 'edit', employee_id) OR public.has_permission_on('confidential_documents', 'archive', employee_id)
              ELSE public.has_permission_on('documents', 'edit', employee_id) OR public.has_permission_on('documents', 'archive', employee_id) END)
  WITH CHECK (CASE WHEN public.is_confidential_document_type(document_type_id)
              THEN public.has_permission_on('confidential_documents', 'edit', employee_id) OR public.has_permission_on('confidential_documents', 'archive', employee_id)
              ELSE public.has_permission_on('documents', 'edit', employee_id) OR public.has_permission_on('documents', 'archive', employee_id) END);

CREATE POLICY "Tracer accès document" ON public.document_access_log FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.documents d WHERE d.id = document_id));
CREATE POLICY "Voir accès documents" ON public.document_access_log FOR SELECT TO authenticated
  USING (public.has_permission('audit', 'view') AND public.has_permission('confidential_documents', 'view'));

CREATE POLICY "Mes notifications" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Lire mes notifications" ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY "Admin RH lit le journal" ON public.audit_log;
CREATE OR REPLACE FUNCTION public.can_read_audit_table(_table text, _employee_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
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
    ELSE true
  END;
$$;
REVOKE EXECUTE ON FUNCTION public.can_read_audit_table(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_audit_table(text, uuid) TO authenticated, service_role;

CREATE POLICY "Lire le journal" ON public.audit_log FOR SELECT TO authenticated
  USING (
    (public.has_permission('audit', 'view')
      AND (employee_id IS NULL OR public.can_read_audit_table(table_name, employee_id)))
    OR (employee_id IS NOT NULL
      AND public.has_permission_on('employees', 'view', employee_id)
      AND public.can_read_audit_table(table_name, employee_id))
  );

-- ---------------------------------------------------------------------
-- Vues calculées (RLS de l'utilisateur appliquée)
-- ---------------------------------------------------------------------
CREATE VIEW public.v_employee_current WITH (security_invoker = true) AS
SELECT
  e.id AS employee_id, e.matricule, e.first_names, e.last_name, e.manager_id, e.birth_date,
  e.phone, e.email, e.archived_at,
  a.id AS assignment_id, a.org_unit_id, ou.name AS org_unit_name, a.job_title_id, jt.name AS job_title_name,
  a.category_id, cat.code AS category_code, a.status, a.start_date AS assignment_start,
  public.org_unit_ancestors(a.org_unit_id) AS org_unit_path,
  ps.site_id AS primary_site_id, s.name AS primary_site_name,
  COALESCE(st.site_ids, '{}') AS site_ids,
  c.id AS contract_id, c.type AS contract_type, c.start_date AS contract_start,
  c.end_date AS contract_end, c.terminated_on AS contract_terminated_on,
  lx.exit_date,
  (lx.exit_date IS NULL) AS is_active
FROM public.employees e
LEFT JOIN LATERAL (
  SELECT * FROM public.assignments a WHERE a.employee_id = e.id AND a.archived_at IS NULL
  ORDER BY a.start_date DESC LIMIT 1
) a ON true
LEFT JOIN public.org_units ou ON ou.id = a.org_unit_id
LEFT JOIN public.job_titles jt ON jt.id = a.job_title_id
LEFT JOIN public.categories cat ON cat.id = a.category_id
LEFT JOIN LATERAL (
  SELECT es.site_id FROM public.employee_sites es
  WHERE es.employee_id = e.id AND es.is_primary AND es.archived_at IS NULL LIMIT 1
) ps ON true
LEFT JOIN public.sites s ON s.id = ps.site_id
LEFT JOIN LATERAL (
  SELECT array_agg(es.site_id) AS site_ids FROM public.employee_sites es
  WHERE es.employee_id = e.id AND es.archived_at IS NULL
) st ON true
LEFT JOIN LATERAL (
  SELECT * FROM public.contracts c WHERE c.employee_id = e.id AND c.archived_at IS NULL
  ORDER BY c.start_date DESC LIMIT 1
) c ON true
LEFT JOIN LATERAL (
  SELECT x.exit_date FROM public.exits x
  WHERE x.employee_id = e.id AND x.archived_at IS NULL AND (c.start_date IS NULL OR x.exit_date >= c.start_date)
  ORDER BY x.exit_date DESC LIMIT 1
) lx ON true;

CREATE VIEW public.v_employee_metrics WITH (security_invoker = true) AS
WITH base AS (
  SELECT cur.employee_id, cur.birth_date, cur.contract_start, cur.exit_date,
    (SELECT value FROM public.settings WHERE key = 'retirement_age') AS retirement_age
  FROM public.v_employee_current cur
), hire AS (
  SELECT b.*,
    (SELECT min(c.start_date) FROM public.contracts c
     WHERE c.employee_id = b.employee_id AND c.archived_at IS NULL
       AND c.start_date > COALESCE((
         SELECT max(x.exit_date) FROM public.exits x
         WHERE x.employee_id = b.employee_id AND x.archived_at IS NULL AND x.exit_date < b.contract_start
       ), '-infinity'::date)
    ) AS hire_date
  FROM base b
)
SELECT
  employee_id,
  hire_date,
  CASE WHEN birth_date IS NOT NULL THEN date_part('year', age(current_date, birth_date))::int END AS age_years,
  CASE WHEN hire_date IS NOT NULL THEN
    (date_part('year', age(COALESCE(exit_date, current_date), hire_date)) * 12
     + date_part('month', age(COALESCE(exit_date, current_date), hire_date)))::int
  END AS seniority_months,
  CASE WHEN birth_date IS NOT NULL THEN (birth_date + make_interval(years => retirement_age))::date END AS retirement_date
FROM hire;

CREATE VIEW public.v_contract_alerts WITH (security_invoker = true) AS
WITH cur AS (
  SELECT c.*, m.retirement_date,
    CASE WHEN c.contract_type = 'cdi' THEN m.retirement_date ELSE c.contract_end END AS reference_date
  FROM public.v_employee_current c
  JOIN public.v_employee_metrics m USING (employee_id)
  WHERE c.is_active AND c.contract_id IS NOT NULL AND c.archived_at IS NULL
)
SELECT
  cur.employee_id, cur.matricule, cur.first_names, cur.last_name,
  cur.contract_id, cur.contract_type, cur.contract_start, cur.contract_end,
  cur.retirement_date, cur.reference_date,
  (cur.reference_date - current_date) AS days_remaining,
  s.value AS notice_days,
  COALESCE((cur.reference_date - current_date) BETWEEN 0 AND s.value, false) AS to_notify,
  (cur.contract_type <> 'cdi' AND cur.contract_end < current_date) AS to_regularize,
  cur.primary_site_id, cur.org_unit_id
FROM cur
LEFT JOIN public.settings s ON s.key = 'notice_days_' || cur.contract_type::text AND s.archived_at IS NULL;

CREATE VIEW public.v_kpis WITH (security_invoker = true) AS
WITH act AS (
  SELECT cur.*, m.age_years, m.seniority_months,
    public.org_unit_ancestor_of_type(cur.org_unit_id, 'departement') AS department_id
  FROM public.v_employee_current cur
  JOIN public.v_employee_metrics m USING (employee_id)
  WHERE cur.is_active AND cur.archived_at IS NULL
)
SELECT
  (SELECT count(*) FROM act)::int AS active_headcount,
  (SELECT round(avg(age_years)::numeric, 1) FROM act) AS average_age,
  (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY age_years) FROM act WHERE age_years IS NOT NULL) AS median_age,
  (SELECT round(avg(seniority_months)::numeric, 1) FROM act) AS average_seniority_months,
  (SELECT COALESCE(jsonb_object_agg(k, n), '{}') FROM (SELECT COALESCE(status::text, 'non_renseigne') k, count(*) n FROM act GROUP BY 1) t) AS by_status,
  (SELECT COALESCE(jsonb_object_agg(k, n), '{}') FROM (SELECT COALESCE(contract_type::text, 'aucun') k, count(*) n FROM act GROUP BY 1) t) AS by_contract_type,
  (SELECT COALESCE(jsonb_object_agg(k, n), '{}') FROM (SELECT COALESCE(primary_site_name, 'Non renseigné') k, count(*) n FROM act GROUP BY 1) t) AS by_site,
  (SELECT COALESCE(jsonb_object_agg(k, n), '{}') FROM (
     SELECT COALESCE(ou.name, 'Non rattaché') k, count(*) n FROM act LEFT JOIN public.org_units ou ON ou.id = act.department_id GROUP BY 1
   ) t) AS by_department;

CREATE VIEW public.v_exit_details AS
SELECT x.id, x.employee_id, x.exit_date, x.archived_at, x.created_at,
  CASE WHEN NOT r.is_confidential OR public.has_permission_on('sensitive_data', 'view', x.employee_id) THEN x.reason_id END AS reason_id,
  CASE WHEN NOT r.is_confidential OR public.has_permission_on('sensitive_data', 'view', x.employee_id) THEN r.name ELSE 'Motif confidentiel' END AS reason_name,
  r.is_confidential,
  CASE WHEN NOT r.is_confidential OR public.has_permission_on('sensitive_data', 'view', x.employee_id) THEN x.notes END AS notes
FROM public.exits x
JOIN public.exit_reasons r ON r.id = x.reason_id
WHERE public.has_permission_on('employees', 'view', x.employee_id);

REVOKE ALL ON public.v_employee_current, public.v_employee_metrics, public.v_contract_alerts, public.v_kpis, public.v_exit_details FROM anon;
GRANT SELECT ON public.v_employee_current, public.v_employee_metrics, public.v_contract_alerts, public.v_kpis, public.v_exit_details TO authenticated;

-- ---------------------------------------------------------------------
-- Données initiales
-- ---------------------------------------------------------------------
INSERT INTO public.roles (code, label, requires_mfa, sort_order) VALUES
  ('admin_it', 'Administrateur IT', true, 10),
  ('drh', 'DRH', true, 20),
  ('gestionnaire_rh', 'Gestionnaire RH', true, 30),
  ('paie', 'Paie', true, 40),
  ('manager', 'Manager', false, 50),
  ('direction', 'Direction', false, 60),
  ('auditeur', 'Auditeur', false, 70);

INSERT INTO public.permissions (resource, action, label)
SELECT r.resource, a.action, r.label
FROM (VALUES
  ('referentials', 'Référentiels'), ('users', 'Utilisateurs et rôles'), ('audit', 'Journal d''audit'),
  ('employees', 'Employés'), ('sensitive_data', 'Données sensibles'), ('contracts', 'Contrats'),
  ('assignments', 'Affectations'), ('compensation', 'Rémunération'), ('documents', 'Documents standard'),
  ('confidential_documents', 'Documents confidentiels'), ('import_export', 'Import et export'),
  ('dashboards', 'Tableaux de bord')
) r(resource, label)
CROSS JOIN (VALUES ('view'), ('create'), ('edit'), ('archive'), ('export'), ('import')) a(action);

INSERT INTO public.role_permissions (role_id, permission_id, scope)
SELECT ro.id, p.id, CASE WHEN m.role = 'manager' THEN 'team' ELSE 'all' END
FROM (VALUES
  ('admin_it', 'referentials', 'VCED'), ('admin_it', 'users', 'VCED'), ('admin_it', 'audit', 'V'),
  ('drh', 'employees', 'VCEDX'), ('drh', 'sensitive_data', 'VE'), ('drh', 'contracts', 'VCEDX'),
  ('drh', 'assignments', 'VCED'), ('drh', 'compensation', 'VCE'), ('drh', 'documents', 'VCED'),
  ('drh', 'confidential_documents', 'VCED'), ('drh', 'referentials', 'VCE'), ('drh', 'import_export', 'VCX'),
  ('drh', 'dashboards', 'V'), ('drh', 'audit', 'V'), ('drh', 'users', 'V'),
  ('gestionnaire_rh', 'employees', 'VCEX'), ('gestionnaire_rh', 'sensitive_data', 'VE'),
  ('gestionnaire_rh', 'contracts', 'VCEX'), ('gestionnaire_rh', 'assignments', 'VCE'),
  ('gestionnaire_rh', 'documents', 'VCE'), ('gestionnaire_rh', 'confidential_documents', 'V'),
  ('gestionnaire_rh', 'referentials', 'V'), ('gestionnaire_rh', 'import_export', 'VX'),
  ('gestionnaire_rh', 'dashboards', 'V'),
  ('paie', 'employees', 'V'), ('paie', 'contracts', 'V'), ('paie', 'assignments', 'V'),
  ('paie', 'compensation', 'VCEX'), ('paie', 'documents', 'V'), ('paie', 'referentials', 'V'),
  ('paie', 'import_export', 'X'), ('paie', 'dashboards', 'V'),
  ('manager', 'employees', 'V'), ('manager', 'contracts', 'V'), ('manager', 'assignments', 'V'),
  ('manager', 'documents', 'V'), ('manager', 'referentials', 'V'), ('manager', 'dashboards', 'V'),
  ('direction', 'employees', 'V'), ('direction', 'contracts', 'V'), ('direction', 'assignments', 'V'),
  ('direction', 'compensation', 'V'), ('direction', 'referentials', 'V'), ('direction', 'dashboards', 'V'),
  ('auditeur', 'referentials', 'V'), ('auditeur', 'users', 'V'), ('auditeur', 'audit', 'V'),
  ('auditeur', 'employees', 'V'), ('auditeur', 'sensitive_data', 'V'), ('auditeur', 'contracts', 'V'),
  ('auditeur', 'assignments', 'V'), ('auditeur', 'compensation', 'V'), ('auditeur', 'documents', 'V'),
  ('auditeur', 'confidential_documents', 'V'), ('auditeur', 'import_export', 'V'), ('auditeur', 'dashboards', 'V')
) m(role, resource, letters)
JOIN public.roles ro ON ro.code::text = m.role
CROSS JOIN LATERAL (
  SELECT CASE l WHEN 'V' THEN 'view' WHEN 'C' THEN 'create' WHEN 'E' THEN 'edit'
                WHEN 'D' THEN 'archive' WHEN 'X' THEN 'export' WHEN 'I' THEN 'import' END AS action
  FROM regexp_split_to_table(m.letters, '') l
) act
JOIN public.permissions p ON p.resource = m.resource AND p.action = act.action;

INSERT INTO public.sites (name) VALUES ('Sébikotane'), ('Sindia'), ('Dakar');

INSERT INTO public.exit_reasons (name, is_confidential, sort_order) VALUES
  ('Abandon de poste', false, 10), ('Démission', false, 20), ('Licenciement', false, 30),
  ('Expiration normale de contrat', false, 40), ('Départ négocié', false, 50),
  ('Longue maladie', true, 60), ('Fin de stage', false, 70);

INSERT INTO public.document_types (name, confidentiality, sort_order) VALUES
  ('Copie de pièce d''identité', 'standard', 10), ('Contrat signé', 'standard', 20),
  ('Avenant', 'standard', 30), ('Diplôme', 'standard', 40), ('Certificat médical', 'confidential', 50),
  ('Attestation', 'standard', 60), ('Sanction', 'confidential', 70), ('RIB', 'standard', 80),
  ('Photo', 'standard', 90), ('Autre', 'standard', 100);

INSERT INTO public.settings (key, label, description, value, unit, sort_order) VALUES
  ('session_idle_minutes', 'Déconnexion après inactivité', 'Durée sans activité avant déconnexion automatique.', 30, 'minutes', 70)
ON CONFLICT (key) DO NOTHING;
