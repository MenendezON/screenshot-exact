-- =====================================================================
-- Tests des règles de gestion : date de fin, durée maximale, chevauchement,
-- activité après réembauche, alertes de notification.
-- Même principe que permissions.test.sql : transaction entièrement annulée,
-- le script se termine TOUJOURS par une erreur « RÉSULTATS » qui liste les
-- vérifications (OK / ÉCHEC). Aucune donnée n'est conservée.
-- Prérequis : schéma appliqué (les paramètres de base suffisent, pas le jeu de démonstration).
-- Exécution : psql "$DATABASE_URL" -f supabase/tests/rules.test.sql
-- =====================================================================
DO $$
DECLARE
  e1 uuid; e2 uuid; e3 uuid; e4 uuid; reason uuid;
  c1 uuid;
  v_end date; v_active boolean; v_hire date; v_notify boolean; v_regul boolean; v_days int;
  max_months int; n int; msg text; code text;
  total int := 0; failed int := 0; out text := '';
  ok boolean;
BEGIN
  SELECT value INTO max_months FROM public.settings WHERE key = 'fixed_term_max_months' AND archived_at IS NULL;
  SELECT id INTO reason FROM public.exit_reasons WHERE NOT is_confidential AND archived_at IS NULL LIMIT 1;
  IF reason IS NULL THEN
    SELECT id INTO reason FROM public.exit_reasons WHERE archived_at IS NULL LIMIT 1;
  END IF;

  INSERT INTO public.employees (matricule, first_names, last_name) VALUES ('RULE1', 'Test', 'Dates') RETURNING id INTO e1;
  INSERT INTO public.employees (matricule, first_names, last_name) VALUES ('RULE2', 'Test', 'Reembauche') RETURNING id INTO e2;
  INSERT INTO public.employees (matricule, first_names, last_name) VALUES ('RULE3', 'Test', 'Alertes') RETURNING id INTO e3;
  INSERT INTO public.employees (matricule, first_names, last_name, birth_date)
    VALUES ('RULE4', 'Test', 'Retraite', current_date - make_interval(years => (SELECT value FROM public.settings WHERE key = 'retirement_age')::int) + 30)
    RETURNING id INTO e4;

  -- ---------- Calcul de la date de fin ----------
  INSERT INTO public.contracts (employee_id, type, start_date, duration_months) VALUES (e1, 'cdd', '2020-01-01', 12) RETURNING id, end_date INTO c1, v_end;
  total := total + 1; ok := v_end = DATE '2020-12-31'; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] CDD de 12 mois du 01/01/2020 finit le 31/12/2020 (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, v_end);

  INSERT INTO public.contracts (employee_id, type, start_date, duration_months) VALUES (e1, 'cdd', '2021-01-31', 1) RETURNING end_date INTO v_end;
  total := total + 1; ok := v_end = DATE '2021-02-27'; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] 31/01 + 1 mois : fin le 27/02 (jour -1 du mois cible) (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, v_end);

  -- ---------- Durée maximale ----------
  BEGIN
    INSERT INTO public.contracts (employee_id, type, start_date, duration_months) VALUES (e1, 'cdd', '2023-01-01', COALESCE(max_months, 24) + 1);
    ok := false;
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'Durée maximale dépassée%'; msg := SQLERRM; END;
  total := total + 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] durée au-dessus du maximum refusée (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, COALESCE(msg, '—'));

  -- ---------- Chevauchement ----------
  BEGIN
    INSERT INTO public.contracts (employee_id, type, start_date, duration_months) VALUES (e1, 'cdd', '2020-06-01', 6);
    ok := false;
  EXCEPTION WHEN exclusion_violation THEN ok := true; WHEN others THEN ok := false; END;
  total := total + 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] contrat qui chevauche refusé', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);

  -- ---------- Activité après réembauche ----------
  INSERT INTO public.contracts (employee_id, type, start_date, duration_months) VALUES (e2, 'cdd', '2020-01-01', 12);
  INSERT INTO public.exits (employee_id, exit_date, reason_id) VALUES (e2, '2020-12-31', reason);
  SELECT is_active INTO v_active FROM public.v_employee_current WHERE employee_id = e2;
  total := total + 1; ok := v_active = false; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] employé sorti : inactif (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, v_active);

  INSERT INTO public.contracts (employee_id, type, start_date) VALUES (e2, 'cdi', '2021-03-01');
  SELECT is_active INTO v_active FROM public.v_employee_current WHERE employee_id = e2;
  total := total + 1; ok := v_active = true; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] réembauché après la sortie : de nouveau actif (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, v_active);

  SELECT hire_date INTO v_hire FROM public.v_employee_metrics WHERE employee_id = e2;
  total := total + 1; ok := v_hire = DATE '2021-03-01'; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] date d''entrée = réembauche, ancienneté repartie de zéro (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, v_hire);

  -- ---------- Alertes de notification ----------
  -- CDD qui finit dans 20 jours (délai de notification CDD : 45 jours)
  INSERT INTO public.contracts (employee_id, type, start_date, duration_months)
    VALUES (e3, 'cdd', (current_date + 21 - interval '12 months')::date, 12);
  SELECT to_notify, to_regularize, days_remaining INTO v_notify, v_regul, v_days FROM public.v_contract_alerts WHERE employee_id = e3;
  total := total + 1; ok := v_notify = true AND v_regul = false AND v_days BETWEEN 17 AND 22; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] CDD finissant dans ~20 jours : à notifier (notif=%s, régul=%s, jours=%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, v_notify, v_regul, v_days);

  -- CDD échu sans sortie ni renouvellement : à régulariser
  DELETE FROM public.contracts WHERE employee_id = e3;
  INSERT INTO public.contracts (employee_id, type, start_date, duration_months) VALUES (e3, 'cdd', (current_date - interval '24 months')::date, 6);
  SELECT to_notify, to_regularize INTO v_notify, v_regul FROM public.v_contract_alerts WHERE employee_id = e3;
  total := total + 1; ok := v_regul = true AND v_notify = false; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] CDD échu : à régulariser (notif=%s, régul=%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, v_notify, v_regul);

  -- CDI : l'échéance est la retraite (dans 30 jours, délai CDI 60 jours)
  INSERT INTO public.contracts (employee_id, type, start_date) VALUES (e4, 'cdi', current_date - 400);
  SELECT to_notify, days_remaining INTO v_notify, v_days FROM public.v_contract_alerts WHERE employee_id = e4;
  total := total + 1; ok := v_notify = true AND v_days BETWEEN 28 AND 31; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] CDI : alerte de retraite dans ~30 jours (notif=%s, jours=%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, v_notify, v_days);

  RAISE EXCEPTION 'RÉSULTATS : % vérifications, % échec(s)%', total, failed, out;
END $$;
