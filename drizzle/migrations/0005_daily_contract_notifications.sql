-- ---------- Paramètres : unité booléenne (0/1) ----------
ALTER TABLE public.settings DROP CONSTRAINT settings_unit_check;
ALTER TABLE public.settings ADD CONSTRAINT settings_unit_check
  CHECK (unit IN ('ans', 'mois', 'jours', 'minutes', 'booléen'));
ALTER TABLE public.settings DROP CONSTRAINT settings_value_check;
ALTER TABLE public.settings ADD CONSTRAINT settings_value_check
  CHECK (value > 0 OR unit = 'booléen');
ALTER TABLE public.settings ADD CONSTRAINT settings_boolean_value_check
  CHECK (unit <> 'booléen' OR value IN (0, 1));

INSERT INTO public.settings (key, label, description, value, unit, sort_order)
VALUES ('notifications_email_enabled', 'Notifications par e-mail',
        'Prépare un e-mail pour chaque nouvelle notification. L''envoi effectif sera branché dans une étape ultérieure.',
        0, 'booléen', 80)
ON CONFLICT (key) DO NOTHING;

-- ---------- Périmètre d'un utilisateur donné (tâches de fond, sans session) ----------
CREATE OR REPLACE FUNCTION public.user_has_permission_on(_user_id uuid, _resource text, _action text, _employee_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _scope text;
  _my_employee uuid;
BEGIN
  IF _user_id IS NULL THEN RETURN false; END IF;

  FOR _scope IN
    SELECT DISTINCT rp.scope
    FROM public.user_roles ur
    JOIN public.roles r ON r.code = ur.role AND r.archived_at IS NULL
    JOIN public.role_permissions rp ON rp.role_id = r.id AND rp.archived_at IS NULL
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE ur.user_id = _user_id AND ur.archived_at IS NULL
      AND p.resource = _resource AND p.action = _action
  LOOP
    IF _scope = 'all' THEN RETURN true; END IF;

    IF _scope = 'site' AND EXISTS (
      SELECT 1 FROM public.employee_sites es
      JOIN public.user_scopes us ON us.site_id = es.site_id AND us.user_id = _user_id AND us.archived_at IS NULL
      WHERE es.employee_id = _employee_id AND es.archived_at IS NULL
    ) THEN RETURN true; END IF;

    IF _scope = 'unit' AND EXISTS (
      SELECT 1 FROM public.user_scopes us
      WHERE us.user_id = _user_id AND us.archived_at IS NULL AND us.org_unit_id IS NOT NULL
        AND us.org_unit_id = ANY (public.org_unit_ancestors((
          SELECT a.org_unit_id FROM public.assignments a
          WHERE a.employee_id = _employee_id AND a.archived_at IS NULL
          ORDER BY a.start_date DESC LIMIT 1
        )))
    ) THEN RETURN true; END IF;

    IF _scope IN ('team', 'self') THEN
      IF _my_employee IS NULL THEN
        SELECT employee_id INTO _my_employee FROM public.profiles WHERE id = _user_id;
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

-- Même logique qu'avant, désormais partagée avec les tâches de fond.
CREATE OR REPLACE FUNCTION public.has_permission_on(_resource text, _action text, _employee_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.mfa_ok() THEN RETURN false; END IF;
  RETURN public.user_has_permission_on(auth.uid(), _resource, _action, _employee_id);
END;
$$;

-- Équivalent de in_scope() pour un utilisateur explicite.
CREATE OR REPLACE FUNCTION public.in_scope_for(_user_id uuid, _employee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_has_permission_on(_user_id, 'employees', 'view', _employee_id);
$$;

REVOKE EXECUTE ON FUNCTION public.user_has_permission_on(uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.in_scope_for(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_permission_on(uuid, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.in_scope_for(uuid, uuid) TO service_role;

-- ---------- Notifications : anti-doublon ----------
ALTER TABLE public.notifications ADD COLUMN dedupe_key text;
CREATE UNIQUE INDEX notifications_dedupe_idx
  ON public.notifications (user_id, kind, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

-- ---------- Destinataires configurables ----------
CREATE TABLE public.notification_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('contract_ending', 'retirement_upcoming', 'contract_to_regularize', '*')),
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  archived_at timestamptz
);
CREATE UNIQUE INDEX notification_recipients_active_idx
  ON public.notification_recipients (kind, role)
  WHERE archived_at IS NULL;

GRANT SELECT, INSERT ON public.notification_recipients TO authenticated;
GRANT UPDATE (archived_at) ON public.notification_recipients TO authenticated;
GRANT ALL ON public.notification_recipients TO service_role;
ALTER TABLE public.notification_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Voir destinataires"
  ON public.notification_recipients FOR SELECT TO authenticated
  USING (public.has_permission('referentials', 'edit'));
CREATE POLICY "Créer destinataires"
  ON public.notification_recipients FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('referentials', 'edit'));
CREATE POLICY "Modifier destinataires"
  ON public.notification_recipients FOR UPDATE TO authenticated
  USING (public.has_permission('referentials', 'edit'))
  WITH CHECK (public.has_permission('referentials', 'edit'));

CREATE TRIGGER notification_recipients_set_audit BEFORE INSERT OR UPDATE ON public.notification_recipients
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_columns();
CREATE TRIGGER notification_recipients_log_audit AFTER INSERT OR UPDATE OR DELETE ON public.notification_recipients
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

INSERT INTO public.notification_recipients (kind, role) VALUES
  ('contract_ending', 'drh'), ('contract_ending', 'gestionnaire_rh'),
  ('retirement_upcoming', 'drh'), ('retirement_upcoming', 'gestionnaire_rh'), ('retirement_upcoming', 'direction'),
  ('contract_to_regularize', 'drh'), ('contract_to_regularize', 'gestionnaire_rh');

-- ---------- File d'envoi des e-mails (structure seulement, aucun accès client) ----------
CREATE TABLE public.notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.notifications(id),
  channel text NOT NULL DEFAULT 'email' CHECK (channel IN ('email')),
  recipient_email text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  archived_at timestamptz
);
CREATE INDEX notification_outbox_pending_idx ON public.notification_outbox (created_at) WHERE status = 'pending';

REVOKE ALL ON public.notification_outbox FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.notification_outbox TO service_role;
ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER notification_outbox_set_audit BEFORE INSERT OR UPDATE ON public.notification_outbox
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_columns();
CREATE TRIGGER notification_outbox_log_audit AFTER INSERT OR UPDATE OR DELETE ON public.notification_outbox
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

-- Le journal de la file d'envoi (adresses e-mail) n'est lisible par personne côté client.
CREATE OR REPLACE FUNCTION public.can_read_audit_table(_table text, _employee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
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
    WHEN 'notification_outbox' THEN false
    ELSE true
  END;
$$;

-- ---------- Génération quotidienne ----------
CREATE OR REPLACE FUNCTION public.generate_contract_notifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _email boolean;
  _count integer;
BEGIN
  SELECT COALESCE(bool_or(s.value = 1), false) INTO _email
  FROM public.settings s
  WHERE s.key = 'notifications_email_enabled' AND s.archived_at IS NULL;

  WITH alerts AS (
    SELECT 'contract_ending'::text AS kind, a.employee_id, a.first_names, a.last_name,
           a.contract_id, a.contract_type, a.reference_date, a.days_remaining,
           a.employee_id::text || ':' || a.reference_date::text AS dedupe_key
    FROM public.v_contract_alerts a
    WHERE a.contract_type <> 'cdi' AND a.to_notify
    UNION ALL
    SELECT 'retirement_upcoming', a.employee_id, a.first_names, a.last_name,
           a.contract_id, a.contract_type, a.reference_date, a.days_remaining,
           a.employee_id::text || ':' || a.reference_date::text
    FROM public.v_contract_alerts a
    WHERE a.contract_type = 'cdi' AND a.to_notify
    UNION ALL
    SELECT 'contract_to_regularize', a.employee_id, a.first_names, a.last_name,
           a.contract_id, a.contract_type, a.reference_date, a.days_remaining,
           a.contract_id::text
    FROM public.v_contract_alerts a
    WHERE a.to_regularize
  ),
  targets AS (
    SELECT DISTINCT ON (ur.user_id, al.kind, al.dedupe_key)
           ur.user_id, al.*
    FROM alerts al
    JOIN public.notification_recipients nr
      ON nr.archived_at IS NULL AND nr.kind IN (al.kind, '*')
    JOIN public.user_roles ur ON ur.role = nr.role AND ur.archived_at IS NULL
    JOIN public.profiles p ON p.id = ur.user_id AND p.archived_at IS NULL
    WHERE public.in_scope_for(ur.user_id, al.employee_id)
  ),
  ins AS (
    INSERT INTO public.notifications (user_id, kind, payload, dedupe_key)
    SELECT t.user_id, t.kind,
           jsonb_build_object(
             'employee_id', t.employee_id,
             'employee_name', trim(t.first_names || ' ' || t.last_name),
             'contract_id', t.contract_id,
             'contract_type', t.contract_type,
             'reference_date', t.reference_date,
             'days_remaining', t.days_remaining
           ),
           t.dedupe_key
    FROM targets t
    ON CONFLICT (user_id, kind, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
    RETURNING id, user_id
  ),
  outbox AS (
    INSERT INTO public.notification_outbox (notification_id, channel, recipient_email)
    SELECT ins.id, 'email', p.email
    FROM ins JOIN public.profiles p ON p.id = ins.user_id
    WHERE _email AND p.email IS NOT NULL AND p.email <> ''
    RETURNING 1
  )
  SELECT count(*) INTO _count FROM ins;

  RETURN _count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generate_contract_notifications() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_contract_notifications() TO service_role;