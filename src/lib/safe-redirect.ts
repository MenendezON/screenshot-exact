/** N'accepte qu'un chemin relatif à l'application (pas d'URL externe). */
export function safeRedirect(value: unknown, fallback = "/accueil"): string {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (value.startsWith("/auth") || value.startsWith("/reset-password")) return fallback;
  return value;
}
