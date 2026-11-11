import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { CONTRACT_LABELS, type ContractType } from "@/lib/employee-schemas";
import {
  descendantIds,
  listAll,
  STATUS_LABELS,
  type EmployeeStatus,
  type OrgUnit,
} from "@/lib/referentials";

// ---------- Statistiques ----------

export type Stats = { mean: number; median: number; min: number; max: number; count: number };

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function stats(values: number[]): Stats | null {
  if (values.length === 0) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  return {
    mean: sum / values.length,
    median: median(values)!,
    min: Math.min(...values),
    max: Math.max(...values),
    count: values.length,
  };
}

export const round1 = (n: number) => Math.round(n * 10) / 10;

// ---------- Sources (vues SQL, lues en entier page par page) ----------

export type PersonSource = {
  employee_id: string;
  status: EmployeeStatus | null;
  contract_type: ContractType | null;
  primary_site_id: string | null;
  primary_site_name: string | null;
  org_unit_id: string | null;
  is_active: boolean | null;
  archived_at: string | null;
  gender?: string | null;
};
export type MetricSource = {
  employee_id: string;
  hire_date: string | null;
  age_years: number | null;
  seniority_months: number | null;
};
export type ExitSource = { employee_id: string; exit_date: string };
export type SalarySource = { employee_id: string; amount: number; effective_date: string };

export type DashboardSource = {
  people: PersonSource[];
  metrics: MetricSource[];
  exits: ExitSource[];
  /** null si l'utilisateur n'a pas la permission « rémunération ». */
  salaries: SalarySource[] | null;
};

/** Lit toutes les lignes visibles (périmètre de l'utilisateur appliqué par la base), sans plafond de lignes. */
export const dashboardSourceQuery = (withSalaries: boolean) =>
  queryOptions({
    queryKey: ["dashboard", "source", withSalaries],
    staleTime: 60_000,
    queryFn: async (): Promise<DashboardSource> => {
      const [people, metrics, exits, salaries] = await Promise.all([
        listAll((from, to) =>
          supabase
            .from("v_employee_current")
            .select(
              "employee_id, status, contract_type, primary_site_id, primary_site_name, org_unit_id, is_active, archived_at, gender",
            )
            .order("employee_id")
            .range(from, to),
        ),
        listAll((from, to) =>
          supabase
            .from("v_employee_metrics")
            .select("employee_id, hire_date, age_years, seniority_months")
            .order("employee_id")
            .range(from, to),
        ),
        listAll((from, to) =>
          supabase
            .from("v_exit_details")
            .select("employee_id, exit_date, id")
            .is("archived_at", null)
            .order("id")
            .range(from, to),
        ),
        withSalaries
          ? listAll((from, to) =>
              supabase
                .from("compensation")
                .select("id, employee_id, net_monthly_salary_fcfa, effective_date")
                .is("archived_at", null)
                .order("id")
                .range(from, to),
            )
          : Promise.resolve(null),
      ]);
      return {
        people: people.flatMap((p) => (p.employee_id ? [p as unknown as PersonSource] : [])),
        metrics: metrics.flatMap((m) => (m.employee_id ? [m as unknown as MetricSource] : [])),
        exits: exits.flatMap((x) =>
          x.employee_id && x.exit_date
            ? [{ employee_id: x.employee_id, exit_date: x.exit_date }]
            : [],
        ),
        salaries: salaries
          ? salaries.map((c) => ({
              employee_id: c.employee_id,
              amount: Number(c.net_monthly_salary_fcfa),
              effective_date: c.effective_date,
            }))
          : null,
      };
    },
  });

// ---------- Calculs ----------

export type DashboardFilters = { site?: string | undefined; unit?: string | undefined };
export type PeriodKind = "mois" | "annee";

export type Slice = { label: string; value: number };
export type FlowPoint = { key: string; label: string; entries: number; exits: number };

export type Dashboard = {
  headcount: number;
  age: { mean: number; median: number } | null;
  seniorityMonths: number | null;
  salary: Stats | null;
  byStatus: Slice[];
  byContract: Slice[];
  byGender: Slice[];
  bySite: Slice[];
  byDepartment: Slice[];
  flows: FlowPoint[];
};

/** Département d'une unité : elle-même ou son plus proche ancêtre de type « département ». */
export function departmentOf(unitId: string | null, units: OrgUnit[]): string | null {
  const byId = new Map(units.map((u) => [u.id, u]));
  let cursor = unitId ? byId.get(unitId) : undefined;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor.id)) {
    if (cursor.type === "departement") return cursor.name;
    seen.add(cursor.id);
    cursor = cursor.parent_id ? byId.get(cursor.parent_id) : undefined;
  }
  return null;
}

function tally(labels: Array<string | null>, empty: string): Slice[] {
  const map = new Map<string, number>();
  for (const l of labels) map.set(l ?? empty, (map.get(l ?? empty) ?? 0) + 1);
  return [...map.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, "fr"));
}

