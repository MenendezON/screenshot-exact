import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Lock } from "lucide-react";

import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime } from "@/lib/format";
import { useCurrentUser } from "@/lib/roles";
import { SETTING_BOUNDS, settingsQuery } from "@/lib/settings";

export const Route = createFileRoute("/_authenticated/parametres")({
  head: () => ({
    meta: [
      { title: "Paramètres métier — Fabrimétal Personnel" },
      {
        name: "description",
        content: "Âge de retraite, durée maximale des contrats et délais de notification.",
      },
      { property: "og:title", content: "Paramètres métier — Fabrimétal Personnel" },
      {
        property: "og:description",
        content: "Âge de retraite, durée maximale des contrats et délais de notification.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(settingsQuery),
  component: SettingsPage,
});

type Setting = Awaited<ReturnType<typeof settingsQuery.queryFn & {}>>[number];

function SettingsPage() {
  const { data: settings } = useSuspenseQuery(settingsQuery);
  const { data: user } = useCurrentUser();
  const canEdit = user?.role === "admin_rh";

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        eyebrow="Règles de gestion"
        title="Paramètres métier"
        description="Ces valeurs alimentent les calculs de l'application. Toute modification est tracée dans le journal d'audit."
      />
      {!canEdit && (
        <p className="mb-4 flex items-center gap-2 rounded-md border bg-muted px-4 py-3 text-sm text-muted-foreground">
          <Lock className="size-4" /> Lecture seule : seul l'administrateur RH peut modifier ces valeurs.
        </p>
      )}
      <div className="divide-y rounded-lg border bg-card shadow-panel">
        {settings.map((s) => (
          <SettingRow key={s.id} setting={s} canEdit={canEdit} />
        ))}
      </div>
    </div>
  );
}

function SettingRow({ setting, canEdit }: { setting: Setting; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(String(setting.value));
  const bounds = SETTING_BOUNDS[setting.unit] ?? { min: 1, max: 999 };
  const parsed = Number(value);
  const valid = Number.isInteger(parsed) && parsed >= bounds.min && parsed <= bounds.max;
  const dirty = parsed !== setting.value;

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("settings").update({ value: parsed }).eq("id", setting.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`« ${setting.label} » mis à jour.`);
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: () => toast.error("Modification refusée."),
  });

  return (
    <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-medium">{setting.label}</p>
        {setting.description && <p className="mt-0.5 text-sm text-muted-foreground">{setting.description}</p>}
        <p className="mt-1 text-xs text-muted-foreground">Modifié le {formatDateTime(setting.updated_at)}</p>
      </div>
      {canEdit ? (
        <form
          className="flex shrink-0 items-start gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid && dirty) mutation.mutate();
          }}
        >
          <div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                inputMode="numeric"
                min={bounds.min}
                max={bounds.max}
                step={1}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="w-24 text-right font-mono"
                aria-label={setting.label}
                aria-invalid={!valid}
              />
              <span className="w-10 text-sm text-muted-foreground">{setting.unit}</span>
            </div>
            {!valid && (
              <p className="mt-1 text-xs text-destructive">
                Entre {bounds.min} et {bounds.max}
              </p>
            )}
          </div>
          <Button type="submit" size="sm" className="h-9" disabled={!valid || !dirty || mutation.isPending}>
            {mutation.isPending && <Loader2 className="animate-spin" />}
            Enregistrer
          </Button>
        </form>
      ) : (
        <p className="shrink-0 font-display text-2xl font-bold">
          {setting.value} <span className="text-sm font-medium text-muted-foreground">{setting.unit}</span>
        </p>
      )}
    </div>
  );
}
