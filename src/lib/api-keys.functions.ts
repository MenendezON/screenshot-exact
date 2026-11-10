import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { API_LEVELS, generateApiKey } from "@/lib/api/keys";

/* Les tables api_* ne figurent pas encore dans les types générés (voir demande-lovable-schema, section 10). */
/* eslint-disable @typescript-eslint/no-explicit-any */

type Ctx = {
  userId: string;
  supabase: {
    rpc: (
      fn: "has_role",
      args: { _user_id: string; _role: "admin_it" },
    ) => PromiseLike<{ data: boolean | null; error: unknown }>;
  };
};

/** Gestion des clés d'API : réservée au rôle admin_it, vérifiée côté serveur. */
async function requireItAdmin(ctx: Ctx) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin_it",
  });
  if (error || data !== true)
    throw new Error("Accès refusé : la gestion de l'API est réservée à l'administrateur IT.");
}

async function admin(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

async function audit(
  actor: string,
  id: string,
  action: "INSERT" | "UPDATE",
  fields: string[],
  data: Record<string, unknown>,
) {
  const d = await admin();
  await d
    .from("audit_log")
    .insert({
      created_by: actor,
      table_name: "api_clients",
      record_id: id,
      action,
      changed_fields: fields,
      new_data: data,
    });
}

export const listApiClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireItAdmin(context as Ctx);
    const d = await admin();
    const { data, error } = await d
      .from("api_clients")
      .select(
        "id,name,description,level,site_id,key_prefix,expires_at,revoked_at,last_used_at,created_at",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error("Impossible de lire les clés d'API.");
    return data as Array<{
      id: string;
      name: string;
      description: string | null;
      level: (typeof API_LEVELS)[number];
      site_id: string | null;
      key_prefix: string;
      expires_at: string | null;
      revoked_at: string | null;
      last_used_at: string | null;
      created_at: string;
    }>;
  });

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).optional(),
  level: z.enum(API_LEVELS),
  siteId: z.string().uuid().nullable().default(null),
  expiresAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .default(null),
});

/** Crée une clé. La clé en clair n'est renvoyée qu'ici, une seule fois ; seule son empreinte est stockée. */
export const createApiClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof createSchema>) => createSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireItAdmin(context as Ctx);
    if (data.expiresAt && data.expiresAt <= new Date().toISOString().slice(0, 10))
      throw new Error("La date d'expiration doit être dans le futur.");
    const { key, prefix, hash } = await generateApiKey();
    const d = await admin();
    const { data: row, error } = await d
      .from("api_clients")
      .insert({
        name: data.name,
        description: data.description ?? null,
        level: data.level,
        site_id: data.siteId,
        expires_at: data.expiresAt ? `${data.expiresAt}T23:59:59Z` : null,
        key_prefix: prefix,
        key_hash: hash,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error || !row) throw new Error("La clé n'a pas pu être créée.");
    await audit(context.userId, row.id, "INSERT", ["created"], {
      name: data.name,
      level: data.level,
      site_id: data.siteId,
      expires_at: data.expiresAt,
    });
    return { id: row.id as string, key };
  });

export const revokeApiClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireItAdmin(context as Ctx);
    const d = await admin();
    const { error } = await d
      .from("api_clients")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.id)
      .is("revoked_at", null);
    if (error) throw new Error("La clé n'a pas pu être révoquée.");
    await audit(context.userId, data.id, "UPDATE", ["revoked_at"], { event: "api_key_revoked" });
    return { ok: true };
  });

export const listApiCalls = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { clientId?: string | undefined } | undefined) =>
    z.object({ clientId: z.string().uuid().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await requireItAdmin(context as Ctx);
    const d = await admin();
    let q = d
      .from("api_call_log")
      .select("id,client_id,method,path,status,row_count,created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (data.clientId) q = q.eq("client_id", data.clientId);
    const { data: rows, error } = await q;
    if (error) throw new Error("Impossible de lire le journal d'appels.");
    return rows as Array<{
      id: string;
      client_id: string;
      method: string;
      path: string;
      status: number;
      row_count: number;
      created_at: string;
    }>;
  });
