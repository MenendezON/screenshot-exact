import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, ShieldCheck } from "lucide-react";

import { AuthLayout } from "@/components/auth-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { mfaCodeError } from "@/lib/mfa";
import { safeRedirect } from "@/lib/safe-redirect";

export const Route = createFileRoute("/mfa")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } =>
    typeof search["redirect"] === "string" ? { redirect: search["redirect"] } : {},
  head: () => ({
    meta: [
      { title: "Vérification en deux étapes — Fabrimétal Personnel" },
      {
        name: "description",
        content: "Confirmez votre identité avec votre application d'authentification.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MfaPage,
});

type Step =
  | { kind: "loading" }
  | { kind: "challenge"; factorId: string }
  | { kind: "enroll"; factorId: string; qr: string; secret: string }
  | { kind: "error"; message: string };

function MfaPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const search = Route.useSearch();
  const target = safeRedirect(search.redirect);
  const [step, setStep] = useState<Step>({ kind: "loading" });
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        navigate({ to: "/auth", search: { redirect: target }, replace: true });
        return;
      }
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.currentLevel === "aal2") {
        navigate({ to: target, replace: true });
        return;
      }
      const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
      if (listError) {
        if (!cancelled)
          setStep({
            kind: "error",
            message: "Impossible de lire votre configuration de sécurité.",
          });
        return;
      }
      const verified = factors.totp[0];
      if (verified) {
        if (!cancelled) setStep({ kind: "challenge", factorId: verified.id });
        return;
      }
      // Inscription : on supprime d'abord d'éventuels facteurs restés à moitié configurés.
      for (const f of factors.all.filter((x) => x.status !== "verified")) {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data: enrolled, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `Fabrimétal ${new Date().toISOString().slice(0, 10)}`,
      });
      if (cancelled) return;
      if (enrollError || !enrolled) {
        setStep({
          kind: "error",
          message: "Impossible de démarrer la configuration. Réessayez dans un instant.",
        });
        return;
      }
      setStep({
        kind: "enroll",
        factorId: enrolled.id,
        qr: enrolled.totp.qr_code,
        secret: enrolled.totp.secret,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate, target]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (step.kind !== "challenge" && step.kind !== "enroll") return;
    const problem = mfaCodeError(code);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setBusy(true);
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
      factorId: step.factorId,
      code: code.replace(/\s/g, ""),
    });
    setBusy(false);
    if (verifyError) {
      setError("Code incorrect ou expiré. Vérifiez l'heure de votre téléphone et réessayez.");
      return;
    }
    // La session est passée à « aal2 » : on repart de zéro pour recharger rôles et permissions.
    queryClient.clear();
    toast.success("Vérification réussie.");
    navigate({ to: target, replace: true });
  }

  async function signOut() {
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <AuthLayout>
      <div className="mb-6 flex items-center gap-3">
        <ShieldCheck className="size-7 text-primary" />
        <h1 className="text-2xl font-bold">Vérification en deux étapes</h1>
      </div>

      {step.kind === "loading" && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Chargement…
        </p>
      )}

      {step.kind === "error" && <p className="text-sm text-destructive">{step.message}</p>}

      {(step.kind === "challenge" || step.kind === "enroll") && (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {step.kind === "enroll" ? (
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                Votre rôle exige une double authentification. Scannez ce code avec une application
                d'authentification (Google Authenticator, Microsoft Authenticator, Authy…), puis
                saisissez le code à 6 chiffres affiché.
              </p>
              <img
                src={step.qr}
                alt="Code QR à scanner"
                className="mx-auto size-44 rounded-md border bg-white p-2"
              />
              <p className="break-all text-center font-mono text-xs">
                Saisie manuelle : <span className="select-all">{step.secret}</span>
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Saisissez le code à 6 chiffres affiché par votre application d'authentification.
            </p>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="mfa-code">Code à 6 chiffres</Label>
            <Input
              id="mfa-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={7}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              aria-invalid={!!error}
              autoFocus
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            Valider
          </Button>
        </form>
      )}

      <button
        type="button"
        onClick={signOut}
        className="mt-6 text-sm text-muted-foreground underline underline-offset-4"
      >
        Se déconnecter
      </button>
    </AuthLayout>
  );
}
