import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { EmployeeRow } from "@/lib/employees";
import { buildOrgTree, listAll, type OrgNode, type OrgUnit } from "@/lib/referentials";

export type ChartMember = {
  id: string;
  name: string;
  matricule: string;
  jobTitle: string | null;
  siteName: string | null;
  isManager: boolean;
};

export type ChartNode = {
  unit: OrgUnit;
  depth: number;
  members: ChartMember[];
  children: ChartNode[];
  /** Effectif de l'unité et de toutes ses sous-unités. */
  total: number;
};

export type OrgChart = { roots: ChartNode[]; unassigned: ChartMember[]; total: number };

const memberOf = (r: EmployeeRow, managerIds: Set<string>): ChartMember => ({
  id: r.employee_id ?? "",
  name: [r.last_name, r.first_names].filter(Boolean).join(" ") || "—",
  matricule: r.matricule ?? "",
  jobTitle: r.job_title_name,
  siteName: r.primary_site_name,
  isManager: !!r.employee_id && managerIds.has(r.employee_id),
});

const byName = (a: ChartMember, b: ChartMember) => a.name.localeCompare(b.name, "fr");

/**
 * Organigramme : arbre des unités actives avec leurs collaborateurs en poste. Quand `siteId` est
 * renseigné, seuls les collaborateurs rattachés à ce site sont retenus et les branches vides
 * disparaissent. Les collaborateurs sans unité active vont dans `unassigned`.
 */
export function buildOrgChart(units: OrgUnit[], rows: EmployeeRow[], siteId: string): OrgChart {
  const active = rows.filter((r) => r.employee_id && r.is_active && !r.archived_at);
  const visible = siteId ? active.filter((r) => (r.site_ids ?? []).includes(siteId)) : active;
  // Responsables : ceux dont au moins un collaborateur visible dépend.
  const managerIds = new Set(visible.map((r) => r.manager_id).filter((id): id is string => !!id));

  const tree = buildOrgTree(units, false);
  const unitIds = new Set<string>();
  const collect = (nodes: OrgNode[]) =>
    nodes.forEach((n) => (unitIds.add(n.id), collect(n.children)));
  collect(tree);

  const byUnit = new Map<string, ChartMember[]>();
  const unassigned: ChartMember[] = [];
  for (const r of visible) {
    const m = memberOf(r, managerIds);
    if (r.org_unit_id && unitIds.has(r.org_unit_id))
      byUnit.set(r.org_unit_id, [...(byUnit.get(r.org_unit_id) ?? []), m]);
    else unassigned.push(m);
  }

  const build = (node: OrgNode): ChartNode => {
    const members = (byUnit.get(node.id) ?? []).sort(byName);
    const children = node.children.map(build).filter((c) => c.total > 0 || !siteId);
    const { children: _omit, depth: _d, ...unit } = node;
    void _omit;
    void _d;
    return {
      unit,
      depth: node.depth,
      members,
      children,
      total: members.length + children.reduce((n, c) => n + c.total, 0),
    };
  };

  const roots = tree.map(build).filter((r) => r.total > 0 || !siteId);
  return { roots, unassigned: unassigned.sort(byName), total: visible.length };
}

/** Tous les employés actifs (pagination interne : la vue est limitée à 1000 lignes par requête). */
export const chartEmployeesQuery = queryOptions({
  queryKey: ["employees", "org-chart"],
  queryFn: () =>
    listAll<EmployeeRow>(
      (from, to) =>
        supabase
          .from("v_employee_current")
          .select(
            "employee_id, matricule, first_names, last_name, manager_id, archived_at, org_unit_id, job_title_name, primary_site_name, site_ids, is_active",
          )
          .eq("is_active", true)
          .is("archived_at", null)
          .order("employee_id")
          .range(from, to) as unknown as PromiseLike<{
          data: EmployeeRow[] | null;
          error: unknown;
        }>,
    ),
});
