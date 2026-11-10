import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus } from "lucide-react";
import type { z } from "zod";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { compensationSchema, todayIso, type CompensationForm } from "@/lib/employee-schemas";
import { employeeKey, type CompensationRecord } from "@/lib/employees";
import { formatDate, formatFCFA } from "@/lib/format";
import { Empty, FormRow, Section, SubmitButton, useEmployeeMutation } from "./common";
import type { FicheContext } from "./fiche-context";

type Parsed = z.output<typeof compensationSchema>;

/** Variation en % entre deux montants successifs (arrondie à 0,1 point). */
const variationPercent = (previous: number, current: number) =>
  previous > 0 ? Math.round(((current - previous) / previous) * 1000) / 10 : null;

export function CompensationTab({ ctx }: { ctx: FicheContext }) {
  const [editing, setEditing] = useState<CompensationRecord | "new" | null>(null);
  const canCreate = ctx.can("compensation", "create") && !ctx.record.archived_at;
  const canEdit = ctx.can("compensation", "edit") && !ctx.record.archived_at;

  const { data: rows = [], isLoading } = useQuery({
    queryKey: [...employeeKey(ctx.id), "compensation"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("compensation")
        .select("*")
        .eq("employee_id", ctx.id)
        .is("archived_at", null)
        .order("effective_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const form = useForm<CompensationForm, unknown, Parsed>({
    resolver: zodResolver(compensationSchema),
    defaultValues: { amount: "", effectiveDate: todayIso() },
  });
  const { register, handleSubmit, reset, formState } = form;
  const errors = formState.errors;

  const save = useEmployeeMutation(
    ctx.id,
    async (v: Parsed) => {
      const values = { net_monthly_salary_fcfa: Number(v.amount), effective_date: v.effectiveDate };
      const { error } =
        editing && editing !== "new"
          ? await supabase.from("compensation").update(values).eq("id", editing.id)
          : await supabase.from("compensation").insert({ ...values, employee_id: ctx.id });
      if (error) throw error;
    },
    {
      success: "Rémunération enregistrée.",
      errorMessages: { "23505": "Une rémunération existe déjà à cette date d'effet." },
      onDone: () => setEditing(null),
    },
  );

  const open = (target: CompensationRecord | "new") => {
    reset(
      target === "new"
        ? { amount: "", effectiveDate: todayIso() }
        : { amount: String(target.net_monthly_salary_fcfa), effectiveDate: target.effective_date },
    );
    setEditing(target);
  };

  return (
    <Section
      title="Rémunération"
      description="Salaire net mensuel en FCFA. Chaque changement crée une ligne datée."
      actions={
        canCreate ? (
          <Button size="sm" onClick={() => open("new")}>
            <Plus /> Nouvelle rémunération
          </Button>
        ) : undefined
      }
    >
      {isLoading ? (
        <Empty>Chargement…</Empty>
      ) : rows.length === 0 ? (
        <Empty>Aucune rémunération enregistrée.</Empty>
      ) : (
        <ul className="divide-y">
          {rows.map((c, i) => {
            const older = rows[i + 1];
            const delta = older
              ? variationPercent(
                  Number(older.net_monthly_salary_fcfa),
                  Number(c.net_monthly_salary_fcfa),
                )
              : null;
            return (
              <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <span>
                  <span className="font-display text-lg font-bold">
                    {formatFCFA(Number(c.net_monthly_salary_fcfa))}
                  </span>
                  {i === 0 && (
                    <span className="ml-2 rounded-sm bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                      Actuelle
                    </span>
                  )}
                  <span className="block text-sm text-muted-foreground">
                    Depuis le {formatDate(c.effective_date)}
                    {delta !== null &&
                      ` · ${delta > 0 ? "+" : ""}${String(delta).replace(".", ",")} %`}
                  </span>
                </span>
                {canEdit && (
                  <Button variant="ghost" size="sm" onClick={() => open(c)}>
                    <Pencil /> Corriger
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing === "new" ? "Nouvelle rémunération" : "Corriger la rémunération"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit((v) => save.mutate(v))} className="space-y-4" noValidate>
            <FormRow
              label="Salaire net mensuel (FCFA)"
              htmlFor="amount"
              error={errors.amount?.message}
              hint="Montant entier, sans décimales."
            >
              <Input
                id="amount"
                inputMode="numeric"
                className="font-mono"
                aria-invalid={!!errors.amount}
                {...register("amount")}
              />
            </FormRow>
            <FormRow
              label="Date d'effet"
              htmlFor="effectiveDate"
              error={errors.effectiveDate?.message}
            >
              <Input
                id="effectiveDate"
                type="date"
                aria-invalid={!!errors.effectiveDate}
                {...register("effectiveDate")}
              />
            </FormRow>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
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
