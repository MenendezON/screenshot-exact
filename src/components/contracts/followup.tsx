import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { PageHeader } from "@/components/app-shell";
import { FormRow, SelectInput } from "@/components/employees/common";
import { fullName } from "@/lib/employees";
import { descendantIds, orgUnitsQuery, sitesQuery, type OrgUnit } from "@/lib/referentials";

export type FollowupSearch = { site?: string; unit?: string };

const UUID = /^[0-9a-f-]{36}$/i;

export function parseFollowupSearch(raw: Record<string, unknown>): FollowupSearch {
  const out: FollowupSearch = {};
  if (typeof raw["site"] === "string" && UUID.test(raw["site"])) out.site = raw["site"];
  if (typeof raw["unit"] === "string" && UUID.test(raw["unit"])) out.unit = raw["unit"];
  return out;
}

export function withField(
  search: FollowupSearch,
  key: keyof FollowupSearch,
  value: string,
): FollowupSearch {
  const { [key]: _removed, ...rest } = search;
  return value ? { ...rest, [key]: value } : rest;
}

/** Filtre par site (principal) et par unité (sous-unités comprises). */
export function matchesFollowup(
  row: { primary_site_id: string | null; org_unit_id: string | null },
  search: FollowupSearch,
  units: OrgUnit[],
): boolean {
  if (search.site && row.primary_site_id !== search.site) return false;
  if (search.unit) {
    if (!row.org_unit_id) return false;
    if (!descendantIds(units, search.unit).has(row.org_unit_id)) return false;
  }
  return true;
}

const TABS = [
  { to: "/contrats/echeances", label: "Fins de contrat à venir" },
  { to: "/contrats/retraites", label: "Suivi des retraites" },
  { to: "/contrats/a-regulariser", label: "À régulariser" },
] as const;

export function FollowupShell({
  title,
  description,
  search,
  onSearch,
  count,
  children,
}: {
  title: string;
  description: string;
  search: FollowupSearch;
  onSearch: (next: FollowupSearch) => void;
  count: number | null;
  children: ReactNode;
}) {
  const { data: sites = [] } = useQuery(sitesQuery);
  const { data: units = [] } = useQuery(orgUnitsQuery);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader eyebrow="Contrats et sorties" title={title} description={description} />
      <nav aria-label="Suivi des contrats" className="mb-6 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.to}
            to={t.to}
            search={search}
            className="rounded-md border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted"
            activeProps={{
              className: "border-primary bg-primary text-primary-foreground hover:bg-primary",
            }}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <div className="mb-6 grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3 lg:items-end">
        <FormRow label="Site">
          <SelectInput
            value={search.site ?? ""}
            onChange={(v) => onSearch(withField(search, "site", v))}
            emptyLabel="Tous les sites"
            options={sites
              .filter((s) => !s.archived_at)
              .map((s) => ({ value: s.id, label: s.name }))}
          />
        </FormRow>
        <FormRow label="Unité">
          <SelectInput
            value={search.unit ?? ""}
            onChange={(v) => onSearch(withField(search, "unit", v))}
            emptyLabel="Toutes les unités"
            options={units
              .filter((u) => !u.archived_at)
              .sort((a, b) => a.name.localeCompare(b.name, "fr"))
              .map((u) => ({ value: u.id, label: u.name }))}
          />
        </FormRow>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {count === null ? "Chargement…" : `${count} résultat${count > 1 ? "s" : ""}`}
        </p>
      </div>
      {children}
    </div>
  );
}

export function PersonCell({
  row,
}: {
  row: {
    employee_id: string;
    matricule: string | null;
    first_names: string | null;
    last_name: string | null;
  };
}) {
  return (
    <Link
      to="/employes/$employeeId"
      params={{ employeeId: row.employee_id }}
      search={{ onglet: "contrats" }}
      className="font-medium hover:underline"
    >
      {fullName(row)}
      {row.matricule && (
        <span className="ml-2 text-xs font-normal text-muted-foreground">{row.matricule}</span>
      )}
    </Link>
  );
}

export function FollowupTable({
  headers,
  empty,
  rows,
}: {
  headers: string[];
  empty: string;
  rows: ReactNode[][] | null;
}) {
  if (rows === null) return <p className="text-sm text-muted-foreground">Chargement…</p>;
  if (rows.length === 0)
    return (
      <p className="rounded-lg border bg-card px-5 py-8 text-center text-sm text-muted-foreground">
        {empty}
      </p>
    );
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full text-sm">
        <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            {headers.map((h) => (
              <th key={h} scope="col" className="px-4 py-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((cells, i) => (
            <tr key={i}>
              {cells.map((c, j) => (
                <td key={j} className="px-4 py-3 align-top">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
