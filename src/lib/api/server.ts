/** Accès serveur de l'API publique : authentification par clé, journal d'appels, lectures. Importer uniquement depuis des routes serveur. */
import {
  clientStatus,
  extractKey,
  hashKey,
  makeRateLimiter,
  sameHash,
  type ApiClient,
  type ApiLevel,
  hasLevel,
} from "./keys";

// Les tables api_* ne sont pas dans les types générés tant que Lovable ne les a pas créées.
/* eslint-disable @typescript-eslint/no-explicit-any */
async function admin(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

const limiter = makeRateLimiter(120);

export const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extra,
    },
  });

export type ApiContext = {
  client: ApiClient;
  log: (status: number, rows?: number) => Promise<void>;
};

/** Authentifie la requête ; renvoie le contexte, ou la réponse d'erreur à retourner telle quelle. */
export async function authenticate(
  request: Request,
  minLevel: ApiLevel = "identite",
): Promise<ApiContext | Response> {
  const started = new URL(request.url);
  const found = extractKey(request.headers);
  if (!found)
    return json({ error: "Clé d'API manquante ou mal formée." }, 401, {
      "www-authenticate": "Bearer",
    });

  const db = await admin();
  const { data } = await db
    .from("api_clients")
    .select("id,name,level,site_id,expires_at,revoked_at,key_hash")
    .eq("key_prefix", found.prefix)
    .maybeSingle();
  const hash = await hashKey(found.key);
  if (!data || !sameHash(String(data.key_hash), hash))
    return json({ error: "Clé d'API invalide." }, 401);

  const client: ApiClient = {
    id: data.id,
    name: data.name,
    level: data.level,
    site_id: data.site_id,
    expires_at: data.expires_at,
    revoked_at: data.revoked_at,
  };
  const log = async (status: number, rows = 0) => {
    await db
      .from("api_call_log")
      .insert({
        client_id: client.id,
        method: request.method,
        path: started.pathname,
        status,
        row_count: rows,
      });
    if (status < 400)
      await db
        .from("api_clients")
        .update({ last_used_at: new Date().toISOString() })
        .eq("id", client.id);
  };

  const state = clientStatus(client);
  if (state !== "active") {
    await log(401);
    return json({ error: state === "revoked" ? "Clé révoquée." : "Clé expirée." }, 401);
  }
  if (!limiter(client.id)) {
    await log(429);
    return json({ error: "Trop de requêtes. Réessayez dans une minute." }, 429, {
      "retry-after": "60",
    });
  }
  if (!hasLevel(client.level, minLevel)) {
    await log(403);
    return json({ error: "Niveau d'accès insuffisant pour cette ressource." }, 403);
  }
  return { client, log };
}

export async function db() {
  return admin();
}

export const intParam = (v: string | null, def: number, max: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? Math.min(n, max) : def;
};
