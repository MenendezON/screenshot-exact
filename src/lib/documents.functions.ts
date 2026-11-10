import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DOCUMENT_BUCKET, SIGNED_URL_SECONDS } from "@/lib/documents";

const inputSchema = z.object({
  documentId: z.string().uuid(),
  action: z.enum(["view", "download"]),
});

/**
 * Seul point d'accès aux fichiers : vérifie les droits (RLS de l'utilisateur sur `documents`),
 * écrit d'abord dans `document_access_log`, puis seulement signe une URL valable 60 secondes.
 * Si le journal ne peut pas être écrit, aucune URL n'est délivrée.
 */
export const getDocumentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof inputSchema>) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: doc, error } = await context.supabase
      .from("documents")
      .select("id, storage_path, file_name, mime_type")
      .eq("id", data.documentId)
      .is("archived_at", null)
      .maybeSingle();
    if (error || !doc) throw new Error("Document introuvable ou accès refusé.");

    const { error: logError } = await context.supabase
      .from("document_access_log")
      .insert({ document_id: doc.id, user_id: context.userId, action: data.action });
    if (logError) throw new Error("L'accès n'a pas pu être tracé : le document n'est pas ouvert.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error: signError } = await supabaseAdmin.storage
      .from(DOCUMENT_BUCKET)
      .createSignedUrl(
        doc.storage_path,
        SIGNED_URL_SECONDS,
        data.action === "download" ? { download: doc.file_name } : {},
      );
    if (signError || !signed) {
      throw new Error("Le fichier est introuvable dans le stockage.");
    }
    return {
      url: signed.signedUrl,
      fileName: doc.file_name,
      mimeType: doc.mime_type,
      expiresInSeconds: SIGNED_URL_SECONDS,
    };
  });
