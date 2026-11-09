import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { PageHeader, RequireRole } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { formatDateTime } from "@/lib/format";
import { ROLE_LABELS, type AppRole } from "@/lib/roles";

export const Route = createFileRoute("/_authenticated/journal")({
  head: () => ({
    meta: [
      { title: "Journal d'audit — Fabrimétal Personnel" },
      { name: "description", content: "Historique de toutes les modifications enregistrées." },
      { property: "og:title", content: "Journal d'audit — Fabrimétal Personnel" },
      { property: "og:description", content: "Historique de toutes les modifications enregistrées." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: JournalPage,
});

const TABLE_LABELS: Record<string, string> = {
  profiles: "Profil utilisateur",
  user_roles: "Rôle",
  settings: "Paramètre",
};

const ACTION_LABELS: Record<string, string> = {
  INSERT: "Création",
  UPDATE: "Modification",
  DELETE: "Suppression",
};

const FIELD_LABELS: Record<string, string> = {
  full_name: "Nom",
  email: "E-mail",
  role: "Rôle",
  archived_at: "Désactivation",
  value: "Valeur",
  label: "Libellé",
};

const PAGE_SIZE = 200;

function JournalPage() {
  return (
    <RequireRole roles={["admin_rh"]}>
      <JournalContent />
    </RequireRole>
  );
}

function JournalContent() {
  const [table, setTable] = useState("all");

  const { data, isLoading, error } = useQuery({
    queryKey: ["audit-log", table],
    queryFn: async () => {
      let q = supabase
        .from("audit_log")
        .select("id, created_at, created_by, table_name, record_id, action, old_data, new_data, changed_fields")
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);
      if (table !== "all") q = q.eq("table_name", table);
      const [log, profiles] = await Promise.all([q, supabase.from("profiles").select("id, full_name, email")]);
      if (log.error) throw log.error;
      const names = new Map((profiles.data ?? []).map((p) => [p.id, p.full_name || p.email]));
      return { entries: log.data, names };
    },
  });

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow="Traçabilité"
        title="Journal d'audit"
        description={`Chaque création ou modification est enregistrée automatiquement. Les ${PAGE_SIZE} dernières entrées sont affichées.`}
        actions={
          <Select value={table} onValueChange={setTable}>
            <SelectTrigger className="w-56" aria-label="Filtrer par élément">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les éléments</SelectItem>
              {Object.entries(TABLE_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {isLoading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Chargement…
        </p>
      )}
      {error && <p className="text-sm text-destructive">Impossible de charger le journal.</p>}

      {data && data.entries.length === 0 && (
        <p className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
          Aucune entrée pour ce filtre.
        </p>
      )}

      {data && data.entries.length > 0 && (
        <ol className="divide-y rounded-lg border bg-card shadow-panel">
          {data.entries.map((e) => (
            <li key={e.id} className="grid gap-2 px-5 py-4 sm:grid-cols-[10rem_1fr]">
              <div className="text-sm">
                <p className="font-mono text-xs text-muted-foreground">{formatDateTime(e.created_at)}</p>
                <p className="mt-1 truncate">
                  {e.created_by ? (data.names.get(e.created_by) ?? "Utilisateur inconnu") : "Système"}
                </p>
              </div>
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge variant={e.action === "UPDATE" ? "secondary" : "outline"}>
                    {ACTION_LABELS[e.action] ?? e.action}
                  </Badge>
                  <span className="font-medium">{TABLE_LABELS[e.table_name] ?? e.table_name}</span>
                  <span className="truncate text-muted-foreground">
                    {describeRecord(e.table_name, e.new_data ?? e.old_data, data.names)}
                  </span>
                </p>
                {e.action === "UPDATE" && e.changed_fields && (
                  <ul className="mt-2 space-y-1 text-sm">
                    {e.changed_fields.map((f) => (
                      <li key={f} className="text-muted-foreground">
                        <span className="text-foreground">{FIELD_LABELS[f] ?? f}</span> :{" "}
                        <s>{displayValue(f, read(e.old_data, f))}</s> → {displayValue(f, read(e.new_data, f))}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function read(data: Json | null, key: string): unknown {
  if (!data || typeof data !== "object" || Array.isArray(data)) return undefined;
  return (data as Record<string, unknown>)[key];
}

function displayValue(field: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (field === "role" && typeof v === "string") return ROLE_LABELS[v as AppRole] ?? v;
  if (field.endsWith("_at") && typeof v === "string") return formatDateTime(v);
  return String(v);
}

function describeRecord(table: string, data: Json | null, names: Map<string, string>): string {
  if (table === "settings") return String(read(data, "label") ?? "");
  if (table === "profiles") return String(read(data, "email") ?? "");
  if (table === "user_roles") {
    const userId = read(data, "user_id");
    return typeof userId === "string" ? (names.get(userId) ?? "") : "";
  }
  return "";
}
