import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { toast } from "sonner";

import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import {
  ALERT_KINDS,
  RECIPIENT_ROLES,
  recipientsQuery,
  recipientState,
} from "@/lib/notification-recipients";
import { logError } from "@/lib/log";
import { dbErrorMessage } from "@/lib/referentials";
import { ROLE_LABELS, type AppRole } from "@/lib/roles";
import { ErrorState } from "@/components/states";
import { Loading, useRefRights } from "./shared";

/** Qui reçoit quelle alerte dans la cloche. Une ligne cochée = un destinataire ; décocher archive la ligne (rien n'est supprimé). */
export function NotificationRecipientsPanel() {
  const qc = useQueryClient();
  const { canEdit } = useRefRights();
  const { data, isLoading, error, refetch } = useQuery(recipientsQuery);

  const toggle = useMutation({
    mutationFn: async (v: {
      kind: string;
      role: AppRole;
      id?: string | undefined;
      on: boolean;
    }) => {
      if (v.on) {
        const { error: e } = await supabase
          .from("notification_recipients")
          .insert({ kind: v.kind, role: v.role });
        if (e) throw e;
      } else if (v.id) {
        const { error: e } = await supabase
          .from("notification_recipients")
          .update({ archived_at: new Date().toISOString() })
          .eq("id", v.id);
        if (e) throw e;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notification-recipients"] }),
    onError: (e) => {
      logError("destinataires", e);
      toast.error(dbErrorMessage(e));
    },
  });

  return (
    <section className="rounded-lg border bg-card">
      <header className="border-b px-5 py-4">
        <h2 className="text-lg font-bold">Destinataires des alertes</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Cochez les rôles qui reçoivent chaque alerte dans leur cloche. Un manager ne reçoit que
          les alertes de son équipe. Les changements s'appliquent à la prochaine production
          quotidienne des alertes.
        </p>
      </header>
      {!canEdit && (
        <p className="flex items-center gap-2 border-b bg-muted px-5 py-2.5 text-sm text-muted-foreground">
          <Lock className="size-4" /> Lecture seule avec votre rôle.
        </p>
      )}
      {isLoading ? (
        <Loading />
      ) : error ? (
        <div className="p-5">
          <ErrorState error={error} onRetry={() => refetch()} />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-muted-foreground">
              <tr>
                <th scope="col" className="px-5 py-2 font-medium">
                  Alerte
                </th>
                {RECIPIENT_ROLES.map((r) => (
                  <th key={r} scope="col" className="px-3 py-2 text-center font-medium">
                    {ROLE_LABELS[r]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ALERT_KINDS.map((k) => (
                <tr key={k.kind} className="border-b last:border-0">
                  <th scope="row" className="px-5 py-3 text-left font-normal">
                    <span className="font-medium">{k.label}</span>
                    <span className="block text-xs text-muted-foreground">{k.hint}</span>
                  </th>
                  {RECIPIENT_ROLES.map((role) => {
                    const s = recipientState(data ?? [], k.kind, role);
                    return (
                      <td key={role} className="px-3 py-3 text-center">
                        <Checkbox
                          checked={s.state !== "none"}
                          disabled={!canEdit || s.state === "all" || toggle.isPending}
                          aria-label={`${ROLE_LABELS[role]} : ${k.label}${s.state === "all" ? " (tous les types)" : ""}`}
                          onCheckedChange={(on) =>
                            toggle.mutate({ kind: k.kind, role, id: s.id, on: on === true })
                          }
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
