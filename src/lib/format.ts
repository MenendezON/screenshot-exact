// Formats d'affichage imposés : FCFA en entiers avec espace, dates jj/mm/aaaa (heure de Dakar).

const TIME_ZONE = "Africa/Dakar";

export function formatFCFA(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return "—";
  const rounded = Math.round(amount);
  const sign = rounded < 0 ? "-" : "";
  const digits = Math.abs(rounded)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${sign}${digits} FCFA`;
}

function toDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  // Une date SQL "aaaa-mm-jj" est une date civile : on la lit à midi UTC pour éviter tout décalage.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T12:00:00Z`);
  return new Date(value);
}

function parts(value: string | Date) {
  const formatter = new Intl.DateTimeFormat("fr-FR", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const map: Record<string, string> = {};
  for (const p of formatter.formatToParts(toDate(value))) map[p.type] = p.value;
  return map;
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = toDate(value);
  if (Number.isNaN(d.getTime())) return "—";
  const p = parts(d);
  return `${p.day}/${p.month}/${p.year}`;
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = toDate(value);
  if (Number.isNaN(d.getTime())) return "—";
  const p = parts(d);
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}
