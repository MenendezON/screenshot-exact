-- 03-api.sql — clés d'API (api_clients), journal des appels (api_call_log), durée de vie obligatoire
-- Idempotent. Aucun accès direct pour les clients : tout passe par le serveur (service_role).
BEGIN;

-- Paramètre : durée de vie maximale d'une clé
INSERT INTO public.settings (key, label, description, value, unit, sort_order)
SELECT 'api_key_max_days', 'Durée de vie maximale d''une clé d''API',
       'Toute clé d''API expire ; sa date d''expiration ne peut pas dépasser cette durée.', 365, 'jours', 90
WHERE NOT EXISTS (SELECT 1 FROM public.settings WHERE key = 'api_key_max_days');

CREATE TABLE IF NOT EXISTS public.api_clients (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL CHECK (length(trim(name)) > 0),
  description  text,
  level        text NOT NULL CHECK (level IN ('identite','contrats','contact','remuneration')),
  site_id      uuid REFERENCES public.sites(id),
  key_prefix   text NOT NULL UNIQUE CHECK (key_prefix ~ '^[0-9a-f]{8}$'),
  key_hash     text NOT NULL CHECK (key_hash ~ '^[0-9a-f]{64}$'),
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz,
  last_used_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid
);

CREATE TABLE IF NOT EXISTS public.api_call_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  uuid NOT NULL REFERENCES public.api_clients(id),
  method     text,
  path       text,
  status     int,
  row_count  int,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
CREATE INDEX IF NOT EXISTS api_call_log_client_idx ON public.api_call_log (client_id, created_at DESC);

ALTER TABLE public.api_clients  ENABLE ROW LEVEL SECURITY;   -- aucune politique : service_role seulement
ALTER TABLE public.api_call_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.api_clients, public.api_call_log FROM anon, authenticated;
GRANT ALL ON public.api_clients, public.api_call_log TO service_role;

-- Durée de vie obligatoire à la création
CREATE OR REPLACE FUNCTION public.api_clients_check_expiry() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE max_days int;
BEGIN
  SELECT value INTO max_days FROM public.settings WHERE key = 'api_key_max_days' AND archived_at IS NULL;
  max_days := COALESCE(max_days, 365);
  IF NEW.expires_at <= now() OR NEW.expires_at > now() + make_interval(days => max_days) THEN
    RAISE EXCEPTION 'La date d''expiration doit être dans le futur et ne pas dépasser % jours.', max_days
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS api_clients_check_expiry ON public.api_clients;
CREATE TRIGGER api_clients_check_expiry BEFORE INSERT ON public.api_clients
  FOR EACH ROW EXECUTE FUNCTION public.api_clients_check_expiry();

-- Pas de prolongation ni de changement de clé après création ; seule la révocation et last_used_at évoluent
CREATE OR REPLACE FUNCTION public.api_clients_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.key_hash IS DISTINCT FROM OLD.key_hash OR NEW.key_prefix IS DISTINCT FROM OLD.key_prefix
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at OR NEW.level IS DISTINCT FROM OLD.level
     OR NEW.site_id IS DISTINCT FROM OLD.site_id THEN
    RAISE EXCEPTION 'Une clé d''API ne se modifie pas : créez-en une nouvelle et révoquez l''ancienne.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS api_clients_immutable ON public.api_clients;
CREATE TRIGGER api_clients_immutable BEFORE UPDATE ON public.api_clients
  FOR EACH ROW EXECUTE FUNCTION public.api_clients_immutable();

-- Purge du journal (à appeler par la tâche quotidienne, ou à la main)
CREATE OR REPLACE FUNCTION public.purge_api_call_log(_days int DEFAULT 90) RETURNS int
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH d AS (DELETE FROM public.api_call_log WHERE created_at < now() - make_interval(days => _days) RETURNING 1)
  SELECT count(*)::int FROM d;
$$;
REVOKE ALL ON FUNCTION public.purge_api_call_log(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_api_call_log(int) TO service_role;
COMMIT;
