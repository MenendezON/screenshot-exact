import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";

import { AuthLayout } from "@/components/auth-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { safeRedirect } from "@/lib/safe-redirect";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Connexion — Fabrimétal Personnel" },
      { name: "description", content: "Connectez-vous à l'outil de gestion du personnel Fabrimétal." },
      { property: "og:title", content: "Connexion — Fabrimétal Personnel" },
      {
        property: "og:description",
        content: "Connectez-vous à l'outil de gestion du personnel Fabrimétal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

const signInSchema = z.object({
  email: z.string().trim().email("Adresse e-mail invalide"),
  password: z.string().min(1, "Mot de passe requis"),
});
const resetSchema = z.object({
  email: z.string().trim().email("Adresse e-mail invalide"),
});

function AuthPage() {
  const [mode, setMode] = useState<"signin" | "forgot">("signin");
  const search = Route.useSearch();
  const navigate = useNavigate();
  const target = safeRedirect(search.redirect);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: target, replace: true });
    });
  }, [navigate, target]);

  return (
    <AuthLayout>
      {mode === "signin" ? (
        <SignInForm onForgot={() => setMode("forgot")} onSuccess={() => navigate({ to: target, replace: true })} />
      ) : (
        <ForgotForm onBack={() => setMode("signin")} />
      )}
    </AuthLayout>
  );
}

function SignInForm({ onForgot, onSuccess }: { onForgot: () => void; onSuccess: () => void }) {
  const form = useForm<z.infer<typeof signInSchema>>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: z.infer<typeof signInSchema>) {
    const { error } = await supabase.auth.signInWithPassword(values);
    if (error) {
      toast.error(
        error.message.includes("Invalid login")
          ? "E-mail ou mot de passe incorrect."
          : error.message.includes("Email not confirmed")
            ? "Compte non activé : utilisez le lien reçu par e-mail."
            : "Connexion impossible. Réessayez.",
      );
      return;
    }
    onSuccess();
  }

  return (
    <div>
      <p className="eyebrow text-muted-foreground">Accès réservé</p>
      <h2 className="mt-2 text-2xl font-bold">Connexion</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Les comptes sont créés par l'administrateur RH.
      </p>
      <form onSubmit={form.handleSubmit(onSubmit)} className="mt-8 space-y-5" noValidate>
        <div className="space-y-2">
          <Label htmlFor="email">Adresse e-mail</Label>
          <Input id="email" type="email" autoComplete="email" {...form.register("email")} />
          {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Mot de passe</Label>
            <button
              type="button"
              onClick={onForgot}
              className="text-sm text-primary underline-offset-4 hover:underline"
            >
              Mot de passe oublié ?
            </button>
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            {...form.register("password")}
          />
          {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
        </div>
        <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="animate-spin" />}
          Se connecter
        </Button>
      </form>
    </div>
  );
}

function ForgotForm({ onBack }: { onBack: () => void }) {
  const [sent, setSent] = useState(false);
  const form = useForm<z.infer<typeof resetSchema>>({
    resolver: zodResolver(resetSchema),
    defaultValues: { email: "" },
  });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit({ email }: z.infer<typeof resetSchema>) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      toast.error("Envoi impossible. Réessayez dans quelques minutes.");
      return;
    }
    setSent(true);
  }

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Retour à la connexion
      </button>
      <h2 className="mt-6 text-2xl font-bold">Mot de passe oublié</h2>
      {sent ? (
        <p className="mt-4 rounded-md border bg-card p-4 text-sm">
          Si un compte existe pour cette adresse, un lien de réinitialisation vient d'être envoyé.
          Pensez à vérifier les courriers indésirables.
        </p>
      ) : (
        <form onSubmit={form.handleSubmit(onSubmit)} className="mt-8 space-y-5" noValidate>
          <div className="space-y-2">
            <Label htmlFor="reset-email">Adresse e-mail</Label>
            <Input id="reset-email" type="email" autoComplete="email" {...form.register("email")} />
            {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
          </div>
          <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="animate-spin" />}
            Envoyer le lien
          </Button>
        </form>
      )}
    </div>
  );
}