const MONTHS = [
  "janv.",
  "févr.",
  "mars",
  "avr.",
  "mai",
  "juin",
  "juil.",
  "août",
  "sept.",
  "oct.",
  "nov.",
  "déc.",
];

export function periodKey(iso: string, kind: PeriodKind): string {
  return kind === "mois" ? iso.slice(0, 7) : iso.slice(0, 4);
}
export function periodLabel(key: string): string {
  if (key.length === 4) return key;
  const [y, m] = key.split("-");
  return `${MONTHS[Number(m) - 1]} ${y}`;
}

/** Clés consécutives : 24 derniers mois, ou toutes les années depuis la première date. */
export function periodRange(kind: PeriodKind, today: string, firstDate: string | null): string[] {
  const [ty, tm] = today.split("-").map(Number) as [number, number];
  if (kind === "annee") {
    const start = firstDate ? Number(firstDate.slice(0, 4)) : ty;
    return Array.from({ length: ty - Math.min(start, ty) + 1 }, (_, i) =>
      String(Math.min(start, ty) + i),
    );
  }
  const out: string[] = [];
  for (let i = 23; i >= 0; i--) {
    const total = ty * 12 + (tm - 1) - i;
    out.push(`${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`);
  }
  return out;
}

export function buildDashboard(
  src: DashboardSource,
  units: OrgUnit[],
  filters: DashboardFilters,
  period: PeriodKind,
  today: string,
): Dashboard {
  const unitIds = filters.unit ? descendantIds(units, filters.unit) : null;
  const inFilter = (p: PersonSource) =>
    (!filters.site || p.primary_site_id === filters.site) &&
    (!unitIds || (p.org_unit_id !== null && unitIds.has(p.org_unit_id)));

  const scoped = src.people.filter(inFilter);
  const scopedIds = new Set(scoped.map((p) => p.employee_id));
  const active = scoped.filter((p) => p.is_active && !p.archived_at);
  const activeIds = new Set(active.map((p) => p.employee_id));
  const metrics = new Map(src.metrics.map((m) => [m.employee_id, m]));

  const ages = active.flatMap((p) => {
    const a = metrics.get(p.employee_id)?.age_years;
    return a === null || a === undefined ? [] : [a];
  });
  const seniority = active.flatMap((p) => {
    const s = metrics.get(p.employee_id)?.seniority_months;
    return s === null || s === undefined ? [] : [s];
  });

  // Rémunération en vigueur : la plus récente dont la date d'effet est passée.
  let salary: Stats | null = null;
  if (src.salaries) {
    const latest = new Map<string, SalarySource>();
    for (const c of src.salaries) {
      if (!activeIds.has(c.employee_id) || c.effective_date > today) continue;
      const cur = latest.get(c.employee_id);
      if (!cur || c.effective_date > cur.effective_date) latest.set(c.employee_id, c);
    }
    salary = stats([...latest.values()].map((c) => c.amount));
  }

  const entries = scoped.flatMap((p) => {
    const h = metrics.get(p.employee_id)?.hire_date;
    return h ? [h] : [];
  });
  const exitDates = src.exits.filter((x) => scopedIds.has(x.employee_id)).map((x) => x.exit_date);
  const first = [...entries, ...exitDates].sort()[0] ?? null;
  const keys = periodRange(period, today, first);
  const flowMap = new Map(keys.map((k) => [k, { entries: 0, exits: 0 }]));
  for (const d of entries) {
    const f = flowMap.get(periodKey(d, period));
    if (f) f.entries++;
  }
  for (const d of exitDates) {
    const f = flowMap.get(periodKey(d, period));
    if (f) f.exits++;
  }

  return {
    headcount: active.length,
    age: ages.length
      ? { mean: round1(ages.reduce((a, b) => a + b, 0) / ages.length), median: median(ages)! }
      : null,
    seniorityMonths: seniority.length
      ? round1(seniority.reduce((a, b) => a + b, 0) / seniority.length)
      : null,
    salary,
    byStatus: tally(
      active.map((p) => (p.status ? STATUS_LABELS[p.status] : null)),
      "Non renseigné",
    ),
    byContract: tally(
      active.map((p) => (p.contract_type ? CONTRACT_LABELS[p.contract_type] : null)),
      "Sans contrat",
    ),
    byGender: tally(
      active.map((p) => (p.gender === "F" ? "Femmes" : p.gender === "M" ? "Hommes" : null)),
      "Non renseigné",
    ),
    bySite: tally(
      active.map((p) => p.primary_site_name),
      "Non renseigné",
    ),
    byDepartment: tally(
      active.map((p) => departmentOf(p.org_unit_id, units)),
      "Non rattaché",
    ),
    flows: keys.map((k) => ({ key: k, label: periodLabel(k), ...flowMap.get(k)! })),
  };
}
