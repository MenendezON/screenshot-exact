import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { employeeKey, EMPLOYEE_TABLE_LABELS, summarizeEmployeeChange } from "@/lib/employees";
import { formatDateTime } from "@/lib/format";
import { Empty, Section } from "./common";
import type { FicheContext } from "./fiche-context";

const ACTION_LABELS: Record<string, string> = {
  INSERT: "Création",
  UPDATE: "Modification",
  DELETE: "Suppression",
};
const LIMIT = 200;

export function HistoryTab({ ctx }: { ctx: FicheContext }) {
  const { data, isLoading, error } = useQuery({
    queryKey: [...employeeKey(ctx.id), "history"],
    queryFn: async () => {
      const [log, profiles] = await Promise.all([
        supabase
          .from("audit_log")
          .select(
            "id, created_at, created_by, table_name, action, old_data, new_data, changed_fields",
          )
          .eq("employee_id", ctx.id)
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
    <Section
      title="Historique du dossier"
      description={`Toutes les modifications de ce dossier, des plus récentes aux plus anciennes (${LIMIT} entrées au plus). Les données sensibles ne sont jamais recopiées ici.`}
    >
      {isLoading ? (
        <Empty>Chargement…</Empty>
      ) : error ? (
        <Empty>Impossible de charger l'historique avec votre rôle.</Empty>
      ) : !data || data.entries.length === 0 ? (
        <Empty>Aucune modification enregistrée.</Empty>
      ) : (
        <ol className="divide-y">
          {data.entries.map((e) => (
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
                  <span className="font-medium">
                    {EMPLOYEE_TABLE_LABELS[e.table_name] ?? e.table_name}
                  </span>
                </p>
                <ul className="mt-1 space-y-0.5 text-muted-foreground">
                  {summarizeEmployeeChange(e).map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}
