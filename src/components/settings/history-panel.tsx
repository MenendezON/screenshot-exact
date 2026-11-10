import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime } from "@/lib/format";
import { REFERENTIAL_TABLES, summarizeChange, TABLE_LABELS } from "@/lib/referentials";
import { EmptyRow, Loading } from "./shared";

const ACTION_LABELS: Record<string, string> = {
  INSERT: "Création",
  UPDATE: "Modification",
  DELETE: "Suppression",
};
const LIMIT = 200;

export function HistoryPanel() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["ref-history"],
    queryFn: async () => {
      const [log, profiles] = await Promise.all([
        supabase
          .from("audit_log")
          .select(
            "id, created_at, created_by, table_name, action, old_data, new_data, changed_fields",
          )
          .in("table_name", [...REFERENTIAL_TABLES])
          .order("created_at", { ascending: false })
          .limit(LIMIT),
        supabase.from("profiles").select("id, full_name, email"),
      ]);
      if (log.error) throw log.error;
      const names = new Map((profiles.data ?? []).map((p) => [p.id, p.full_name || p.email]));
      return { entries: log.data, names };
    },
  });

  return (
    <section className="rounded-lg border bg-card">
      <header className="border-b px-5 py-4">
        <h2 className="text-lg font-bold">Historique des modifications</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Chaque création, modification et archivage est enregistré automatiquement. Les {LIMIT}{" "}
          dernières entrées sont affichées.
        </p>
      </header>
      {isLoading ? (
        <Loading />
      ) : error ? (
        <p className="px-5 py-8 text-center text-sm text-destructive">
          Impossible de charger l'historique.
        </p>
      ) : data && data.entries.length === 0 ? (
        <EmptyRow>Aucune modification enregistrée.</EmptyRow>
      ) : (
        <ol className="divide-y">
          {data?.entries.map((e) => (
            <li key={e.id} className="grid gap-2 px-5 py-3.5 sm:grid-cols-[10rem_1fr]">
              <div className="text-sm">
                <p className="font-mono text-xs text-muted-foreground">
                  {formatDateTime(e.created_at)}
                </p>
                <p className="mt-0.5 truncate">
                  {e.created_by
                    ? (data.names.get(e.created_by) ?? "Utilisateur inconnu")
                    : "Système"}
                </p>
              </div>
              <div className="min-w-0 text-sm">
                <p className="flex flex-wrap items-center gap-2">
                  <Badge variant={e.action === "UPDATE" ? "secondary" : "outline"}>
                    {ACTION_LABELS[e.action] ?? e.action}
                  </Badge>
                  <span className="font-medium">{TABLE_LABELS[e.table_name] ?? e.table_name}</span>
                </p>
                <ul className="mt-1 space-y-0.5 text-muted-foreground">
                  {summarizeChange(e).map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
