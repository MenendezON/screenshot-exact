import { describe, expect, it } from "vitest";

import {
  buildDashboard,
  departmentOf,
  median,
  periodLabel,
  periodRange,
  stats,
  type DashboardSource,
} from "@/lib/dashboard";
import type { OrgUnit } from "@/lib/referentials";

const unit = (id: string, type: OrgUnit["type"], parent: string | null, name = id): OrgUnit =>
  ({ id, type, parent_id: parent, name, archived_at: null }) as OrgUnit;
const units = [
  unit("dir", "direction", null),
  unit("dep1", "departement", "dir", "Production"),
  unit("srv1", "service", "dep1"),
  unit("dep2", "departement", "dir", "Finance"),
];

const person = (id: string, over: Record<string, unknown> = {}) => ({
  employee_id: id,
  status: "employe",
  contract_type: "cdi",
  primary_site_id: "s1",
  primary_site_name: "Dakar",
  org_unit_id: "srv1",
  is_active: true,
  archived_at: null,
  ...over,
});

const src: DashboardSource = {
  people: [
    person("a"),
    person("b", {
      status: "cadre",
      contract_type: "cdd",
      primary_site_id: "s2",
      primary_site_name: "Thiès",
      org_unit_id: "dep2",
    }),
    person("c", { is_active: false }),
    person("d", { org_unit_id: null }),
  ] as DashboardSource["people"],
  metrics: [
    { employee_id: "a", hire_date: "2026-10-05", age_years: 30, seniority_months: 12 },
    { employee_id: "b", hire_date: "2026-09-01", age_years: 40, seniority_months: 24 },
    { employee_id: "c", hire_date: "2020-01-10", age_years: 50, seniority_months: 60 },
    { employee_id: "d", hire_date: null, age_years: null, seniority_months: null },
  ],
  exits: [{ employee_id: "c", exit_date: "2026-10-31" }],
  salaries: [
    { employee_id: "a", amount: 300000, effective_date: "2025-01-01" },
    { employee_id: "a", amount: 400000, effective_date: "2026-01-01" },
    { employee_id: "a", amount: 900000, effective_date: "2027-01-01" }, // futur : ignoré
    { employee_id: "b", amount: 600000, effective_date: "2026-03-01" },
    { employee_id: "c", amount: 1000000, effective_date: "2026-03-01" }, // sorti : ignoré
  ],
};
const TODAY = "2026-11-10";

describe("statistiques", () => {
  it("calcule moyenne, médiane, min et max", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
    expect(stats([100, 200, 600])).toEqual({
      mean: 300,
      median: 200,
      min: 100,
      max: 600,
      count: 3,
    });
    expect(stats([])).toBeNull();
  });
});

describe("tableau de bord", () => {
  const all = buildDashboard(src, units, {}, "mois", TODAY);

  it("ne compte que les employés actifs", () => {
    expect(all.headcount).toBe(3); // a, b, d (c est sorti)
    expect(all.age).toEqual({ mean: 35, median: 35 });
    expect(all.seniorityMonths).toBe(18);
  });
  it("calcule les salaires en vigueur des actifs uniquement", () => {
    expect(all.salary).toEqual({
      mean: 500000,
      median: 500000,
      min: 400000,
      max: 600000,
      count: 2,
    });
  });
  it("n'expose aucun salaire sans la permission", () => {
    expect(buildDashboard({ ...src, salaries: null }, units, {}, "mois", TODAY).salary).toBeNull();
  });
  it("répartit par statut, contrat, site et département", () => {
    expect(all.byStatus).toEqual([
      { label: "Employé", value: 2 },
      { label: "Cadre", value: 1 },
    ]);
    expect(all.byContract.find((s) => s.label === "CDD")?.value).toBe(1);
    expect(all.bySite).toEqual([
      { label: "Dakar", value: 2 },
      { label: "Thiès", value: 1 },
    ]);
    expect(all.byDepartment).toEqual([
      { label: "Finance", value: 1 },
      { label: "Non rattaché", value: 1 },
      { label: "Production", value: 1 },
    ]);
  });
  it("filtre par site et par unité (sous-unités comprises)", () => {
    expect(buildDashboard(src, units, { site: "s2" }, "mois", TODAY).headcount).toBe(1);
    expect(buildDashboard(src, units, { unit: "dep1" }, "mois", TODAY).headcount).toBe(1); // a via srv1
    expect(buildDashboard(src, units, { unit: "dep1", site: "s2" }, "mois", TODAY).headcount).toBe(
      0,
    );
  });
  it("compte entrées et sorties par mois sur 24 mois, zéros compris", () => {
    expect(all.flows).toHaveLength(24);
    expect(all.flows.at(-1)!.label).toBe("nov. 2026");
    const oct = all.flows.find((f) => f.key === "2026-10")!;
    expect(oct).toMatchObject({ entries: 1, exits: 1 });
    expect(all.flows.find((f) => f.key === "2026-09")!.entries).toBe(1);
    expect(all.flows.find((f) => f.key === "2026-08")).toMatchObject({ entries: 0, exits: 0 });
  });
  it("compte par année depuis la première date", () => {
    const years = buildDashboard(src, units, {}, "annee", TODAY).flows;
    expect(years.map((y) => y.key)).toEqual([
      "2020",
      "2021",
      "2022",
      "2023",
      "2024",
      "2025",
      "2026",
    ]);
    expect(years[0]!.entries).toBe(1);
    expect(years.at(-1)).toMatchObject({ entries: 2, exits: 1 });
  });
});

describe("aides", () => {
  it("trouve le département d'une unité", () => {
    expect(departmentOf("srv1", units)).toBe("Production");
    expect(departmentOf("dep2", units)).toBe("Finance");
    expect(departmentOf("dir", units)).toBeNull();
    expect(departmentOf(null, units)).toBeNull();
  });
  it("formate les périodes", () => {
    expect(periodLabel("2026-02")).toBe("févr. 2026");
    expect(periodLabel("2026")).toBe("2026");
    expect(periodRange("mois", "2026-02-10", null)[0]).toBe("2024-03");
  });
});
