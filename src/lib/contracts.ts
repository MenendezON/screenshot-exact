import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { computeContractEnd, CONTRACT_LABELS, type ContractType } from "@/lib/employee-schemas";
import { fetchMetrics, listAllCurrent } from "@/lib/employees";
import { formatDate } from "@/lib/format";
import { listAll } from "@/lib/referentials";

// ---------- Dates civiles ----------

const DAY_MS = 86_400_000;

/** Nombre de jours entre deux dates « aaaa-mm-jj » (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** « 3 ans et 2 mois », « 45 jours »… pour un nombre de jours restants. */
export function remainingLabel(days: number): string {
  if (days < 0) return `échu depuis ${-days} jour${-days > 1 ? "s" : ""}`;
  if (days === 0) return "aujourd'hui";
  if (days < 61) return `${days} jour${days > 1 ? "s" : ""}`;
  const months = Math.floor(days / 30.4375);
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years === 0) return `${months} mois`;
  return rest === 0
    ? `${years} an${years > 1 ? "s" : ""}`
    : `${years} an${years > 1 ? "s" : ""} et ${rest} mois`;
}

// ---------- Création, renouvellement, conversion ----------

export type ContractLike = {
  id: string;
  type: string;
  start_date: string;
  end_date: string | null;
  terminated_on: string | null;
};

export type ContractMode = "new" | "renewal" | "conversion";

/** Dernier jour effectif d'un contrat (rupture anticipée comprise) ; null = sans fin (CDI). */
export const effectiveEnd = (c: Pick<ContractLike, "end_date" | "terminated_on">) =>
  c.terminated_on ?? c.end_date;

export type NewContract = { type: ContractType; startDate: string; durationMonths: number | null };

/** Fin d'un nouveau contrat : null pour un CDI. */
export function newContractEnd(c: NewContract): string | null {
  if (c.type === "cdi" || c.durationMonths === null) return null;
  return computeContractEnd(c.startDate, c.durationMonths);
}

/**
 * Premier contrat existant qui chevauche la période du nouveau (mêmes bornes que la contrainte de
 * la base : bornes incluses, fin ouverte pour un CDI). Retourne un message clair ou null.
 */
export function overlapMessage(existing: ContractLike[], candidate: NewContract): string | null {
  const start = candidate.startDate;
  const end = newContractEnd(candidate);
  for (const c of existing) {
    const cEnd = effectiveEnd(c);
    const startsBeforeOtherEnds = cEnd === null || start <= cEnd;
    const endsAfterOtherStarts = end === null || end >= c.start_date;
    if (startsBeforeOtherEnds && endsAfterOtherStarts) {
      const label = CONTRACT_LABELS[c.type as ContractType] ?? c.type;
      const period = cEnd
        ? `du ${formatDate(c.start_date)} au ${formatDate(cEnd)}`
        : `depuis le ${formatDate(c.start_date)}, sans date de fin`;
      const hint = cEnd
        ? ` Choisissez une date de début à partir du ${formatDate(addDays(cEnd, 1))}.`
        : "";
      return `Ce contrat chevauche le contrat ${label} ${period}.${hint}`;
    }
  }
  return null;
}

/** Valeurs proposées pour un renouvellement ou une conversion à partir du contrat précédent. */
export function suggestedStart(previous: ContractLike, today: string): string {
  const end = effectiveEnd(previous);
  return end ? addDays(end, 1) : today;
}

/** Un renouvellement ou une conversion ne se propose que depuis le dernier contrat, à durée déterminée. */
export function canFollowUp(contract: ContractLike, all: ContractLike[]): boolean {
  if (contract.type === "cdi") return false;
  return all.every((c) => c.start_date <= contract.start_date);
}

// ---------- Écrans de suivi ----------

export type AlertRow = {
  employee_id: string;
  matricule: string | null;
  first_names: string | null;
  last_name: string | null;
  contract_id: string;
  contract_type: ContractType;
  contract_start: string | null;
  contract_end: string | null;
  retirement_date: string | null;
  reference_date: string | null;
  days_remaining: number | null;
  notice_days: number | null;
  to_notify: boolean;
  to_regularize: boolean;
  primary_site_id: string | null;
  org_unit_id: string | null;
};

const ALERT_COLUMNS =
  "employee_id, matricule, first_names, last_name, contract_id, contract_type, contract_start, contract_end, retirement_date, reference_date, days_remaining, notice_days, to_notify, to_regularize, primary_site_id, org_unit_id";

