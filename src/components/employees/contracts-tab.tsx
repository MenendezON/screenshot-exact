import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LogOut, Plus } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  computeContractEnd,
  CONTRACT_LABELS,
  CONTRACT_TYPES,
  contractSchema,
  exitSchema,
  todayIso,
  type ContractForm,
  type ContractType,
  type ExitForm,
} from "@/lib/employee-schemas";
import { canFollowUp, overlapMessage, suggestedStart, type ContractMode } from "@/lib/contracts";
import {
  employeeKey,
  formatSeniority,
  type ContractRecord,
  type ExitDetailRow,
} from "@/lib/employees";
import { formatDate } from "@/lib/format";
import { exitReasonsQuery } from "@/lib/referentials";
import { settingsQuery } from "@/lib/settings";
import {
  Empty,
  FormRow,
  InfoGrid,
  Section,
  SelectInput,
  SubmitButton,
  useEmployeeMutation,
} from "./common";
import type { FicheContext } from "./fiche-context";

export function ContractsTab({ ctx }: { ctx: FicheContext }) {
  return (
    <div className="space-y-6">
      <SituationSection ctx={ctx} />
      <ContractsSection ctx={ctx} />
      <ExitsSection ctx={ctx} />
    </div>
  );
}

function SituationSection({ ctx }: { ctx: FicheContext }) {
  const { data: alert } = useQuery({
    queryKey: [...employeeKey(ctx.id), "alert"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_contract_alerts")
        .select("days_remaining, to_notify, to_regularize, reference_date, contract_type")
        .eq("employee_id", ctx.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const m = ctx.metrics;
  const refLabel = alert?.contract_type === "cdi" ? "départ à la retraite" : "fin du contrat";

  return (
    <Section
      title="Ancienneté et échéances"
      description="Calculées à partir des contrats et de la date de naissance. Le détail des contrats est plus bas."
    >
      {(alert?.to_regularize || alert?.to_notify) && (
        <p
          role="status"
          className={`border-b px-5 py-3 text-sm font-medium ${alert.to_regularize ? "bg-destructive/10 text-destructive" : "bg-warning/15 text-foreground"}`}
        >
          {alert.to_regularize
            ? "Le contrat à durée déterminée est échu : la situation est à régulariser."
            : `Échéance proche : ${refLabel} dans ${alert.days_remaining} jour${(alert.days_remaining ?? 0) > 1 ? "s" : ""} (${alert.reference_date ? formatDate(alert.reference_date) : "—"}).`}
        </p>
      )}
      <InfoGrid
        items={[
          { label: "Date d'entrée", value: m?.hire_date ? formatDate(m.hire_date) : null },
          { label: "Ancienneté", value: formatSeniority(m?.seniority_months) },
          { label: "Âge", value: m?.age_years != null ? `${m.age_years} ans` : null },
          {
            label: "Date de départ à la retraite",
            value: m?.retirement_date ? formatDate(m.retirement_date) : null,
          },
        ]}
      />
    </Section>
  );
}

type ContractDialog = { mode: ContractMode; previous: ContractRecord | null };

const MODE_TITLES: Record<ContractMode, string> = {
  new: "Nouveau contrat",
  renewal: "Renouveler le contrat",
  conversion: "Passer en CDI",
};

function ContractsSection({ ctx }: { ctx: FicheContext }) {
  const [dialog, setDialog] = useState<ContractDialog | null>(null);
  const open = dialog !== null;
  const setOpen = (o: boolean) => {
    if (!o) setDialog(null);
  };
  const canView = ctx.can("contracts", "view");
  const canCreate = ctx.can("contracts", "create") && !ctx.record.archived_at;
  const { data: settings } = useQuery(settingsQuery);
  const maxRaw = settings?.find((s) => s.key === "fixed_term_max_months")?.value;
  const maxMonths = typeof maxRaw === "number" ? maxRaw : null;

  const { data: rows = [], isLoading } = useQuery({
    queryKey: [...employeeKey(ctx.id), "contracts"],
    enabled: canView,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select("*")
        .eq("employee_id", ctx.id)
        .is("archived_at", null)
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const form = useForm<ContractForm>({
    resolver: zodResolver(contractSchema(maxMonths)),
    defaultValues: { type: "cdi", startDate: todayIso(), durationMonths: "" },
  });
  const { control, register, handleSubmit, reset, formState } = form;
  const errors = formState.errors;
  const [type, startDate, duration] = useWatch({
    control,
    name: ["type", "startDate", "durationMonths"],
  });
  const previewEnd =
    type !== "cdi" && /^\d+$/.test(duration)
      ? computeContractEnd(startDate, Number(duration))
      : null;

  const openDialog = (mode: ContractMode, previous: ContractRecord | null) => {
    const start = previous ? suggestedStart(previous, todayIso()) : todayIso();
    reset({
      type:
        mode === "conversion"
          ? "cdi"
          : mode === "renewal" && previous
            ? (previous.type as ContractType)
            : "cdi",
      startDate: start,
      durationMonths: "",
    });
    setDialog({ mode, previous });
  };

  const save = useEmployeeMutation(
    ctx.id,
    async (v: ContractForm) => {
      // La date de fin est calculée par la base à partir du début et de la durée.
      const { error } = await supabase.from("contracts").insert({
        employee_id: ctx.id,
        type: v.type,
        start_date: v.startDate,
        duration_months: v.type === "cdi" ? null : Number(v.durationMonths),
        previous_contract_id: dialog?.previous?.id ?? null,
      });
      if (error) throw error;
    },
    {
      success: "Contrat enregistré.",
      errorMessages: { "23P01": "Ce contrat chevauche un contrat existant de l'employé." },
      onDone: () => {
        setDialog(null);
        reset();
      },
    },
  );

  const submit = (v: ContractForm) => {
    const conflict = overlapMessage(rows, {
      type: v.type,
      startDate: v.startDate,
      durationMonths: v.type === "cdi" ? null : Number(v.durationMonths),
    });
    if (conflict) {
      form.setError("startDate", { type: "validate", message: conflict });
      return;
    }
    save.mutate(v);
  };

  const endLabel = (c: (typeof rows)[number]) =>
    c.terminated_on
      ? `${formatDate(c.terminated_on)} (rupture)`
      : c.end_date
        ? formatDate(c.end_date)
        : "—";

  return (
    <Section
      title="Contrats"
      description="Historique des contrats de l'employé ; celui en cours est signalé. Le contrat signé se dépose dans l'onglet Documents."
      actions={
        canCreate ? (
          <Button size="sm" onClick={() => openDialog("new", null)}>
            <Plus /> Nouveau contrat
          </Button>
        ) : undefined
      }
    >
      {!canView ? (
        <Empty>Votre rôle n'a pas accès à la liste des contrats.</Empty>
      ) : isLoading ? (
        <Empty>Chargement…</Empty>
      ) : rows.length === 0 ? (
        <Empty>Aucun contrat enregistré.</Empty>
      ) : (
        <div className="overflow-x-auto px-2 py-2">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Début</th>
                <th className="px-3 py-2 font-medium">Durée</th>
                <th className="px-3 py-2 font-medium">Fin</th>
                <th className="px-3 py-2 font-medium">Origine</th>
                {canCreate && (
                  <th className="px-3 py-2 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((c) => (
                <tr key={c.id}>
                  <td className="px-3 py-2">
                    <Badge variant="secondary">{CONTRACT_LABELS[c.type as ContractType]}</Badge>
                    {ctx.current?.contract_id === c.id && <Badge className="ml-2">En cours</Badge>}
                  </td>
                  <td className="px-3 py-2">{formatDate(c.start_date)}</td>
                  <td className="px-3 py-2">
                    {c.duration_months ? `${c.duration_months} mois` : "Indéterminée"}
                  </td>
                  <td className="px-3 py-2">{endLabel(c)}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {c.previous_contract_id
                      ? originLabel(
                          c,
                          rows.find((r) => r.id === c.previous_contract_id),
                        )
                      : "—"}
                  </td>
                  {canCreate && (
                    <td className="px-3 py-2 text-right">
                      {ctx.current?.is_active !== false && canFollowUp(c, rows) && (
                        <span className="inline-flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openDialog("renewal", c)}
                          >
                            Renouveler
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openDialog("conversion", c)}
                          >
                            Passer en CDI
                          </Button>
                        </span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) reset();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog ? MODE_TITLES[dialog.mode] : "Nouveau contrat"}</DialogTitle>
          </DialogHeader>
          {dialog?.previous && (
            <p className="text-sm text-muted-foreground">
              Fait suite au contrat {CONTRACT_LABELS[dialog.previous.type as ContractType]} du{" "}
              {formatDate(dialog.previous.start_date)}. L'ancien contrat reste dans l'historique.
            </p>
          )}
          <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
            <FormRow label="Type de contrat" error={errors.type?.message}>
              <Controller
                control={control}
                name="type"
                render={({ field }) => (
                  <SelectInput
                    value={field.value}
                    onChange={(v) => {
                      field.onChange(v);
                      if (v === "cdi") form.setValue("durationMonths", "");
                    }}
                    options={CONTRACT_TYPES.filter(
                      (t) => dialog?.mode !== "conversion" || t === "cdi",
                    ).map((t) => ({ value: t, label: CONTRACT_LABELS[t] }))}
                  />
                )}
              />
            </FormRow>
            <FormRow
              label="Date de début"
              htmlFor="contract-start"
              error={errors.startDate?.message}
            >
              <Input
                id="contract-start"
                type="date"
                aria-invalid={!!errors.startDate}
                {...register("startDate")}
              />
            </FormRow>
            {type !== "cdi" && (
              <FormRow
                label="Durée (mois)"
                htmlFor="contract-duration"
                error={errors.durationMonths?.message}
                hint={
                  previewEnd
                    ? `Fin prévue le ${formatDate(previewEnd)}.`
                    : maxMonths
                      ? `Durée maximale : ${maxMonths} mois.`
                      : undefined
                }
              >
                <Input
                  id="contract-duration"
                  inputMode="numeric"
                  aria-invalid={!!errors.durationMonths}
                  placeholder="Ex. 12"
                  {...register("durationMonths")}
                />
              </FormRow>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Annuler
              </Button>
              <SubmitButton pending={save.isPending} />
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Section>
  );
}

function originLabel(c: ContractRecord, previous: ContractRecord | undefined) {
  const from = previous ? ` du ${formatDate(previous.start_date)}` : "";
  if (c.type === "cdi" && previous && previous.type !== "cdi")
    return `Conversion du contrat${from}`;
  return `Renouvellement du contrat${from}`;
}

function ExitsSection({ ctx }: { ctx: FicheContext }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<ExitForm | null>(null);
  const canRecord =
    ctx.can("employees", "edit") && !ctx.record.archived_at && ctx.current?.is_active !== false;
  const { data: reasons = [] } = useQuery(exitReasonsQuery);
  // Un motif confidentiel ne se choisit (et ne s'affiche) qu'avec la permission sur les données sensibles.
  const canConfidential = ctx.can("sensitive_data", "edit");

  const { data: exits = [], isLoading } = useQuery({
    queryKey: [...employeeKey(ctx.id), "exits"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_exit_details")
        .select("*")
        .eq("employee_id", ctx.id)
        .is("archived_at", null)
        .order("exit_date", { ascending: false });
      if (error) throw error;
      return data as ExitDetailRow[];
    },
  });

  const form = useForm<ExitForm>({
    resolver: zodResolver(exitSchema(ctx.current?.contract_start ?? null)),
    defaultValues: { exitDate: todayIso(), reasonId: "", notes: "" },
  });
  const { control, register, handleSubmit, reset, formState } = form;
  const errors = formState.errors;

  const save = useEmployeeMutation(
    ctx.id,
    async (v: ExitForm) => {
      const { error } = await supabase.from("exits").insert({
        employee_id: ctx.id,
        exit_date: v.exitDate,
        reason_id: v.reasonId,
        notes: v.notes.trim() === "" ? null : v.notes.trim(),
      });
      if (error) throw error;
    },
    {
      success: "Sortie enregistrée.",
      onDone: () => {
        setPending(null);
        setOpen(false);
        reset();
      },
    },
  );

  return (
    <Section
      title="Sortie"
      description="Enregistrer une sortie met fin au contrat et à l'affectation en cours."
      actions={
        canRecord ? (
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            <LogOut /> Enregistrer une sortie
          </Button>
        ) : undefined
      }
    >
      {isLoading ? (
        <Empty>Chargement…</Empty>
      ) : exits.length === 0 ? (
        <Empty>Aucune sortie enregistrée.</Empty>
      ) : (
        <ul className="divide-y">
          {exits.map((x) => (
            <li key={x.id ?? ""} className="px-5 py-3 text-sm">
              <p className="flex flex-wrap items-center gap-2 font-medium">
                {x.exit_date ? formatDate(x.exit_date) : "—"} — {x.reason_name}
                {x.is_confidential && <Badge variant="secondary">Confidentiel</Badge>}
              </p>
              {x.notes && <p className="mt-1 text-muted-foreground">{x.notes}</p>}
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) reset();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enregistrer une sortie</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit((v) => setPending(v))} className="space-y-4" noValidate>
            <FormRow label="Date de sortie" htmlFor="exit-date" error={errors.exitDate?.message}>
              <Input
                id="exit-date"
                type="date"
                aria-invalid={!!errors.exitDate}
                {...register("exitDate")}
              />
            </FormRow>
            <FormRow label="Motif" error={errors.reasonId?.message}>
              <Controller
                control={control}
                name="reasonId"
                render={({ field }) => (
                  <SelectInput
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="Choisir un motif"
                    options={reasons
                      .filter((r) => !r.archived_at && (!r.is_confidential || canConfidential))
                      .map((r) => ({ value: r.id, label: r.name }))}
                    invalid={!!errors.reasonId}
                  />
                )}
              />
            </FormRow>
            <FormRow label="Notes" htmlFor="exit-notes" error={errors.notes?.message}>
              <Textarea
                id="exit-notes"
                rows={3}
                placeholder="Contexte de la sortie (facultatif)"
                {...register("notes")}
              />
            </FormRow>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Annuler
              </Button>
              <Button type="submit">Continuer</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la sortie ?</AlertDialogTitle>
            <AlertDialogDescription>
              {pending ? `Le ${formatDate(pending.exitDate)}, ` : ""}le contrat et l'affectation en
              cours seront clôturés. Cette opération est tracée dans l'historique du dossier.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Retour</AlertDialogCancel>
            <AlertDialogAction
              disabled={save.isPending}
              onClick={() => pending && save.mutate(pending)}
            >
              Confirmer la sortie
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Section>
  );
}
