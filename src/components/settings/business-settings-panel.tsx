import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime } from "@/lib/format";
import { dbErrorMessage } from "@/lib/referentials";
import { SETTING_BOUNDS, settingsQuery, type Setting } from "@/lib/settings";
import { Loading, useRefRights } from "./shared";

export function BusinessSettingsPanel() {
  const { data: settings, isLoading } = useQuery(settingsQuery);
  const { canEdit } = useRefRights();

  return (
    <section className="rounded-lg border bg-card">
      <header className="border-b px-5 py-4">
        <h2 className="text-lg font-bold">Paramètres métier</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Ces valeurs alimentent les calculs de l'application. Toute modification est tracée dans
          l'historique.
        </p>
      </header>
      {!canEdit && (
        <p className="flex items-center gap-2 border-b bg-muted px-5 py-2.5 text-sm text-muted-foreground">
          <Lock className="size-4" /> Lecture seule avec votre rôle.
        </p>
      )}
      {isLoading ? (
        <Loading />
      ) : (
        <div className="divide-y">
          {settings?.map((s) => (
            <SettingRow key={s.id} setting={s} canEdit={canEdit} />
          ))}
        </div>
      )}
    </section>
  );
}

/** Paramètre à deux états (unité « booléen », valeur 0 ou 1) : un interrupteur Activé / Désactivé enregistré aussitôt. */
function ToggleSettingRow({ setting, canEdit }: { setting: Setting; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const on = setting.value === 1;
  const mutation = useMutation({
    mutationFn: async (next: boolean) => {
      const { error } = await supabase
        .from("settings")
        .update({ value: next ? 1 : 0 })
        .eq("id", setting.id);
      if (error) throw error;
    },
    onSuccess: (_d, next) => {
      toast.success(`« ${setting.label} » ${next ? "activé" : "désactivé"}.`);
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      queryClient.invalidateQueries({ queryKey: ["ref-history"] });
    },
    onError: (e) => toast.error(dbErrorMessage(e)),
  });
  return (
    <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-medium">{setting.label}</p>
        {setting.description && (
          <p className="mt-0.5 text-sm text-muted-foreground">{setting.description}</p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          Modifié le {formatDateTime(setting.updated_at)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <Switch
          checked={on}
          disabled={!canEdit || mutation.isPending}
          onCheckedChange={(v) => mutation.mutate(v)}
          aria-label={setting.label}
        />
        <span className="w-20 text-sm font-medium">{on ? "Activé" : "Désactivé"}</span>
      </div>
    </div>
  );
}

function SettingRow({ setting, canEdit }: { setting: Setting; canEdit: boolean }) {
  if (setting.unit === "booléen") return <ToggleSettingRow setting={setting} canEdit={canEdit} />;
  return <NumberSettingRow setting={setting} canEdit={canEdit} />;
}

function NumberSettingRow({ setting, canEdit }: { setting: Setting; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(String(setting.value));
  const bounds = SETTING_BOUNDS[setting.unit] ?? { min: 1, max: 999 };
  const parsed = Number(value);
  const valid =
    value.trim() !== "" && Number.isInteger(parsed) && parsed >= bounds.min && parsed <= bounds.max;
  const dirty = parsed !== setting.value;

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("settings")
        .update({ value: parsed })
        .eq("id", setting.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`« ${setting.label} » mis à jour.`);
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      queryClient.invalidateQueries({ queryKey: ["ref-history"] });
    },
    onError: (e) => toast.error(dbErrorMessage(e)),
  });

  return (
    <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-medium">{setting.label}</p>
        {setting.description && (
          <p className="mt-0.5 text-sm text-muted-foreground">{setting.description}</p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          Modifié le {formatDateTime(setting.updated_at)}
        </p>
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
              <span className="w-12 text-sm text-muted-foreground">{setting.unit}</span>
            </div>
            {!valid && (
              <p className="mt-1 text-xs text-destructive">
                Entre {bounds.min} et {bounds.max}
              </p>
            )}
          </div>
          <Button
            type="submit"
            size="sm"
            className="h-9"
            disabled={!valid || !dirty || mutation.isPending}
          >
            {mutation.isPending && <Loader2 className="animate-spin" />}
            Enregistrer
          </Button>
        </form>
      ) : (
        <p className="shrink-0 font-display text-2xl font-bold">
          {setting.value}{" "}
          <span className="text-sm font-medium text-muted-foreground">{setting.unit}</span>
        </p>
      )}
    </div>
  );
}
