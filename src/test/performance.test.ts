import { describe, expect, it } from "vitest";

import { buildDashboard, type DashboardSource } from "@/lib/dashboard";
import { analyzeImport, type ImportContext, type SourceRow } from "@/lib/import/analyze";
import { buildMapping } from "@/lib/import/normalize";
import type { OrgUnit } from "@/lib/referentials";

// Budget volontairement large : ces tests détectent une dérive (complexité quadratique),
// pas un chrono précis. Le chrono des pages réelles se mesure selon docs/recette.md.
const BUDGET_MS = 1000;
const N = 900;

const units = [
  { id: "dir", type: "direction", parent_id: null, name: "Dir", archived_at: null },
  ...Array.from({ length: 20 }, (_, i) => ({
    id: `d${i}`,
    type: "departement",
    parent_id: "dir",
    name: `Dép ${i}`,
    archived_at: null,
  })),
] as OrgUnit[];

describe("performance (900 employés, plusieurs milliers de lignes d'historique)", () => {
  it("construit le tableau de bord sous le budget", () => {
    const people = Array.from({ length: N }, (_, i) => ({
      employee_id: `e${i}`,
      status: i % 3 ? "employe" : "cadre",
      contract_type: i % 4 ? "cdi" : "cdd",
      primary_site_id: `s${i % 5}`,
      primary_site_name: `Site ${i % 5}`,
      org_unit_id: `d${i % 20}`,
      is_active: i % 10 !== 0,
      archived_at: null,
    }));
    const src = {
      people,
      metrics: people.map((p, i) => ({
        employee_id: p.employee_id,
        hire_date: `20${10 + (i % 15)}-0${1 + (i % 9)}-15`,
        age_years: 25 + (i % 35),
        seniority_months: i % 200,
      })),
      exits: people
        .filter((p) => !p.is_active)
        .map((p) => ({ employee_id: p.employee_id, exit_date: "2025-06-30" })),
      salaries: Array.from({ length: 4000 }, (_, i) => ({
        employee_id: `e${i % N}`,
        amount: 200000 + (i % 50) * 10000,
        effective_date: `20${15 + (i % 10)}-01-01`,
      })),
    } as unknown as DashboardSource;
    const t = performance.now();
    const d = buildDashboard(src, units, {}, "mois", "2026-11-10");
    const ms = performance.now() - t;
    expect(d.headcount).toBe(N - N / 10);
    expect(ms).toBeLessThan(BUDGET_MS);
  });

  it("analyse un import de 900 employés / 3 000 contrats sous le budget", () => {
    const ctx: ImportContext = {
      today: "2026-11-10",
      fixedTermMaxMonths: 24,
      departments: buildMapping([{ raw: "PROD", canonical: "Production" }]),
      jobTitles: buildMapping([]),
      categories: buildMapping([]),
      exitReasons: buildMapping([]),
      statusMapping: buildMapping([{ raw: "Ouvrier", canonical: "ouvrier" }]),
      categoryStatus: new Map([["4OS2", "ouvrier"]]),
      known: {
        departments: new Set(["production"]),
        jobTitles: new Set(["soudeur"]),
        categories: new Set(["4os2"]),
        exitReasons: new Set(),
        sites: new Set(["dakar"]),
      },
    };
    const rows: SourceRow[] = [];
    for (let e = 0; e < N; e++)
      for (let k = 0; k < 3; k++)
        rows.push({
          rowNumber: rows.length + 2,
          matricule: `F${String(e).padStart(4, "0")}`,
          last_name: "Diop",
          first_names: "Awa",
          department: "PROD",
          job_title: "Soudeur",
          category: "4OS2",
          status: "Ouvrier",
          contract_type: "CDD",
          contract_start: `01/01/${2020 + k * 2}`,
          contract_duration_months: 12,
          in_post: "Non",
          salary: "300000",
          sites: "Dakar",
        } as SourceRow);
    const t = performance.now();
    const plan = analyzeImport(rows, ctx);
    const ms = performance.now() - t;
    expect(plan.employees).toHaveLength(N);
    expect(plan.rowCount).toBe(N * 3);
    expect(ms).toBeLessThan(BUDGET_MS);
  });
});
