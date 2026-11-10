import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { PageHeader, RequirePermission } from "@/components/app-shell";
import { PeriodFilter, Pager, UserFilter } from "@/components/audit-filters";
import { FormRow, SelectInput } from "@/components/employees/common";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import {
  AUDIT_ACTION_LABELS,
  AUDIT_TABLE_LABELS,
  auditDiff,
  periodBounds,
  tableLabel,
} from "@/lib/audit-view";
import { formatDateTime } from "@/lib/format";

const DESCRIPTION =
  "Chaque création, modification ou archivage est enregistré automatiquement. Le journal est en lecture seule.";
const PAGE_SIZE = 50;
const UUID = /^[0-9a-f-]{36}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

type Search = {
  page?: number;
  user?: string;
  table?: string;
  action?: string;
  from?: string;
  to?: string;
};

export const Route = createFileRoute("/_authenticated/journal")({
  validateSearch: (raw: Record<string, unknown>): Search => {
    const out: Search = {};
    const page = Number(raw["page"]);
    if (Number.isInteger(page) && page > 1) out.page = page;
    if (typeof raw["user"] === "string" && UUID.test(raw["user"])) out.user = raw["user"];
    if (typeof raw["table"] === "string" && raw["table"] in AUDIT_TABLE_LABELS)
      out.table = raw["table"];
    if (typeof raw["action"] === "string" && raw["action"] in AUDIT_ACTION_LABELS)
      out.action = raw["action"];
    if (typeof raw["from"] === "string" && DATE.test(raw["from"])) out.from = raw["from"];
    if (typeof raw["to"] === "string" && DATE.test(raw["to"])) out.to = raw["to"];
    return out;
  },
  head: () => ({
    meta: [
      { title: "Journal d'audit — Fabrimétal Personnel" },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <RequirePermission resource="audit" action="view">
      <JournalContent />
    </RequirePermission>
  ),
});

function useUserNames() {
  return useQuery({
    queryKey: ["audit", "users"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .order("full_name");
      if (error) throw error;
      return data.map((p) => ({ id: p.id, name: p.full_name || p.email }));
    },
  });
}

function JournalContent() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const page = search.page ?? 1;
  const { data: users = [] } = useUserNames();
  const names = new Map(users.map((u) => [u.id, u.name]));

  const set = (patch: Partial<Search>) =>
    navigate({
      search: (prev: Search) => {
        const next: Search = { ...prev, ...patch, page: patch.page ?? 1 };
        for (const k of Object.keys(next) as (keyof Search)[])
          if (!next[k] || (k === "page" && next[k] === 1)) delete next[k];
        return next;
      },
      replace: true,
    });

  const { data, isLoading, error } = useQuery({
    queryKey: ["audit-log", search],
    queryFn: async () => {
      let q = supabase
        .from("audit_log")
        .select(
          "id, created_at, created_by, table_name, record_id, action, old_data, new_data, changed_fields",
        )
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE); // une ligne de plus pour savoir s'il y a une suite
      if (search.user) q = q.eq("created_by", search.user);
      if (search.table) q = q.eq("table_name", search.table);
      if (search.action) q = q.eq("action", search.action);
      const b = periodBounds(search.from, search.to);
      if (b.gte) q = q.gte("created_at", b.gte);
      if (b.lt) q = q.lt("created_at", b.lt);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
  const entries = data?.slice(0, PAGE_SIZE) ?? [];
  const hasNext = (data?.length ?? 0) > PAGE_SIZE;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader eyebrow="Traçabilité" title="Journal d'audit" description={DESCRIPTION} />
      <div className="mb-6 grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5">
        <UserFilter value={search.user ?? ""} users={users} onChange={(v) => set({ user: v })} />
        <FormRow label="Élément">
          <SelectInput
            value={search.table ?? ""}
            onChange={(v) => set({ table: v })}
            emptyLabel="Tous les éléments"
            options={Object.entries(AUDIT_TABLE_LABELS)
              .sort((a, b) => a[1].localeCompare(b[1], "fr"))
              .map(([value, label]) => ({ value, label }))}
          />
        </FormRow>
        <FormRow label="Action">
          <SelectInput
            value={search.action ?? ""}
            onChange={(v) => set({ action: v })}
            emptyLabel="Toutes les actions"
            options={Object.entries(AUDIT_ACTION_LABELS).map(([value, label]) => ({
              value,
              label,
            }))}
          />
        </FormRow>
        <PeriodFilter from={search.from ?? ""} to={search.to ?? ""} onChange={(p) => set(p)} />
      </div>

      {isLoading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Chargement…
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          Impossible de charger le journal.
        </p>
      )}
      {data && entries.length === 0 && (
        <p className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
          Aucune entrée pour ces filtres.
        </p>
      )}
      {entries.length > 0 && (
        <ol className="divide-y rounded-lg border bg-card">
          {entries.map((e) => {
            const lines = auditDiff(e);
            return (
              <li key={e.id} className="grid gap-2 px-5 py-4 sm:grid-cols-[11rem_1fr]">
                <div className="text-sm">
                  <p className="font-mono text-xs text-muted-foreground">
                    {formatDateTime(e.created_at)}
                  </p>
                  <p className="mt-1 truncate">
                    {e.created_by ? (names.get(e.created_by) ?? "Utilisateur inconnu") : "Système"}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge variant={e.action === "UPDATE" ? "secondary" : "outline"}>
                      {AUDIT_ACTION_LABELS[e.action] ?? e.action}
                    </Badge>
                    <span className="font-medium">{tableLabel(e.table_name)}</span>
                  </p>
                  {lines.length > 0 && (
                    <table className="mt-2 w-full text-sm">
                      <thead className="sr-only">
                        <tr>
                          <th scope="col">Champ</th>
                          <th scope="col">Avant</th>
                          <th scope="col">Après</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((l) => (
                          <tr key={l.field} className="border-t first:border-t-0">
                            <th
                              scope="row"
                              className="w-40 py-1 pr-3 text-left align-top font-normal text-muted-foreground"
                            >
                              {l.label}
                            </th>
                            <td className="py-1 pr-3 align-top">
                              {l.before !== null && (
                                <span className="text-muted-foreground line-through">
                                  {l.before}
                                </span>
                              )}
                            </td>
                            <td className="py-1 align-top">
                              {l.after !== null && <span>{l.after}</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <Pager page={page} hasNext={hasNext} onPage={(p) => set({ page: p })} />
    </div>
  );
}
