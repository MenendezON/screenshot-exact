import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Download,
  Loader2,
  Plus,
  Search,
  Upload,
  X,
} from "lucide-react";

import { PageHeader } from "@/components/app-shell";
import { FormRow, SelectInput } from "@/components/employees/common";
import { ImportDialog } from "@/components/import-dialog";
import { NewEmployeeDialog } from "@/components/employees/new-employee-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CONTRACT_LABELS,
  CONTRACT_TYPES,
  todayIso,
  type ContractType,
} from "@/lib/employee-schemas";
import {
  buildExportRows,
  downloadCsv,
  downloadXlsx,
  EXPORT_ROW_LIMIT,
  exportColumns,
} from "@/lib/employee-export";
import {
  compactSearch,
  employeeListKey,
  employeeListQuery,
  fetchLatestSalaries,
  fetchMetrics,
  formatSeniority,
  fullName,
  initials,
  PAGE_SIZE,
  parseListSearch,
  type EmployeeListSearch,
  type EmployeeRow,
  type SortKey,
} from "@/lib/employees";
import { formatDate } from "@/lib/format";
import { usePermissions } from "@/lib/permissions";
import { useCurrentUser } from "@/lib/roles";
import {
  buildOrgTree,
  categoriesQuery,
  descendantIds,
  flattenTree,
  jobTitlesQuery,
  orgUnitsQuery,
  sitesQuery,
  STATUS_LABELS,
  STATUS_OPTIONS,
} from "@/lib/referentials";

const DESCRIPTION = "Liste du personnel : recherche, filtres, tri et export.";

