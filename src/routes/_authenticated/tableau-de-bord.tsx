import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { PageHeader } from "@/components/app-shell";
import { matchesFollowup } from "@/components/contracts/followup";
import { FormRow, SelectInput } from "@/components/employees/common";
import { Button } from "@/components/ui/button";
import {
  buildDashboard,
  dashboardSourceQuery,
  type Dashboard,
  type PeriodKind,
  type Slice,
} from "@/lib/dashboard";
import {
  contractAlertsQuery,
  remainingLabel,
  retirementQuery,
  upcomingEnds,
} from "@/lib/contracts";
import { todayIso } from "@/lib/employee-schemas";
import { formatFCFA } from "@/lib/format";
import { formatSeniority } from "@/lib/employees";
import { usePermission } from "@/lib/permissions";
import { orgUnitsQuery, sitesQuery } from "@/lib/referentials";
import { settingsQuery } from "@/lib/settings";
import { downloadTableCsv, downloadTableXlsx, type ExportTable } from "@/lib/table-export";

const TITLE = "Tableaux de bord";
const DESCRIPTION =
  "Effectifs, rémunérations, répartitions et mouvements du personnel, dans votre périmètre d'accès.";

// Palette validée (daltonisme et contraste) : encre ardoise pour une série unique, rouge et bleu pour deux séries.
const INK = "#333D46";
const RED = "#E32624";
const BLUE = "#3B7DB5";
// Une couleur par catégorie (barres de répartition) ; chaque barre est aussi étiquetée par son axe et son tableau.
const CATEGORY_COLORS = ["#3B7DB5", "#E32624", "#2A9D8F", "#E9A23B", "#7A5BA6", "#D1618A", "#6C8E3F", "#333D46"];

type Search = {
  site?: string | undefined;
  unit?: string | undefined;
  periode?: PeriodKind | undefined;
};
const UUID = /^[0-9a-f-]{36}$/i;

