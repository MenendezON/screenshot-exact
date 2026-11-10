/** Logique pure de la déconnexion automatique après inactivité (testable sans navigateur). */

export const DEFAULT_IDLE_MINUTES = 30;
export const MIN_IDLE_MINUTES = 5;
export const MAX_IDLE_MINUTES = 480;
/** Délai d'avertissement avant la déconnexion, plafonné à la moitié du délai d'inactivité. */
export const WARNING_SECONDS = 60;

export const LAST_ACTIVITY_KEY = "fabrimetal:last-activity";
export const IDLE_NOTICE_KEY = "fabrimetal:idle-logout";

export type IdleStatus = "active" | "warning" | "expired";

/** Lit `session_idle_minutes` ; toute valeur absente ou hors bornes retombe sur les limites. */
export function idleMinutesFromSettings(
  settings: ReadonlyArray<{ key: string; value: unknown }> | undefined,
): number {
  const raw = settings?.find((s) => s.key === "session_idle_minutes")?.value;
  const n = typeof raw === "string" ? Number(raw) : raw;
  if (typeof n !== "number" || !Number.isFinite(n)) return DEFAULT_IDLE_MINUTES;
  return Math.min(MAX_IDLE_MINUTES, Math.max(MIN_IDLE_MINUTES, Math.round(n)));
}

export function warningMs(idleMs: number): number {
  return Math.min(WARNING_SECONDS * 1000, Math.floor(idleMs / 2));
}

export function idleStatus(now: number, lastActivity: number, idleMs: number): IdleStatus {
  const elapsed = now - lastActivity;
  if (elapsed >= idleMs) return "expired";
  if (elapsed >= idleMs - warningMs(idleMs)) return "warning";
  return "active";
}

/** Secondes restantes avant la déconnexion (jamais négatif). */
export function secondsLeft(now: number, lastActivity: number, idleMs: number): number {
  return Math.max(0, Math.ceil((lastActivity + idleMs - now) / 1000));
}

/** Lit l'horodatage partagé entre onglets ; une valeur illisible vaut « maintenant ». */
export function parseLastActivity(raw: string | null, now: number): number {
  const n = raw === null ? Number.NaN : Number(raw);
  if (!Number.isFinite(n) || n > now) return now;
  return n;
}
