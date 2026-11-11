import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/lib/roles";

export const ALERT_KINDS = [
  {
    kind: "contract_ending",
    label: "Fin de contrat proche",
    hint: "CDD, stage ou consultant dont la fin tombe dans le délai d'alerte.",
  },
  {
    kind: "retirement_upcoming",
    label: "Départ à la retraite proche",
    hint: "CDI dont la retraite tombe dans le délai d'alerte.",
  },
  {
    kind: "contract_to_regularize",
    label: "Contrat à régulariser",
    hint: "CDD échu, ni renouvelé ni clos par une sortie.",
  },
] as const;

export const RECIPIENT_ROLES: AppRole[] = [
  "drh",
  "gestionnaire_rh",
  "direction",
  "manager",
  "paie",
  "auditeur",
  "admin_it",
];

export type RecipientRow = { id: string; kind: string; role: AppRole; archived_at: string | null };

/** « direct » = ligne propre à ce type ; « all » = ligne joker (*) du rôle ; « none » = pas destinataire. */
export function recipientState(
  rows: RecipientRow[],
  kind: string,
  role: AppRole,
): { state: "direct" | "all" | "none"; id?: string } {
  const live = rows.filter((r) => !r.archived_at && r.role === role);
  const direct = live.find((r) => r.kind === kind);
  if (direct) return { state: "direct", id: direct.id };
  const all = live.find((r) => r.kind === "*");
  if (all) return { state: "all", id: all.id };
  return { state: "none" };
}

export const recipientsQuery = queryOptions({
  queryKey: ["notification-recipients"],
  queryFn: async (): Promise<RecipientRow[]> => {
    const { data, error } = await supabase
      .from("notification_recipients")
      .select("id, kind, role, archived_at")
      .is("archived_at", null);
    if (error) throw error;
    return data as RecipientRow[];
  },
});
