-- =====================================================================
-- Jeu de données FICTIF de démonstration — Fabrimétal Sénégal
-- 40 employés (matricules DEMO001 à DEMO040), arbre d'unités, postes,
-- catégories, contrats successifs, sorties, rémunérations.
-- Dates calculées par rapport au jour d'exécution pour que les alertes
-- (« à notifier », « à régulariser », retraite proche) restent visibles.
-- Idempotent : ne fait rien si DEMO001 existe déjà.
-- =====================================================================
DO $$
DECLARE
  t date := current_date;
  r record;
  v_emp uuid;
  v_c1 uuid;
  v_c2 uuid;
  v_start date;
  v_end date;
  v_unit uuid;
  v_job uuid;
  v_cat uuid;
  v_status public.employee_status;
  v_low_cat uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.employees WHERE matricule = 'DEMO001') THEN
    RAISE NOTICE 'Données de démonstration déjà présentes.';
    RETURN;
  END IF;

  -- ---------- Catégories ----------
  INSERT INTO public.categories (code, default_status, sort_order) VALUES
    ('1OS1', 'ouvrier', 10), ('2OS1', 'ouvrier', 20), ('3OP1', 'ouvrier', 30), ('4OS2', 'ouvrier', 40),
    ('5OP2', 'ouvrier', 50), ('6OP3', 'ouvrier', 60), ('7AM1', 'agent_maitrise', 70), ('8AM2', 'agent_maitrise', 80),
    ('9E1', 'employe', 90), ('10E2', 'employe', 100), ('C1', 'cadre', 110), ('C2', 'cadre', 120),
    ('C3', 'cadre', 130), ('STG', 'stagiaire', 140)
  ON CONFLICT DO NOTHING;

  -- ---------- Postes et alias ----------
  INSERT INTO public.job_titles (name) VALUES
    ('Directeur Général'), ('Directeur Administratif et Financier'), ('Directeur Industriel'),
    ('Directeur Commercial'), ('Responsable RH'), ('Responsable Production'), ('Responsable Maintenance'),
    ('Chef d''équipe'), ('Soudeur'), ('Chaudronnier'), ('Électricien'), ('Mécanicien'), ('Comptable'),
    ('Gestionnaire RH'), ('Assistant paie'), ('Commercial'), ('Magasinier'), ('Ingénieur méthodes'),
    ('Stagiaire technique')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.job_title_aliases (alias, job_title_id)
  SELECT a.alias, j.id FROM (VALUES
    ('WELDER', 'Soudeur'), ('SOUDEUR QUALIFIÉ', 'Soudeur'), ('BOILERMAKER', 'Chaudronnier'),
    ('ELECTRICIAN', 'Électricien'), ('ELECTRICIEN', 'Électricien'), ('MECANICIEN', 'Mécanicien'),
    ('DG', 'Directeur Général'), ('DAF', 'Directeur Administratif et Financier'), ('ACCOUNTANT', 'Comptable')
  ) a(alias, job) JOIN public.job_titles j ON j.name = a.job;

  -- ---------- Arbre d'organisation ----------
  CREATE TEMP TABLE demo_units (key text PRIMARY KEY, id uuid) ON COMMIT DROP;
  INSERT INTO public.org_units (name, type, sort_order) VALUES ('Direction Générale', 'direction', 0)
    RETURNING 'DG', id INTO r;
  INSERT INTO demo_units VALUES ('DG', (SELECT id FROM public.org_units WHERE name = 'Direction Générale'));

  INSERT INTO public.org_units (name, type, parent_id, sort_order)
  SELECT v.name, v.type::public.org_unit_type, (SELECT id FROM demo_units WHERE key = 'DG'), v.ord
  FROM (VALUES ('Direction Industrielle', 'direction', 10), ('Direction Administrative et Financière', 'direction', 20),
               ('Direction Commerciale', 'direction', 30)) v(name, type, ord);
  INSERT INTO demo_units SELECT k, (SELECT id FROM public.org_units WHERE name = n) FROM (VALUES
    ('DI', 'Direction Industrielle'), ('DAF', 'Direction Administrative et Financière'), ('DC', 'Direction Commerciale')) x(k, n);

  INSERT INTO public.org_units (name, type, parent_id, sort_order)
  SELECT v.name, v.type::public.org_unit_type, (SELECT id FROM demo_units WHERE key = v.parent), v.ord
  FROM (VALUES
    ('Département Production', 'departement', 'DI', 10), ('Département Maintenance', 'departement', 'DI', 20),
    ('Département Ressources Humaines', 'departement', 'DAF', 10), ('Département Comptabilité', 'departement', 'DAF', 20),
    ('Département Ventes', 'departement', 'DC', 10)) v(name, type, parent, ord);
  INSERT INTO demo_units SELECT k, (SELECT id FROM public.org_units WHERE name = n) FROM (VALUES
    ('PROD', 'Département Production'), ('MAINT', 'Département Maintenance'), ('RH', 'Département Ressources Humaines'),
    ('COMPTA', 'Département Comptabilité'), ('VENTES', 'Département Ventes')) x(k, n);

  INSERT INTO public.org_units (name, type, parent_id, sort_order)
  SELECT v.name, v.type::public.org_unit_type, (SELECT id FROM demo_units WHERE key = v.parent), v.ord
  FROM (VALUES
    ('Service Soudure', 'service', 'PROD', 10), ('Service Chaudronnerie', 'service', 'PROD', 20),
    ('Service Électrique', 'service', 'MAINT', 10), ('Service Paie', 'service', 'RH', 10)) v(name, type, parent, ord);
  INSERT INTO demo_units SELECT k, (SELECT id FROM public.org_units WHERE name = n) FROM (VALUES
    ('SOUD', 'Service Soudure'), ('CHAUD', 'Service Chaudronnerie'), ('ELEC', 'Service Électrique'), ('PAIE', 'Service Paie')) x(k, n);

  INSERT INTO public.org_units (name, type, parent_id, sort_order)
  SELECT v.name, 'equipe', (SELECT id FROM demo_units WHERE key = 'SOUD'), v.ord
  FROM (VALUES ('Équipe Soudure A', 10), ('Équipe Soudure B', 20)) v(name, ord);
  INSERT INTO demo_units SELECT k, (SELECT id FROM public.org_units WHERE name = n) FROM (VALUES
    ('EQA', 'Équipe Soudure A'), ('EQB', 'Équipe Soudure B')) x(k, n);

  -- ---------- Employés ----------
  CREATE TEMP TABLE demo_emps (
    idx int PRIMARY KEY, first_names text, last_name text, birth date, unit text, job text, cat text,
    site text, site2 text, mgr int, plan text, salary bigint, promoted boolean, id uuid
  ) ON COMMIT DROP;

  INSERT INTO demo_emps (idx, first_names, last_name, birth, unit, job, cat, site, site2, mgr, plan, salary, promoted) VALUES
    (1, 'Mamadou', 'Diop', '1968-03-12', 'DG', 'Directeur Général', 'C3', 'Dakar', NULL, NULL, 'cdi:2005', 2500000, false),
    (2, 'Aminata', 'Ndiaye', '1975-07-21', 'DAF', 'Directeur Administratif et Financier', 'C3', 'Dakar', NULL, 1, 'cdi:2010', 1800000, false),
    (3, 'Ousmane', 'Fall', '1972-01-05', 'DI', 'Directeur Industriel', 'C3', 'Sébikotane', 'Sindia', 1, 'cdi:2008', 1900000, false),
    (4, 'Fatou', 'Sow', '1980-11-30', 'RH', 'Responsable RH', 'C2', 'Dakar', NULL, 2, 'cdi:2014', 1100000, false),
    (5, 'Cheikh', 'Gueye', '1978-04-17', 'PROD', 'Responsable Production', 'C2', 'Sébikotane', NULL, 3, 'cdi:2011', 1200000, true),
    (6, 'Moussa', 'Sarr', '1983-09-09', 'MAINT', 'Responsable Maintenance', 'C1', 'Sindia', NULL, 3, 'cdi:2015', 950000, false),
    (7, 'Awa', 'Faye', '1988-02-14', 'COMPTA', 'Comptable', '10E2', 'Dakar', NULL, 2, 'cdd_cdi', 450000, false),
    (8, 'Ibrahima', 'Ba', '1985-06-25', 'SOUD', 'Chef d''équipe', '8AM2', 'Sébikotane', NULL, 5, 'cdi:2012', 520000, true),
    (9, 'Abdoulaye', 'Mbaye', '1990-12-01', 'EQA', 'Soudeur', '4OS2', 'Sébikotane', NULL, 8, 'cdd_cdi', 230000, false),
    (10, 'Modou', 'Cissé', '1992-05-18', 'EQA', 'Soudeur', '4OS2', 'Sébikotane', NULL, 8, 'cdd_active', 210000, false),
    (11, 'Aliou', 'Kane', (current_date - interval '60 years' + interval '40 days')::date, 'EQB', 'Soudeur', '5OP2', 'Sébikotane', NULL, 8, 'cdi:1998', 320000, false),
    (12, 'Babacar', 'Thiam', '1994-08-08', 'EQB', 'Soudeur', '3OP1', 'Sébikotane', NULL, 8, 'cdd_soon', 200000, false),
    (13, 'Pape', 'Seck', '1995-03-03', 'EQB', 'Soudeur', '3OP1', 'Sébikotane', NULL, 8, 'cdd_expired', 195000, false),
    (14, 'Serigne', 'Niang', '1987-10-10', 'CHAUD', 'Chaudronnier', '6OP3', 'Sébikotane', NULL, 5, 'cdi:2016', 300000, true),
    (15, 'Lamine', 'Diouf', '1991-01-27', 'CHAUD', 'Chaudronnier', '5OP2', 'Sébikotane', NULL, 14, 'cdd_renewed', 260000, false),
    (16, 'Mariama', 'Sy', '1993-07-07', 'CHAUD', 'Chaudronnier', '4OS2', 'Sindia', 'Sébikotane', 14, 'cdd_cdi', 240000, false),
    (17, 'Malick', 'Ka', '1989-04-04', 'ELEC', 'Électricien', '6OP3', 'Sindia', NULL, 6, 'cdi:2017', 310000, false),
    (18, 'Alioune', 'Touré', '1996-09-19', 'ELEC', 'Électricien', '4OS2', 'Sindia', NULL, 17, 'cdd_active', 220000, false),
    (19, 'Ndeye', 'Camara', '2003-02-11', 'ELEC', 'Stagiaire technique', 'STG', 'Sindia', NULL, 17, 'stage_active', 75000, false),
    (20, 'Saliou', 'Dieng', '2002-06-06', 'PROD', 'Stagiaire technique', 'STG', 'Sébikotane', NULL, 5, 'stage_soon', 75000, false),
    (21, 'Khady', 'Mbengue', '1986-11-11', 'PAIE', 'Assistant paie', '9E1', 'Dakar', NULL, 4, 'cdi:2018', 380000, false),
    (22, 'Amadou', 'Ndour', '1984-05-05', 'VENTES', 'Commercial', '10E2', 'Dakar', NULL, 23, 'cdi:2013', 420000, false),
    (23, 'Coumba', 'Sène', '1979-08-28', 'DC', 'Directeur Commercial', 'C3', 'Dakar', NULL, 1, 'cdi:2009', 1600000, false),
    (24, 'Daouda', 'Wade', '1997-12-12', 'VENTES', 'Commercial', '9E1', 'Dakar', NULL, 23, 'cdd_active', 300000, false),
    (25, 'El Hadji', 'Diop', '1970-02-02', 'MAINT', 'Mécanicien', '7AM1', 'Sindia', NULL, 6, 'cdi:2003', 450000, false),
    (26, 'Souleymane', 'Fall', '1998-03-30', 'MAINT', 'Mécanicien', '3OP1', 'Sindia', NULL, 25, 'cdd_soon', 190000, false),
    (27, 'Astou', 'Ndiaye', '1990-10-01', 'RH', 'Gestionnaire RH', '10E2', 'Dakar', NULL, 4, 'cdi:2019', 480000, false),
    (28, 'Mouhamed', 'Gueye', '1982-07-15', 'SOUD', 'Magasinier', '9E1', 'Sébikotane', NULL, 5, 'rehire', 250000, false),
    (29, 'Bineta', 'Sarr', '1999-01-09', 'COMPTA', 'Comptable', '9E1', 'Dakar', NULL, 2, 'consult', 500000, false),
    (30, 'Rokhaya', 'Ba', '1976-04-22', 'PROD', 'Ingénieur méthodes', 'C1', 'Sébikotane', 'Sindia', 5, 'consult', 900000, false),
    (31, 'Adama', 'Faye', '1993-06-13', 'EQA', 'Soudeur', '3OP1', 'Sébikotane', NULL, 8, 'cdi:2020', 225000, false),
    (32, 'Sokhna', 'Diallo', '1995-09-27', 'EQB', 'Soudeur', '3OP1', 'Sébikotane', NULL, 8, 'cdd_renewed', 205000, false),
    (33, 'Moustapha', 'Sow', '1981-03-16', 'CHAUD', 'Chaudronnier', '6OP3', 'Sébikotane', NULL, 14, 'cdi:2010', 330000, false),
    (34, 'Ibrahima', 'Kane', '1992-11-04', 'ELEC', 'Électricien', '5OP2', 'Sindia', NULL, 17, 'cdd_cdi', 270000, false),
    (35, 'Cheikh', 'Thiam', '1994-02-20', 'MAINT', 'Mécanicien', '4OS2', 'Sindia', NULL, 25, 'cdd_expired', 215000, false),
    (36, 'Fatou', 'Seck', '1988-08-18', 'COMPTA', 'Comptable', '10E2', 'Dakar', NULL, 2, 'exit_dem', 430000, false),
    (37, 'Ousmane', 'Niang', '1975-12-05', 'EQA', 'Soudeur', '5OP2', 'Sébikotane', NULL, 8, 'exit_lm', 290000, false),
    (38, 'Awa', 'Diouf', '2001-05-21', 'PROD', 'Stagiaire technique', 'STG', 'Sébikotane', NULL, 5, 'exit_stage', 70000, false),
    (39, 'Modou', 'Sy', '1996-07-30', 'EQB', 'Soudeur', '3OP1', 'Sébikotane', NULL, 8, 'exit_exp', 200000, false),
    (40, 'Aminata', 'Touré', '1985-01-12', 'VENTES', 'Commercial', '10E2', 'Dakar', 'Sindia', 23, 'cdi:2016', 410000, false);

  FOR r IN SELECT * FROM demo_emps ORDER BY idx LOOP
    INSERT INTO public.employees (matricule, first_names, last_name, birth_date, birth_place, address,
      marital_status, children_count, phone, email)
    VALUES (
      'DEMO' || lpad(r.idx::text, 3, '0'), r.first_names, r.last_name, r.birth,
      (ARRAY['Dakar', 'Thiès', 'Rufisque', 'Mbour', 'Saint-Louis', 'Kaolack'])[1 + r.idx % 6],
      (ARRAY['Sébikotane, Quartier Escale', 'Rufisque Est', 'Dakar, Grand Yoff', 'Sindia Centre', 'Diamniadio'])[1 + r.idx % 5],
      (ARRAY['celibataire', 'marie', 'marie', 'divorce'])[1 + r.idx % 4],
      r.idx % 5,
      '+221 77 ' || lpad((100 + r.idx * 7)::text, 3, '0') || ' ' || lpad((10 + r.idx * 3)::text, 2, '0') || ' ' || lpad((20 + r.idx)::text, 2, '0'),
      lower(replace(r.first_names, ' ', '')) || '.' || lower(r.last_name) || '@demo.fabrimetal.sn'
    ) RETURNING id INTO v_emp;
    UPDATE demo_emps SET id = v_emp WHERE idx = r.idx;

    INSERT INTO public.employee_sites (employee_id, site_id, is_primary)
    VALUES (v_emp, (SELECT id FROM public.sites WHERE name = r.site), true);
    IF r.site2 IS NOT NULL THEN
      INSERT INTO public.employee_sites (employee_id, site_id, is_primary)
      VALUES (v_emp, (SELECT id FROM public.sites WHERE name = r.site2), false);
    END IF;

    IF r.idx % 3 = 0 THEN
      INSERT INTO public.employee_sensitive (employee_id, id_document_type, id_document_number,
        emergency_contact_name, emergency_contact_relation, emergency_contact_phone)
      VALUES (v_emp, 'cni', '1' || lpad((751000000 + r.idx * 12347)::text, 12, '0'),
        'Contact ' || r.last_name, (ARRAY['Conjoint', 'Frère', 'Mère'])[1 + r.idx % 3], '+221 70 000 00 ' || lpad(r.idx::text, 2, '0'));
    END IF;
  END LOOP;

  UPDATE public.employees e SET manager_id = m.id
  FROM demo_emps d JOIN demo_emps m ON m.idx = d.mgr
  WHERE e.id = d.id;

  -- ---------- Contrats, affectations, sorties, rémunération ----------
  FOR r IN SELECT * FROM demo_emps ORDER BY idx LOOP
    v_unit := (SELECT id FROM demo_units WHERE key = r.unit);
    v_job := (SELECT id FROM public.job_titles WHERE name = r.job);
    v_cat := (SELECT id FROM public.categories WHERE code = r.cat);
    v_status := (SELECT default_status FROM public.categories WHERE id = v_cat);
    v_c1 := NULL; v_c2 := NULL;

    IF r.plan LIKE 'cdi:%' THEN
      v_start := make_date(split_part(r.plan, ':', 2)::int, 3, 1);
      INSERT INTO public.contracts (employee_id, type, start_date) VALUES (r.id, 'cdi', v_start);
    ELSIF r.plan = 'cdd_cdi' THEN
      v_start := (date_trunc('month', t) - interval '3 years')::date;
      INSERT INTO public.contracts (employee_id, type, start_date, duration_months)
      VALUES (r.id, 'cdd', v_start, 12) RETURNING id, end_date INTO v_c1, v_end;
      INSERT INTO public.contracts (employee_id, type, start_date, previous_contract_id)
      VALUES (r.id, 'cdi', v_end + 1, v_c1);
    ELSIF r.plan = 'cdd_active' THEN
      v_start := (t - interval '6 months')::date;
      INSERT INTO public.contracts (employee_id, type, start_date, duration_months) VALUES (r.id, 'cdd', v_start, 12);
    ELSIF r.plan = 'cdd_soon' THEN
      v_start := (t - interval '12 months' + interval '25 days')::date;
      INSERT INTO public.contracts (employee_id, type, start_date, duration_months) VALUES (r.id, 'cdd', v_start, 12);
    ELSIF r.plan = 'cdd_expired' THEN
      v_start := (t - interval '13 months')::date;
      INSERT INTO public.contracts (employee_id, type, start_date, duration_months) VALUES (r.id, 'cdd', v_start, 12);
    ELSIF r.plan = 'cdd_renewed' THEN
      v_start := (t - interval '18 months')::date;
      INSERT INTO public.contracts (employee_id, type, start_date, duration_months)
      VALUES (r.id, 'cdd', v_start, 12) RETURNING id, end_date INTO v_c1, v_end;
      INSERT INTO public.contracts (employee_id, type, start_date, duration_months, previous_contract_id)
      VALUES (r.id, 'cdd', v_end + 1, 12, v_c1);
    ELSIF r.plan = 'stage_active' THEN
      v_start := (t - interval '2 months')::date;
      INSERT INTO public.contracts (employee_id, type, start_date, duration_months) VALUES (r.id, 'stage', v_start, 6);
    ELSIF r.plan = 'stage_soon' THEN
      v_start := (t - interval '6 months' + interval '20 days')::date;
      INSERT INTO public.contracts (employee_id, type, start_date, duration_months) VALUES (r.id, 'stage', v_start, 6);
    ELSIF r.plan = 'consult' THEN
      v_start := (t - interval '4 months')::date;
      INSERT INTO public.contracts (employee_id, type, start_date, duration_months) VALUES (r.id, 'consultant', v_start, 12);
    ELSIF r.plan = 'exit_dem' THEN
      v_start := make_date(2017, 3, 1);
      INSERT INTO public.contracts (employee_id, type, start_date) VALUES (r.id, 'cdi', v_start);
    ELSIF r.plan = 'exit_lm' THEN
      v_start := make_date(2001, 3, 1);
      INSERT INTO public.contracts (employee_id, type, start_date) VALUES (r.id, 'cdi', v_start);
    ELSIF r.plan = 'exit_stage' THEN
      v_start := (t - interval '9 months')::date;
      INSERT INTO public.contracts (employee_id, type, start_date, duration_months) VALUES (r.id, 'stage', v_start, 6);
    ELSIF r.plan = 'exit_exp' THEN
      v_start := (t - interval '15 months')::date;
      INSERT INTO public.contracts (employee_id, type, start_date, duration_months) VALUES (r.id, 'cdd', v_start, 12);
    ELSIF r.plan = 'rehire' THEN
      v_start := make_date(2019, 1, 1);
      INSERT INTO public.contracts (employee_id, type, start_date, duration_months) VALUES (r.id, 'cdd', v_start, 12);
    END IF;

    -- Affectation(s)
    IF r.promoted THEN
      v_low_cat := (SELECT id FROM public.categories WHERE sort_order < (SELECT sort_order FROM public.categories WHERE id = v_cat)
                    ORDER BY sort_order DESC LIMIT 1);
      INSERT INTO public.assignments (employee_id, org_unit_id, job_title_id, category_id, status, start_date)
      VALUES (r.id, v_unit, v_job, v_low_cat, (SELECT default_status FROM public.categories WHERE id = v_low_cat), v_start);
      INSERT INTO public.assignments (employee_id, org_unit_id, job_title_id, category_id, status, start_date)
      VALUES (r.id, v_unit, v_job, v_cat, v_status, (date_trunc('month', t) - interval '2 years')::date);
    ELSE
      INSERT INTO public.assignments (employee_id, org_unit_id, job_title_id, category_id, status, start_date)
      VALUES (r.id, v_unit, v_job, v_cat, v_status, v_start);
    END IF;

    -- Rémunération (embauche puis révision)
    INSERT INTO public.compensation (employee_id, net_monthly_salary_fcfa, effective_date)
    VALUES (r.id, (round(r.salary * 0.85 / 5000) * 5000)::bigint, v_start);
    IF v_start < (t - interval '14 months')::date THEN
      INSERT INTO public.compensation (employee_id, net_monthly_salary_fcfa, effective_date)
      VALUES (r.id, r.salary, (date_trunc('year', t) - interval '1 year')::date);
    END IF;

    -- Sorties
    IF r.plan = 'exit_dem' THEN
      INSERT INTO public.exits (employee_id, exit_date, reason_id, notes)
      VALUES (r.id, (t - interval '5 months')::date, (SELECT id FROM public.exit_reasons WHERE name = 'Démission'), 'Préavis effectué.');
    ELSIF r.plan = 'exit_lm' THEN
      INSERT INTO public.exits (employee_id, exit_date, reason_id, notes)
      VALUES (r.id, (t - interval '8 months')::date, (SELECT id FROM public.exit_reasons WHERE name = 'Longue maladie'), 'Dossier médical transmis à la médecine du travail.');
    ELSIF r.plan IN ('exit_stage', 'exit_exp', 'rehire') THEN
      SELECT end_date INTO v_end FROM public.contracts WHERE employee_id = r.id ORDER BY start_date DESC LIMIT 1;
      INSERT INTO public.exits (employee_id, exit_date, reason_id)
      VALUES (r.id, v_end, (SELECT id FROM public.exit_reasons WHERE name =
        CASE r.plan WHEN 'exit_stage' THEN 'Fin de stage' ELSE 'Expiration normale de contrat' END));
    END IF;

    -- Réembauche : même matricule, nouveau contrat et nouvelle affectation
    IF r.plan = 'rehire' THEN
      INSERT INTO public.contracts (employee_id, type, start_date) VALUES (r.id, 'cdi', make_date(2023, 3, 1));
      INSERT INTO public.assignments (employee_id, org_unit_id, job_title_id, category_id, status, start_date)
      VALUES (r.id, v_unit, v_job, v_cat, v_status, make_date(2023, 3, 1));
      INSERT INTO public.compensation (employee_id, net_monthly_salary_fcfa, effective_date)
      VALUES (r.id, r.salary, make_date(2023, 3, 1));
    END IF;
  END LOOP;
END $$;
