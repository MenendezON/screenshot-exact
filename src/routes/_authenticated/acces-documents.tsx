import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { PageHeader, RequirePermission } from "@/components/app-shell";
import { PeriodFilter, Pager, UserFilter } from "@/components/audit-filters";
import { FormRow, SelectInput } from "@/components/employees/common";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { periodBounds } from "@/lib/audit-view";
import { fullName } from "@/lib/employees";
import { formatDateTime } from "@/lib/format";
import { documentTypesQuery } from "@/lib/referentials";

const DESCRIPTION =
  "Qui a consulté ou téléchargé quel document, et quand. Chaque ouverture est enregistrée avant la remise du fichier.";
const PAGE_SIZE = 50;
const UUID = /^[0-9a-f-]{36}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ACTIONS: Record<string, string> = { view: "Consultation", download: "Téléchargement" };

type Search = { page?: number; user?: string; action?: string; from?: string; to?: string };

export const Route = createFileRoute("/_authenticated/acces-documents")({
  validateSearch: (raw: Record<string, unknown>): Search => {
    const out: Search = {};
    const page = Number(raw["page"]);
    if (Number.isInteger(page) && page > 1) out.page = page;
    if (typeof raw["user"] === "string" && UUID.test(raw["user"])) out.user = raw["user"];
    if (typeof raw["action"] === "string" && raw["action"] in ACTIONS) out.action = raw["action"];
    if (typeof raw["from"] === "string" && DATE.test(raw["from"])) out.from = raw["from"];
    if (typeof raw["to"] === "string" && DATE.test(raw["to"])) out.to = raw["to"];
    return out;
  },
  head: () => ({
    meta: [
      { title: "Accès aux documents — Fabri RH" },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <RequirePermission
      resource="confidential_documents"
      action="view"
      message="Ce journal est réservé aux rôles habilités à voir les documents confidentiels."
    >
      <RequirePermission resource="audit" action="view">
        <AccessLogContent />
      </RequirePermission>
    </RequirePermission>
  ),
});

function AccessLogContent() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const page = search.page ?? 1;
  const { data: types = [] } = useQuery(documentTypesQuery);
  const { data: users = [] } = useQuery({
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
    queryKey: ["document-access-log", search],
    queryFn: async () => {
      let q = supabase
        .from("document_access_log")
        .select(
          "id, at, user_id, action, documents(file_name, employee_id, document_type_id, version)",
        )
        .order("at", { ascending: false })
        .order("id", { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
      if (search.user) q = q.eq("user_id", search.user);
      if (search.action) q = q.eq("action", search.action);
      const b = periodBounds(search.from, search.to);
      if (b.gte) q = q.gte("at", b.gte);
      if (b.lt) q = q.lt("at", b.lt);
      const { data: rows, error } = await q;
      if (error) throw error;
      const ids = [
        ...new Set(
          rows.flatMap((r) => (r.documents?.employee_id ? [r.documents.employee_id] : [])),
        ),
      ];
      const people = new Map<string, string>();
      if (ids.length) {
        const { data: emps } = await supabase
          .from("v_employee_current")
          .select("employee_id, first_names, last_name")
          .in("employee_id", ids);
        for (const e of emps ?? []) if (e.employee_id) people.set(e.employee_id, fullName(e));
      }
      return { rows, people };
    },
  });
  const rows = data?.rows.slice(0, PAGE_SIZE) ?? [];
  const hasNext = (data?.rows.length ?? 0) > PAGE_SIZE;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader eyebrow="Traçabilité" title="Accès aux documents" description={DESCRIPTION} />
      <div className="mb-6 grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
        <UserFilter value={search.user ?? ""} users={users} onChange={(v) => set({ user: v })} />
        <FormRow label="Action">
          <SelectInput
            value={search.action ?? ""}
            onChange={(v) => set({ action: v })}
            emptyLabel="Toutes les actions"
            options={Object.entries(ACTIONS).map(([value, label]) => ({ value, label }))}
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
          Impossible de charger le journal des accès.
        </p>
      )}
      {data && rows.length === 0 && (
        <p className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
          Aucun accès pour ces filtres.
        </p>
      )}
      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                {["Date", "Utilisateur", "Action", "Document", "Employé"].map((h) => (
                  <th key={h} scope="col" className="px-4 py-3 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 font-mono text-xs">{formatDateTime(r.at)}</td>
                  <td className="px-4 py-3">{names.get(r.user_id) ?? "Utilisateur inconnu"}</td>
                  <td className="px-4 py-3">
                    <Badge variant={r.action === "download" ? "secondary" : "outline"}>
                      {ACTIONS[r.action] ?? r.action}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {r.documents ? (
                      <>
                        <span className="font-medium">
                          {types.find((t) => t.id === r.documents?.document_type_id)?.name ??
                            "Document"}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {r.documents.file_name} · version {r.documents.version}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">Document non accessible</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {(r.documents?.employee_id && data?.people.get(r.documents.employee_id)) || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={page} hasNext={hasNext} onPage={(p) => set({ page: p })} />
    </div>
  );
}