export const contractAlertsQuery = queryOptions({
  queryKey: ["contracts", "alerts"],
  queryFn: async (): Promise<AlertRow[]> => {
    const rows = await listAll((from, to) =>
      supabase.from("v_contract_alerts").select(ALERT_COLUMNS).order("employee_id").range(from, to),
    );
    return rows as unknown as AlertRow[];
  },
});

/** CDD, stages et consultants dont l'échéance est dans le délai de notification de leur type. */
export function upcomingEnds(rows: AlertRow[]): AlertRow[] {
  return rows
    .filter((r) => r.contract_type !== "cdi" && r.to_notify && r.days_remaining !== null)
    .sort((a, b) => (a.days_remaining ?? 0) - (b.days_remaining ?? 0));
}

/** Contrats à durée déterminée expirés, sans renouvellement ni sortie, du plus ancien au plus récent. */
export function toRegularize(rows: AlertRow[]): AlertRow[] {
  return rows
    .filter((r) => r.to_regularize)
    .sort((a, b) => (a.contract_end ?? "").localeCompare(b.contract_end ?? ""));
}

export type RetirementRow = {
  employee_id: string;
  matricule: string | null;
  first_names: string | null;
  last_name: string | null;
  primary_site_id: string | null;
  org_unit_id: string | null;
  birth_date: string;
  retirement_date: string;
  days_remaining: number;
  alert: boolean;
};

/** Employés en poste triés par temps restant avant la retraite ; alerte dans le délai « CDI ». */
export function retirementRows(
  people: Array<
    Omit<RetirementRow, "retirement_date" | "days_remaining" | "alert" | "birth_date"> & {
      birth_date: string | null;
    }
  >,
  retirementDates: Map<string, string | null>,
  today: string,
  noticeDays: number,
): RetirementRow[] {
  const out: RetirementRow[] = [];
  for (const p of people) {
    const retirement = retirementDates.get(p.employee_id);
    if (!retirement || !p.birth_date) continue;
    const days = daysBetween(today, retirement);
    out.push({
      ...p,
      birth_date: p.birth_date,
      retirement_date: retirement,
      days_remaining: days,
      alert: days <= noticeDays,
    });
  }
  return out.sort((a, b) => a.days_remaining - b.days_remaining);
}

export const retirementQuery = (today: string, noticeDays: number) =>
  queryOptions({
    queryKey: ["contracts", "retirement", today, noticeDays],
    queryFn: async () => {
      const people = await listAllCurrent();
      const metrics = await fetchMetrics(people.map((p) => p.employee_id));
      const dates = new Map<string, string | null>();
      for (const [id, m] of metrics) dates.set(id, m.retirement_date ?? null);
      return retirementRows(people, dates, today, noticeDays);
    },
  });

// ---------- Notifications ----------

export type NotificationRow = {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

export const notificationsQuery = queryOptions({
  queryKey: ["notifications"],
  refetchInterval: 120_000,
  queryFn: async (): Promise<NotificationRow[]> => {
    const { data, error } = await supabase
      .from("notifications")
      .select("id, kind, payload, read_at, created_at")
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return (data ?? []) as NotificationRow[];
  },
});

/** Texte d'une notification ; le contenu reste lisible si le type est inconnu. */
export function describeNotification(n: Pick<NotificationRow, "kind" | "payload">): {
  title: string;
  detail: string | null;
} {
  const p = n.payload;
  const str = (k: string) => (typeof p[k] === "string" ? (p[k] as string) : null);
  const num = (k: string) => (typeof p[k] === "number" ? (p[k] as number) : null);
  const who = str("employee_name");
  const days = num("days_remaining");
  switch (n.kind) {
    case "contract_ending":
      return {
        title: "Fin de contrat à venir",
        detail:
          [who, days !== null ? `dans ${remainingLabel(days)}` : null]
            .filter(Boolean)
            .join(" — ") || null,
      };
    case "retirement_upcoming":
      return {
        title: "Départ à la retraite proche",
        detail:
          [who, days !== null ? `dans ${remainingLabel(days)}` : null]
            .filter(Boolean)
            .join(" — ") || null,
      };
    case "contract_to_regularize":
      return { title: "Contrat à régulariser", detail: who };
    default:
      return { title: str("title") ?? "Notification", detail: str("message") };
  }
}

export const unreadCount = (rows: NotificationRow[] | undefined) =>
  (rows ?? []).filter((n) => n.read_at === null).length;

export async function markNotificationsRead(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .in("id", ids)
    .is("read_at", null);
  if (error) throw error;
}