export const Route = createFileRoute("/_authenticated/employes/")({
  validateSearch: (raw: Record<string, unknown>) => compactSearch(parseListSearch(raw)),
  head: () => ({
    meta: [
      { title: "Employés — Fabrimétal Personnel" },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EmployeesPage,
});

function EmployeesPage() {
  const navigate = useNavigate({ from: Route.fullPath });
  const search = parseListSearch(Route.useSearch());
  const { can, ready } = usePermissions();
  const canExport = can("import_export", "export");
  // La base n'accorde pas encore `import_export:import` (voir demande Lovable, section 9.a) :
  // en attendant, le bouton (contrôle local du fichier, sans écriture) est visible des rôles prévus.
  const { data: me } = useCurrentUser();
  const canImport =
    can("import_export", "import") || me?.role === "drh" || me?.role === "gestionnaire_rh";
  const [importOpen, setImportOpen] = useState(false);
  const canExportSalary = can("compensation", "view") && can("compensation", "export");
  const canCreate = can("employees", "create");

  const [newOpen, setNewOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [qInput, setQInput] = useState(search.q);

  const { data: units = [], isSuccess: unitsReady } = useQuery(orgUnitsQuery);
  const { data: titles = [] } = useQuery(jobTitlesQuery);
  const { data: categories = [] } = useQuery(categoriesQuery);
  const { data: sites = [] } = useQuery(sitesQuery);

  const update = (patch: Partial<EmployeeListSearch>, resetPage = true) =>
    navigate({
      search: (prev) =>
        compactSearch({ ...parseListSearch(prev), ...patch, ...(resetPage ? { page: 1 } : {}) }),
      replace: true,
    });

  // Recherche différée : on n'interroge la base qu'après une courte pause de frappe.
  useEffect(() => {
    if (qInput === search.q) return;
    const t = setTimeout(() => update({ q: qInput }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qInput]);
  useEffect(() => setQInput(search.q), [search.q]);

  const unitIds = useMemo(
    () => (search.unite ? [...descendantIds(units, search.unite)] : null),
    [units, search.unite],
  );

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: employeeListKey(search),
    enabled: ready && (!search.unite || unitsReady),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const from = (search.page - 1) * PAGE_SIZE;
      const {
        data: rows,
        count,
        error: err,
      } = await employeeListQuery(search, unitIds, true).range(from, from + PAGE_SIZE - 1);
      if (err) throw err;
      const list = (rows ?? []) as unknown as EmployeeRow[];
      const metrics = await fetchMetrics(list.map((r) => r.employee_id ?? "").filter(Boolean));
      return { rows: list, count: count ?? 0, metrics };
    },
  });

  const total = data?.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // Un filtre peut réduire le nombre de pages : on revient alors à la dernière page existante.
  useEffect(() => {
    if (data && search.page > pageCount) update({ page: pageCount }, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, pageCount]);

  const hasFilters = compactSearch({ ...search, page: 1, tri: "nom", sens: "asc" }) as Record<
    string,
    unknown
  >;
  const filtersActive = Object.keys(hasFilters).length > 0;

  async function runExport(kind: "csv" | "xlsx") {
    setExporting(true);
    try {
      const rows: EmployeeRow[] = [];
      for (let from = 0; from < EXPORT_ROW_LIMIT + 1; from += 1000) {
        const { data: page, error: err } = await employeeListQuery(search, unitIds, false).range(
          from,
          from + 999,
        );
        if (err) throw err;
        rows.push(...((page ?? []) as unknown as EmployeeRow[]));
        if ((page?.length ?? 0) < 1000) break;
      }
      if (rows.length === 0) {
        toast.info("Aucune ligne à exporter avec ces filtres.");
        return;
      }
      if (rows.length > EXPORT_ROW_LIMIT) {
        toast.error(
          `Export limité à ${EXPORT_ROW_LIMIT.toLocaleString("fr-FR")} lignes : affinez les filtres.`,
        );
        return;
      }
      const ids = rows.map((r) => r.employee_id ?? "").filter(Boolean);
      const [metrics, salaries] = await Promise.all([
        fetchMetrics(ids),
        canExportSalary ? fetchLatestSalaries(ids, todayIso()) : Promise.resolve(null),
      ]);
      const columns = exportColumns(salaries !== null);
      const table = buildExportRows(rows, columns, { metrics, salaries });
      if (kind === "csv") downloadCsv(columns, table);
      else await downloadXlsx(columns, table);
      toast.success(
        `${rows.length.toLocaleString("fr-FR")} ligne${rows.length > 1 ? "s" : ""} exportée${rows.length > 1 ? "s" : ""}.`,
      );
    } catch {
      toast.error("L'export a échoué. Réessayez, ou affinez les filtres.");
    } finally {
      setExporting(false);
    }
  }

  const unitOptions = flattenTree(buildOrgTree(units, false)).map((u) => ({
    value: u.id,
    label: `${"— ".repeat(u.depth)}${u.name}`,
  }));
  const from = total === 0 ? 0 : (search.page - 1) * PAGE_SIZE + 1;
  const to = Math.min(total, search.page * PAGE_SIZE);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        eyebrow="Personnel"
        title="Employés"
        description={DESCRIPTION}
        actions={
          <div className="flex items-center gap-2">
            {canExport && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" disabled={exporting || total === 0}>
                    {exporting ? <Loader2 className="animate-spin" /> : <Download />} Exporter
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => runExport("xlsx")}>
                    Excel (.xlsx)
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => runExport("csv")}>CSV (.csv)</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {canImport && (
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                <Upload /> Importer
              </Button>
            )}
            {canCreate && (
              <Button onClick={() => setNewOpen(true)}>
                <Plus /> Nouvel employé
              </Button>
            )}
          </div>
        }
      />

      <section
        aria-label="Recherche et filtres"
        className="mb-4 space-y-3 rounded-lg border bg-card p-4"
      >
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Rechercher par nom, matricule, poste, unité, e-mail ou téléphone"
            className="pl-9"
            aria-label="Rechercher un employé"
            maxLength={100}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FormRow label="Présence">
            <SelectInput
              value={search.presence}
              onChange={(v) => update({ presence: v as EmployeeListSearch["presence"] })}
              options={[
                { value: "actifs", label: "En poste" },
                { value: "sortis", label: "Sortis" },
                { value: "tous", label: "Tous" },
              ]}
            />
          </FormRow>
          <FormRow label="Site">
            <SelectInput
              value={search.site}
              onChange={(v) => update({ site: v })}
              emptyLabel="Tous les sites"
              options={sites
                .filter((s) => !s.archived_at)
                .map((s) => ({ value: s.id, label: s.name }))}
            />
          </FormRow>
          <FormRow label="Unité" hint="Inclut les sous-unités.">
            <SelectInput
              value={search.unite}
              onChange={(v) => update({ unite: v })}
              emptyLabel="Toutes les unités"
              options={unitOptions}
            />
          </FormRow>
          <FormRow label="Poste">
            <SelectInput
              value={search.poste}
              onChange={(v) => update({ poste: v })}
              emptyLabel="Tous les postes"
              options={titles
                .filter((t) => !t.archived_at)
                .map((t) => ({ value: t.id, label: t.name }))}
            />
          </FormRow>
          <FormRow label="Catégorie">
            <SelectInput
              value={search.categorie}
              onChange={(v) => update({ categorie: v })}
              emptyLabel="Toutes"
              options={categories
                .filter((c) => !c.archived_at)
                .map((c) => ({ value: c.id, label: c.code }))}
            />
          </FormRow>
          <FormRow label="Statut professionnel">
            <SelectInput
              value={search.statut}
              onChange={(v) => update({ statut: v })}
              emptyLabel="Tous"
              options={STATUS_OPTIONS.map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
            />
          </FormRow>
          <FormRow label="Type de contrat">
            <SelectInput
              value={search.contrat}
              onChange={(v) => update({ contrat: v })}
              emptyLabel="Tous"
              options={CONTRACT_TYPES.map((t) => ({ value: t, label: CONTRACT_LABELS[t] }))}
            />
          </FormRow>
          <div className="flex items-end justify-between gap-3 pb-1">
            <Label className="flex items-center gap-2 font-normal text-muted-foreground">
              <Switch checked={search.archives} onCheckedChange={(v) => update({ archives: v })} />
              Dossiers archivés
            </Label>
            {filtersActive && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate({ search: {}, replace: true })}
              >
                <X /> Réinitialiser
              </Button>
            )}
          </div>
        </div>
      </section>

      <div className="overflow-hidden rounded-lg border bg-card" aria-busy={isFetching}>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <SortHead label="Matricule" k="matricule" search={search} onSort={update} />
                <SortHead label="Employé" k="nom" search={search} onSort={update} />
                <SortHead label="Poste" k="poste" search={search} onSort={update} />
                <SortHead label="Unité" k="unite" search={search} onSort={update} />
                <SortHead label="Site" k="site" search={search} onSort={update} />
                <SortHead label="Contrat" k="contrat" search={search} onSort={update} />
                <TableHead>Ancienneté</TableHead>
                <TableHead>Situation</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading || !ready ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
                    <Loader2 className="mx-auto animate-spin" aria-label="Chargement" />
                  </TableCell>
                </TableRow>
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-12 text-center text-destructive">
                    Impossible de charger la liste. Réessayez dans un instant.
                  </TableCell>
                </TableRow>
              ) : data && data.rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
                    {filtersActive
                      ? "Aucun employé ne correspond à ces critères."
                      : "Aucun employé dans votre périmètre."}
                  </TableCell>
                </TableRow>
              ) : (
                data?.rows.map((r) => (
                  <EmployeeLine
                    key={r.employee_id}
                    row={r}
                    seniority={data.metrics.get(r.employee_id ?? "")?.seniority_months}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <footer className="flex flex-col items-center justify-between gap-3 border-t px-4 py-3 text-sm sm:flex-row">
          <p className="text-muted-foreground" aria-live="polite">
            {total === 0 ? "0 résultat" : `${from}–${to} sur ${total.toLocaleString("fr-FR")}`}
          </p>
          <nav aria-label="Pagination" className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={search.page <= 1}
              onClick={() => update({ page: search.page - 1 }, false)}
            >
              Précédent
            </Button>
            <span className="px-2 text-muted-foreground">
              Page {Math.min(search.page, pageCount)} sur {pageCount}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={search.page >= pageCount}
              onClick={() => update({ page: search.page + 1 }, false)}
            >
              Suivant
            </Button>
          </nav>
        </footer>
      </div>

      <NewEmployeeDialog open={newOpen} onOpenChange={setNewOpen} />
      {canImport && <ImportDialog open={importOpen} onOpenChange={setImportOpen} />}
    </div>
  );
}

function SortHead({
  label,
  k,
  search,
  onSort,
}: {
  label: string;
  k: SortKey;
  search: EmployeeListSearch;
  onSort: (patch: Partial<EmployeeListSearch>) => void;
}) {
  const active = search.tri === k;
  const Icon = !active ? ArrowUpDown : search.sens === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead aria-sort={active ? (search.sens === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        className="-ml-2 inline-flex items-center gap-1.5 rounded px-2 py-1 hover:bg-muted"
        onClick={() => onSort({ tri: k, sens: active && search.sens === "asc" ? "desc" : "asc" })}
      >
        {label}
        <Icon className={`size-3.5 ${active ? "" : "text-muted-foreground"}`} />
      </button>
    </TableHead>
  );
}

function EmployeeLine({
  row: r,
  seniority,
}: {
  row: EmployeeRow;
  seniority: number | null | undefined;
}) {
  const id = r.employee_id ?? "";
  return (
    <TableRow className={r.archived_at ? "opacity-60" : undefined}>
      <TableCell className="font-mono text-xs">{r.matricule}</TableCell>
      <TableCell>
        <Link
          to="/employes/$employeeId"
          params={{ employeeId: id }}
          className="flex items-center gap-3 font-medium hover:underline"
        >
          <span
            className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-xs font-bold text-secondary-foreground"
            aria-hidden
          >
            {initials(r)}
          </span>
          {fullName(r)}
        </Link>
      </TableCell>
      <TableCell>{r.job_title_name ?? "—"}</TableCell>
      <TableCell>{r.org_unit_name ?? "—"}</TableCell>
      <TableCell>{r.primary_site_name ?? "—"}</TableCell>
      <TableCell>
        {r.contract_type ? (
          <span className="flex flex-col">
            <span>{CONTRACT_LABELS[r.contract_type as ContractType]}</span>
            {r.contract_type !== "cdi" && r.contract_end && (
              <span className="text-xs text-muted-foreground">
                jusqu'au {formatDate(r.contract_terminated_on ?? r.contract_end)}
              </span>
            )}
          </span>
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap">{formatSeniority(seniority)}</TableCell>
      <TableCell>
        {r.archived_at ? (
          <Badge variant="outline">Archivé</Badge>
        ) : r.is_active ? (
          <Badge>En poste</Badge>
        ) : (
          <Badge variant="secondary">
            Sorti{r.exit_date ? ` le ${formatDate(r.exit_date)}` : ""}
          </Badge>
        )}
      </TableCell>
    </TableRow>
  );
}
