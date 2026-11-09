import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  fullName: z.string().trim().min(2).max(120),
  role: z.enum(["admin_rh", "gestionnaire_rh", "direction"]),
  redirectTo: z.string().url(),
});

/** Invitation d'un utilisateur : réservée à l'administrateur RH. */
export const inviteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof inviteSchema>) => inviteSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleCheckError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin_rh",
    });
    if (roleCheckError || !isAdmin) {
      throw new Error("Accès refusé : réservé à l'administrateur RH.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: invited, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
      data: { full_name: data.fullName },
      redirectTo: data.redirectTo,
    });
    if (error || !invited.user) {
      const msg = error?.message ?? "";
      if (/already been registered|already exists/i.test(msg)) {
        throw new Error("Un compte existe déjà pour cette adresse e-mail.");
      }
      if (/rate limit/i.test(msg)) {
        throw new Error("Trop d'e-mails envoyés récemment. Réessayez plus tard.");
      }
      throw new Error("L'invitation n'a pas pu être envoyée.");
    }

    // Attribution du rôle avec les droits de l'administrateur connecté (RLS + journal d'audit).
    const { error: roleError } = await context.supabase
      .from("user_roles")
      .insert({ user_id: invited.user.id, role: data.role });
    if (roleError) {
      throw new Error("Invitation envoyée, mais le rôle n'a pas pu être attribué.");
    }

    return { userId: invited.user.id };
  });