export const Route = createFileRoute("/_authenticated/tableau-de-bord")({
  validateSearch: (raw: Record<string, unknown>): Search => {
    const out: Search = {};
    if (typeof raw["site"] === "string" && UUID.test(raw["site"])) out.site = raw["site"];
    if (typeof raw["unit"] === "string" && UUID.test(raw["unit"])) out.unit = raw["unit"];
    if (raw["periode"] === "annee") out.periode = "annee";
    return out;
  },
  head: () => ({
    meta: [
      { title: `${TITLE} — Fabri RH` },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const period: PeriodKind = search.periode ?? "mois";
  const today = todayIso();
  const canSalary = usePermission("compensation", "view");
  const canExport = usePermission("import_export", "export");

  const { data: source, error, isLoading } = useQuery(dashboardSourceQuery(canSalary));
  const { data: units = [] } = useQuery(orgUnitsQuery);
  const { data: sites = [] } = useQuery(sitesQuery);
  const { data: alerts } = useQuery(contractAlertsQuery);
  const { data: settings } = useQuery(settingsQuery);
  const noticeRaw = settings?.find((s) => s.key === "notice_days_cdi")?.value;
  const noticeDays = typeof noticeRaw === "number" ? noticeRaw : 60;
  const { data: retirements } = useQuery({
    ...retirementQuery(today, noticeDays),
    enabled: settings !== undefined,
  });

  const data = source
    ? buildDashboard(source, units, { site: search.site, unit: search.unit }, period, today)
    : null;
  const ends = alerts
    ? upcomingEnds(alerts).filter((r) => matchesFollowup(r, search, units))
    : null;
  const retiring = retirements
    ? retirements.filter((r) => r.alert && matchesFollowup(r, search, units))
    : null;

  const set = (patch: Partial<Search>) =>
    navigate({
      search: (prev: Search) => {
        const next: Search = { ...prev, ...patch };
        for (const k of Object.keys(next) as (keyof Search)[]) if (!next[k]) delete next[k];
        return next;
      },
      replace: true,
    });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader eyebrow="Pilotage" title={TITLE} description={DESCRIPTION} />

      <div className="mb-6 grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-3">
        <FormRow label="Site">
          <SelectInput
            value={search.site ?? ""}
            onChange={(v) => set({ site: v })}
            emptyLabel="Tous les sites"
            options={sites
              .filter((s) => !s.archived_at)
              .map((s) => ({ value: s.id, label: s.name }))}
          />
        </FormRow>
        <FormRow label="Unité">
          <SelectInput
            value={search.unit ?? ""}
            onChange={(v) => set({ unit: v })}
            emptyLabel="Toutes les unités"
            options={units
              .filter((u) => !u.archived_at)
              .sort((a, b) => a.name.localeCompare(b.name, "fr"))
              .map((u) => ({ value: u.id, label: u.name }))}
          />
        </FormRow>
        <FormRow label="Mouvements par">
          <SelectInput
            value={period}
            onChange={(v) => set({ periode: v === "annee" ? "annee" : undefined })}
            options={[
              { value: "mois", label: "Mois (24 derniers)" },
              { value: "annee", label: "Année" },
            ]}
          />
        </FormRow>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          Impossible de charger les données du tableau de bord.
        </p>
      ) : isLoading || !data ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : (
        <div className="space-y-6">
          <KpiGrid data={data} canSalary={canSalary} />
          {canSalary && <SalaryPanel data={data} canExport={canExport} />}
          <div className="grid gap-6 lg:grid-cols-2">
            <DistributionChart title="Par statut" slices={data.byStatus} canExport={canExport} />
            <DistributionChart
              title="Par type de contrat"
              slices={data.byContract}
              canExport={canExport}
            />
            <DistributionChart title="Par site" slices={data.bySite} canExport={canExport} />
            <DistributionChart
              title="Par département"
              slices={data.byDepartment}
              canExport={canExport}
            />
          </div>
          <FlowsChart data={data} period={period} canExport={canExport} />
          <div className="grid gap-6 lg:grid-cols-2">
            <ListPanel
              title="Fins de contrat à venir"
              to="/contrats/echeances"
              search={search}
              count={ends?.length ?? null}
              items={(ends ?? []).slice(0, 5).map((r) => ({
                key: r.contract_id,
                label: `${r.first_names ?? ""} ${r.last_name ?? ""}`.trim(),
                value: remainingLabel(r.days_remaining ?? 0),
              }))}
              empty="Aucune échéance dans les délais de notification."
            />
            <ListPanel
              title="Départs en retraite proches"
              to="/contrats/retraites"
              search={search}
              count={retiring?.length ?? null}
              items={(retiring ?? []).slice(0, 5).map((r) => ({
                key: r.employee_id,
                label: `${r.first_names ?? ""} ${r.last_name ?? ""}`.trim(),
                value: remainingLabel(r.days_remaining),
              }))}
              empty={`Aucun départ à la retraite dans les ${noticeDays} prochains jours.`}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string | undefined }) {
  return (
    <div className="rounded-lg border bg-card px-5 py-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function KpiGrid({ data, canSalary }: { data: Dashboard; canSalary: boolean }) {
  const fmt = (n: number | null | undefined) =>
    n === null || n === undefined ? "—" : `${n}`.replace(".", ",");
  return (
    <section aria-label="Indicateurs clés" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile label="Effectif actif" value={String(data.headcount)} />
      <Tile
        label="Âge moyen"
        value={data.age ? `${fmt(data.age.mean)} ans` : "—"}
        hint={data.age ? `Médian : ${fmt(data.age.median)} ans` : undefined}
      />
      <Tile
        label="Ancienneté moyenne"
        value={
          formatSeniority(
            data.seniorityMonths === null ? null : Math.round(data.seniorityMonths),
          ) || "—"
        }
      />
      {!canSalary && (
        <Tile label="Rémunérations" value="Non visibles" hint="Réservé aux rôles habilités" />
      )}
    </section>
  );
}

function SalaryPanel({ data, canExport }: { data: Dashboard; canExport: boolean }) {
  const s = data.salary;
  const table: ExportTable = {
    name: "salaires",
    headers: ["Indicateur", "Salaire mensuel net (FCFA)"],
    rows: s
      ? [
          ["Moyenne", Math.round(s.mean)],
          ["Médiane", Math.round(s.median)],
          ["Minimum", s.min],
          ["Maximum", s.max],
          ["Employés pris en compte", s.count],
        ]
      : [],
  };
  return (
    <section aria-label="Rémunérations" className="rounded-lg border bg-card">
      <PanelHeader
        title="Salaire mensuel net des employés actifs"
        table={table}
        canExport={canExport && !!s}
      />
      {s ? (
        <div className="grid grid-cols-2 divide-x divide-y sm:grid-cols-4 sm:divide-y-0">
          <Stat label="Moyen" value={formatFCFA(s.mean)} />
          <Stat label="Médian" value={formatFCFA(s.median)} />
          <Stat label="Minimum" value={formatFCFA(s.min)} />
          <Stat label="Maximum" value={formatFCFA(s.max)} />
        </div>
      ) : (
        <p className="px-5 py-6 text-sm text-muted-foreground">
          Aucune rémunération enregistrée dans ce périmètre.
        </p>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-5 py-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-xl font-bold">{value}</p>
    </div>
  );
}

function PanelHeader({
  title,
  table,
  canExport,
}: {
  title: string;
  table: ExportTable;
  canExport: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3">
      <h2 className="text-base font-semibold">{title}</h2>
      {canExport && (
        <span className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={() => downloadTableCsv(table)}>
            <Download /> CSV
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void downloadTableXlsx(table)}>
            <Download /> Excel
          </Button>
        </span>
      )}
    </div>
  );
}

const AXIS = { fill: "var(--muted-foreground)", fontSize: 12 };

function DataTable({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  return (
    <details className="border-t px-5 py-3 text-sm">
      <summary className="cursor-pointer text-muted-foreground">Voir le tableau</summary>
      <table className="mt-2 w-full">
        <thead className="text-left text-xs text-muted-foreground">
          <tr>
            {headers.map((h) => (
              <th key={h} scope="col" className="py-1 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t">
              {r.map((c, j) => (
                <td key={j} className="py-1">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

function DistributionChart({
  title,
  slices,
  canExport,
}: {
  title: string;
  slices: Slice[];
  canExport: boolean;
}) {
  const total = slices.reduce((a, s) => a + s.value, 0);
  const table: ExportTable = {
    name: `repartition-${title}`,
    headers: ["Catégorie", "Effectif", "Part (%)"],
    rows: slices.map((s) => [
      s.label,
      s.value,
      total ? Math.round((s.value / total) * 1000) / 10 : 0,
    ]),
  };
  return (
    <section
      className="rounded-lg border bg-card"
      aria-label={`Répartition ${title.toLowerCase()}`}
    >
      <PanelHeader title={title} table={table} canExport={canExport && slices.length > 0} />
      {slices.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">Aucune donnée.</p>
      ) : (
        <div className="px-3 pt-3" style={{ height: Math.max(160, slices.length * 38 + 40) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={slices} layout="vertical" margin={{ left: 8, right: 24 }}>
              <CartesianGrid horizontal={false} stroke="var(--border)" />
              <XAxis type="number" allowDecimals={false} tick={AXIS} stroke="var(--border)" />
              <YAxis
                type="category"
                dataKey="label"
                width={130}
                tick={AXIS}
                stroke="var(--border)"
                interval={0}
              />
              <Tooltip
                cursor={{ fill: "var(--muted)" }}
                formatter={(v: number) => [
                  `${v} (${total ? Math.round((v / total) * 100) : 0} %)`,
                  "Effectif",
                ]}
                contentStyle={{ borderRadius: 4, border: "1px solid var(--border)" }}
              />
              <Bar
                dataKey="value"
                name="Effectif"
                fill={INK}
                radius={[0, 4, 4, 0]}
                maxBarSize={22}
              >
                {slices.map((s, i) => (
                  <Cell key={s.label} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <DataTable headers={["Catégorie", "Effectif"]} rows={slices.map((s) => [s.label, s.value])} />
    </section>
  );
}

function FlowsChart({
  data,
  period,
  canExport,
}: {
  data: Dashboard;
  period: PeriodKind;
  canExport: boolean;
}) {
  const table: ExportTable = {
    name: `entrees-sorties-${period === "mois" ? "mois" : "annee"}`,
    headers: ["Période", "Entrées", "Sorties"],
    rows: data.flows.map((f) => [f.label, f.entries, f.exits]),
  };
  return (
    <section className="rounded-lg border bg-card" aria-label="Entrées et sorties">
      <PanelHeader
        title={`Entrées et sorties par ${period === "mois" ? "mois" : "année"}`}
        table={table}
        canExport={canExport}
      />
      <div className="h-72 px-3 pt-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.flows} margin={{ left: 0, right: 16 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="label" tick={AXIS} stroke="var(--border)" interval="preserveStartEnd" />
            <YAxis allowDecimals={false} tick={AXIS} stroke="var(--border)" width={32} />
            <Tooltip
              cursor={{ fill: "var(--muted)" }}
              contentStyle={{ borderRadius: 4, border: "1px solid var(--border)" }}
            />
            <Legend />
            <Bar
              dataKey="entries"
              name="Entrées"
              fill={BLUE}
              radius={[4, 4, 0, 0]}
              maxBarSize={18}
            />
            <Bar dataKey="exits" name="Sorties" fill={RED} radius={[4, 4, 0, 0]} maxBarSize={18} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <DataTable
        headers={["Période", "Entrées", "Sorties"]}
        rows={data.flows.map((f) => [f.label, f.entries, f.exits])}
      />
    </section>
  );
}

function ListPanel({
  title,
  to,
  search,
  count,
  items,
  empty,
}: {
  title: string;
  to: "/contrats/echeances" | "/contrats/retraites";
  search: Search;
  count: number | null;
  items: { key: string; label: string; value: string }[];
  empty: string;
}) {
  const { site, unit } = search;
  return (
    <section className="rounded-lg border bg-card" aria-label={title}>
      <div className="flex items-center justify-between border-b px-5 py-3">
        <h2 className="text-base font-semibold">
          {title}
          {count !== null && <span className="ml-2 text-muted-foreground">({count})</span>}
        </h2>
        <Link
          to={to}
          search={{ ...(site ? { site } : {}), ...(unit ? { unit } : {}) }}
          className="text-sm text-primary hover:underline"
        >
          Tout voir
        </Link>
      </div>
      {count === null ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">Chargement…</p>
      ) : items.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y">
          {items.map((i) => (
            <li key={i.key} className="flex items-center justify-between px-5 py-3 text-sm">
              <span className="font-medium">{i.label}</span>
              <span className="text-muted-foreground">{i.value}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
