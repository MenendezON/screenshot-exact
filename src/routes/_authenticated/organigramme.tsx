import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Crown, Users } from "lucide-react";

import { PageHeader } from "@/components/app-shell";
import { FormRow, SelectInput } from "@/components/employees/common";
import {
  buildOrgChart,
  chartEmployeesQuery,
  type ChartMember,
  type ChartNode,
} from "@/lib/org-chart";
import { ORG_TYPE_LABELS, orgUnitsQuery, sitesQuery } from "@/lib/referentials";

const DESCRIPTION = "Unités de l'entreprise et collaborateurs en poste, filtrables par site.";

export const Route = createFileRoute("/_authenticated/organigramme")({
  validateSearch: (raw: Record<string, unknown>): { site?: string } =>
    typeof raw["site"] === "string" && /^[0-9a-f-]{36}$/i.test(raw["site"])
      ? { site: raw["site"] }
      : {},
  head: () => ({
    meta: [
      { title: "Organigramme — Fabri RH" },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OrgChartPage,
});

function OrgChartPage() {
  const { site = "" } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: units = [], isLoading: unitsLoading } = useQuery(orgUnitsQuery);
  const { data: sites = [] } = useQuery(sitesQuery);
  const { data: rows = [], isLoading, error } = useQuery(chartEmployeesQuery);

  const chart = buildOrgChart(units, rows, site);
  const siteName = sites.find((s) => s.id === site)?.name;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader eyebrow="Personnel" title="Organigramme" description={DESCRIPTION} />
      <div className="mb-6 flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="w-full sm:max-w-xs">
          <FormRow label="Site">
            <SelectInput
              value={site}
              onChange={(v) => navigate({ search: v ? { site: v } : {}, replace: true })}
              emptyLabel="Tous les sites"
              options={sites
                .filter((s) => !s.archived_at)
                .map((s) => ({ value: s.id, label: s.name }))}
            />
          </FormRow>
        </div>
        <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
          <Users className="size-4" />
          {chart.total} collaborateur{chart.total > 1 ? "s" : ""} en poste
          {siteName ? ` à ${siteName}` : ""}
        </p>
      </div>

      {isLoading || unitsLoading ? (
        <p className="py-12 text-center text-muted-foreground">Chargement…</p>
      ) : error ? (
        <p className="py-12 text-center text-destructive">Impossible de charger l'organigramme.</p>
      ) : chart.total === 0 ? (
        <p className="rounded-lg border bg-card px-5 py-12 text-center text-muted-foreground">
          {site
            ? "Aucun collaborateur en poste sur ce site."
            : "Aucun collaborateur dans votre périmètre."}
        </p>
      ) : (
        <div className="space-y-3">
          {chart.roots.map((n) => (
            <UnitNode key={n.unit.id} node={n} />
          ))}
          {chart.unassigned.length > 0 && (
            <section className="rounded-lg border bg-card">
              <h2 className="border-b px-5 py-3 text-sm font-bold">
                Sans unité active{" "}
                <span className="font-normal text-muted-foreground">
                  ({chart.unassigned.length})
                </span>
              </h2>
              <Members members={chart.unassigned} />
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function UnitNode({ node }: { node: ChartNode }) {
  return (
    <details
      open={node.depth < 2}
      className="group rounded-lg border bg-card"
      style={{ marginLeft: node.depth > 0 ? "1rem" : undefined }}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 marker:hidden">
        <ChevronRight
          className="size-4 shrink-0 transition-transform group-open:rotate-90"
          aria-hidden
        />
        <span className="font-bold">{node.unit.name}</span>
        <span className="rounded-sm bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
          {ORG_TYPE_LABELS[node.unit.type]}
        </span>
        <span className="ml-auto text-sm text-muted-foreground">{node.total}</span>
      </summary>
      {node.members.length > 0 && <Members members={node.members} />}
      {node.children.length > 0 && (
        <div className="space-y-2 px-3 pb-3 pt-1">
          {node.children.map((c) => (
            <UnitNode key={c.unit.id} node={c} />
          ))}
        </div>
      )}
    </details>
  );
}

function Members({ members }: { members: ChartMember[] }) {
  return (
    <ul className="grid gap-px border-t bg-border sm:grid-cols-2">
      {members.map((m) => (
        <li key={m.id} className="bg-card">
          <Link
            to="/employes/$employeeId"
            params={{ employeeId: m.id }}
            className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted"
          >
            <span
              className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-xs font-bold text-secondary-foreground"
              aria-hidden
            >
              {m.name
                .split(" ")
                .slice(0, 2)
                .map((p) => p.charAt(0))
                .join("")
                .toUpperCase()}
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 truncate text-sm font-medium">
                {m.name}
                {m.isManager && (
                  <Crown className="size-3.5 shrink-0 text-primary" aria-label="Responsable" />
                )}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {m.jobTitle ?? "Poste non renseigné"}
                {m.siteName ? ` · ${m.siteName}` : ""}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
