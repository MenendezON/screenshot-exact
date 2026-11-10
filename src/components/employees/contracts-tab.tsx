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
import { employeeKey, formatSeniority, type ExitDetailRow } from "@/lib/employees";
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
  const c = ctx.current;
  const refLabel = alert?.contract_type === "cdi" ? "départ à la retraite" : "fin du contrat";

  return (
    <Section title="Situation contractuelle">
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
          {
            label: "Contrat en cours",
            value: c?.contract_type ? CONTRACT_LABELS[c.contract_type as ContractType] : null,
          },
          {
            label: "Fin du contrat",
            value:
              c?.contract_terminated_on || c?.contract_end
                ? formatDate(c.contract_terminated_on ?? c.contract_end)
                : c?.contract_type === "cdi"
                  ? "Durée indéterminée"
                  : null,
          },
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

function ContractsSection({ ctx }: { ctx: FicheContext }) {
  const [open, setOpen] = useState(false);
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

  const save = useEmployeeMutation(
    ctx.id,
    async (v: ContractForm) => {
      // La date de fin est calculée par la base à partir du début et de la durée.
      const { error } = await supabase.from("contracts").insert({
        employee_id: ctx.id,
        type: v.type,
        start_date: v.startDate,
        duration_months: v.type === "cdi" ? null : Number(v.durationMonths),
      });
      if (error) throw error;
    },
    {
      success: "Contrat enregistré.",
      errorMessages: { "23P01": "Ce contrat chevauche un contrat existant de l'employé." },
      onDone: () => {
        setOpen(false);
        reset();
      },
    },
  );

  const endLabel = (c: (typeof rows)[number]) =>
    c.terminated_on
      ? `${formatDate(c.terminated_on)} (rupture)`
      : c.end_date
        ? formatDate(c.end_date)
        : "—";

  return (
    <Section
      title="Contrats"
      actions={
        canCreate ? (
          <Button size="sm" onClick={() => setOpen(true)}>
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
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((c) => (
                <tr key={c.id}>
                  <td className="px-3 py-2">
                    <Badge variant="secondary">{CONTRACT_LABELS[c.type as ContractType]}</Badge>
                  </td>
                  <td className="px-3 py-2">{formatDate(c.start_date)}</td>
                  <td className="px-3 py-2">
                    {c.duration_months ? `${c.duration_months} mois` : "Indéterminée"}
                  </td>
                  <td className="px-3 py-2">{endLabel(c)}</td>
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
            <DialogTitle>Nouveau contrat</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit((v) => save.mutate(v))} className="space-y-4" noValidate>
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
                    options={CONTRACT_TYPES.map((t) => ({ value: t, label: CONTRACT_LABELS[t] }))}
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

function ExitsSection({ ctx }: { ctx: FicheContext }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<ExitForm | null>(null);
  const canRecord =
    ctx.can("employees", "edit") && !ctx.record.archived_at && ctx.current?.is_active !== false;
  const { data: reasons = [] } = useQuery(exitReasonsQuery);

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
                    options={reasons
                      .filter((r) => !r.archived_at)
                      .map((r) => ({ value: r.id, label: r.name }))}
                    invalid={!!errors.reasonId}
                  />
                )}
              />
            </FormRow>
            <FormRow label="Notes" htmlFor="exit-notes" error={errors.notes?.message}>
              <Textarea id="exit-notes" rows={3} {...register("notes")} />
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
