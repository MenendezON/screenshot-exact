import { useEffect, useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { AuthLayout } from "@/components/auth-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Définir un mot de passe — Fabri RH" },
      { name: "description", content: "Choisissez le mot de passe de votre compte Fabrimétal." },
      { property: "og:title", content: "Définir un mot de passe — Fabri RH" },
      {
        property: "og:description",
        content: "Choisissez le mot de passe de votre compte Fabrimétal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
});

const schema = z
  .object({
    password: z.string().min(8, "8 caractères minimum"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    path: ["confirm"],
    message: "Les deux mots de passe ne correspondent pas",
  });

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"checking" | "ready" | "invalid">("checking");
  const isInvite = typeof window !== "undefined" && window.location.hash.includes("type=invite");

  useEffect(() => {
    // Le client lit automatiquement le jeton présent dans le lien (invitation ou réinitialisation).
    supabase.auth.getSession().then(({ data }) => setStatus(data.session ? "ready" : "invalid"));
  }, []);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", confirm: "" },
  });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit({ password }: z.infer<typeof schema>) {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      toast.error(
        error.message.toLowerCase().includes("pwned") || error.message.includes("weak")
          ? "Mot de passe trop faible ou déjà compromis. Choisissez-en un autre."
          : "Impossible d'enregistrer le mot de passe.",
      );
      return;
    }
    toast.success("Mot de passe enregistré.");
    navigate({ to: "/accueil", replace: true });
  }

  return (
    <AuthLayout>
      <p className="eyebrow text-muted-foreground">{isInvite ? "Activation du compte" : "Sécurité"}</p>
      <h2 className="mt-2 text-2xl font-bold">
        {isInvite ? "Bienvenue, choisissez votre mot de passe" : "Nouveau mot de passe"}
      </h2>

      {status === "checking" && (
        <p className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Vérification du lien…
        </p>
      )}

      {status === "invalid" && (
        <div className="mt-8 space-y-4">
          <p className="rounded-md border bg-card p-4 text-sm">
            Ce lien est invalide ou a expiré. Demandez un nouveau lien depuis la page de connexion.
          </p>
          <Button asChild variant="outline" className="w-full">
            <Link to="/auth">Aller à la connexion</Link>
          </Button>
        </div>
      )}

      {status === "ready" && (
        <form onSubmit={form.handleSubmit(onSubmit)} className="mt-8 space-y-5" noValidate>
          <div className="space-y-2">
            <Label htmlFor="password">Mot de passe</Label>
            <Input id="password" type="password" autoComplete="new-password" {...form.register("password")} />
            {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">Confirmation</Label>
            <Input id="confirm" type="password" autoComplete="new-password" {...form.register("confirm")} />
            {errors.confirm && <p className="text-sm text-destructive">{errors.confirm.message}</p>}
          </div>
          <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="animate-spin" />}
            Enregistrer le mot de passe
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
