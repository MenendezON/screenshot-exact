/**
 * Journalisation des erreurs côté navigateur.
 * - Tout est écrit dans la console avec un préfixe filtrable ([FMS]).
 * - Les 50 dernières erreurs sont gardées en mémoire (`recentErrors`) pour le support.
 * - Aucune donnée personnelle ne doit être passée dans `context`.
 */
import { describeError } from "@/lib/error-capture";

export interface LoggedError {
  at: string;
  scope: string;
  message: string;
  detail: string;
}

const MAX = 50;
const buffer: LoggedError[] = [];

export function recentErrors(): readonly LoggedError[] {
  return buffer;
}

export function logError(scope: string, error: unknown, context?: Record<string, unknown>): void {
  const detail = describeError(error);
  const message = error instanceof Error ? error.message : String(error);
  buffer.push({ at: new Date().toISOString(), scope, message, detail });
  if (buffer.length > MAX) buffer.shift();
  console.error(`[FMS] ${scope}: ${message}`, context ?? "");
}

/** Message affichable à l'utilisateur : français, sans détail technique. */
export function userMessage(
  error: unknown,
  fallback = "Une erreur est survenue. Réessayez.",
): string {
  const msg = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (!msg) return fallback;
  if (/failed to fetch|network|load failed/i.test(msg))
    return "Connexion impossible. Vérifiez votre réseau puis réessayez.";
  if (/jwt|not authenticated|session/i.test(msg))
    return "Votre session a expiré. Reconnectez-vous.";
  if (/row-level security|permission denied/i.test(msg))
    return "Vous n'avez pas le droit d'effectuer cette action.";
  // Les messages en français levés par la base (triggers) sont montrés tels quels.
  return /[àâéèêëîïôùûç]|doit|obligatoire|déjà|impossible/i.test(msg) ? msg : fallback;
}

let installed = false;
export function installGlobalErrorLogging(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (e) => logError("window.error", e.error ?? e.message));
  window.addEventListener("unhandledrejection", (e) => logError("promise", e.reason));
}
