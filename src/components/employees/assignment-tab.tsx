import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Star, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { assignmentSchema, todayIso, type AssignmentForm } from "@/lib/employee-schemas";
import { employeeKey } from "@/lib/employees";
import { formatDate } from "@/lib/format";
import {
  buildOrgTree,
  categoriesQuery,
  flattenTree,
  jobTitlesQuery,
  orgUnitsQuery,
  sitesQuery,
  STATUS_LABELS,
  type EmployeeStatus,
} from "@/lib/referentials";
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

export function AssignmentTab({ ctx }: { ctx: FicheContext }) {
  return (
    <div className="space-y-6">
      <AssignmentsSection ctx={ctx} />
      <SitesSection ctx={ctx} />
    </div>
  );
}

function AssignmentsSection({ ctx }: { ctx: FicheContext }) {
  const [open, setOpen] = useState(false);
  const canView = ctx.can("assignments", "view");
  const canCreate = ctx.can("assignments", "create") && !ctx.record.archived_at;
  const { data: units = [] } = useQuery(orgUnitsQuery);
  const { data: titles = [] } = useQuery(jobTitlesQuery);
  const { data: categories = [] } = useQuery(categoriesQuery);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: [...employeeKey(ctx.id), "assignments"],
    enabled: canView,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assignments")
        .select("*")
        .eq("employee_id", ctx.id)
        .is("archived_at", null)
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const unitName = (id: string | null) => units.find((u) => u.id === id)?.name ?? "—";
  const titleName = (id: string | null) => titles.find((t) => t.id === id)?.name ?? "—";
  const categoryCode = (id: string | null) => categories.find((c) => c.id === id)?.code ?? "—";
  const cur = ctx.current;
  const previousStart = rows[0]?.start_date ?? null;

  return (
    <Section
      title="Poste et affectations"
      description="L'affectation la plus récente est l'affectation en cours ; la précédente est clôturée automatiquement."
      actions={
        canCreate ? (
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus /> Nouvelle affectation
          </Button>
        ) : undefined
      }
    >
      <InfoGrid
        items={[
          { label: "Poste", value: cur?.job_title_name },
          { label: "Unité", value: cur?.org_unit_name },
          { label: "Catégorie", value: cur?.category_code },
          { label: "Statut professionnel", value: cur?.status ? STATUS_LABELS[cur.status] : null },
          {
            label: "En poste depuis",
            value: cur?.assignment_start ? formatDate(cur.assignment_start) : null,
          },
        ]}
      />
      {canView && (
        <div className="border-t">
          <h3 className="px-5 pt-4 text-sm font-bold">Historique</h3>
          {isLoading ? (
            <Empty>Chargement…</Empty>
          ) : rows.length === 0 ? (
            <Empty>Aucune affectation enregistrée.</Empty>
          ) : (
            <div className="overflow-x-auto px-2 pb-3">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Période</th>
                    <th className="px-3 py-2 font-medium">Poste</th>
                    <th className="px-3 py-2 font-medium">Unité</th>
                    <th className="px-3 py-2 font-medium">Cat.</th>
                    <th className="px-3 py-2 font-medium">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((a) => (
                    <tr key={a.id}>
                      <td className="whitespace-nowrap px-3 py-2">
                        {formatDate(a.start_date)} →{" "}
                        {a.end_date ? formatDate(a.end_date) : "en cours"}
                      </td>
                      <td className="px-3 py-2">{titleName(a.job_title_id)}</td>
                      <td className="px-3 py-2">{unitName(a.org_unit_id)}</td>
                      <td className="px-3 py-2">{categoryCode(a.category_id)}</td>
                      <td className="px-3 py-2">{a.status ? STATUS_LABELS[a.status] : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      <AssignmentDialog
        ctx={ctx}
        open={open}
        onOpenChange={setOpen}
        previousStart={previousStart}
      />
    </Section>
  );
}

function AssignmentDialog({
  ctx,
  open,
  onOpenChange,
  previousStart,
}: {
  ctx: FicheContext;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  previousStart: string | null;
}) {
  const { data: units = [] } = useQuery(orgUnitsQuery);
  const { data: titles = [] } = useQuery(jobTitlesQuery);
  const { data: categories = [] } = useQuery(categoriesQuery);

  const form = useForm<AssignmentForm>({
    resolver: zodResolver(assignmentSchema(previousStart)),
    defaultValues: {
      orgUnitId: "",
      jobTitleId: "",
      categoryId: "",
      status: "",
      startDate: todayIso(),
    },
  });
  const { control, register, handleSubmit, reset, setValue, getValues, formState } = form;
  const errors = formState.errors;

  const save = useEmployeeMutation(
    ctx.id,
    async (v: AssignmentForm) => {
      const { error } = await supabase.from("assignments").insert({
        employee_id: ctx.id,
        org_unit_id: v.orgUnitId,
        job_title_id: v.jobTitleId,
        category_id: v.categoryId || null,
        status: (v.status || null) as EmployeeStatus | null,
        start_date: v.startDate,
      });
      if (error) throw error;
    },
    {
      success: "Affectation enregistrée.",
      onDone: () => {
        onOpenChange(false);
        reset();
      },
    },
  );

  const unitOptions = flattenTree(buildOrgTree(units, false)).map((u) => ({
    value: u.id,
    label: `${"— ".repeat(u.depth)}${u.name}`,
  }));

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouvelle affectation</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit((v) => save.mutate(v))} className="space-y-4" noValidate>
          <FormRow label="Unité" error={errors.orgUnitId?.message}>
            <Controller
              control={control}
              name="orgUnitId"
              render={({ field }) => (
                <SelectInput
                  value={field.value}
                  onChange={field.onChange}
                  options={unitOptions}
                  invalid={!!errors.orgUnitId}
                />
              )}
            />
          </FormRow>
          <FormRow label="Poste" error={errors.jobTitleId?.message}>
            <Controller
              control={control}
              name="jobTitleId"
              render={({ field }) => (
                <SelectInput
                  value={field.value}
                  onChange={field.onChange}
                  options={titles
                    .filter((t) => !t.archived_at)
                    .map((t) => ({ value: t.id, label: t.name }))}
                  invalid={!!errors.jobTitleId}
                />
              )}
            />
          </FormRow>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormRow label="Catégorie" error={errors.categoryId?.message}>
              <Controller
                control={control}
                name="categoryId"
                render={({ field }) => (
                  <SelectInput
                    value={field.value}
                    onChange={(v) => {
                      field.onChange(v);
                      // Le statut proposé suit la catégorie, sans écraser un choix déjà fait.
                      const cat = categories.find((c) => c.id === v);
                      if (cat && getValues("status") === "") setValue("status", cat.default_status);
                    }}
                    emptyLabel="Aucune"
                    options={categories
                      .filter((c) => !c.archived_at)
                      .map((c) => ({ value: c.id, label: c.code }))}
                  />
                )}
              />
            </FormRow>
            <FormRow label="Statut professionnel" error={errors.status?.message}>
              <Controller
                control={control}
                name="status"
                render={({ field }) => (
                  <SelectInput
                    value={field.value}
                    onChange={field.onChange}
                    emptyLabel="Non renseigné"
                    options={Object.entries(STATUS_LABELS).map(([value, label]) => ({
                      value,
                      label,
                    }))}
                  />
                )}
              />
            </FormRow>
          </div>
          <FormRow
            label="Date de début"
            htmlFor="assignment-start"
            error={errors.startDate?.message}
            hint={
              previousStart ? `Doit être postérieure au ${formatDate(previousStart)}.` : undefined
            }
          >
            <Input
              id="assignment-start"
              type="date"
              aria-invalid={!!errors.startDate}
              {...register("startDate")}
            />
          </FormRow>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <SubmitButton pending={save.isPending} />
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SitesSection({ ctx }: { ctx: FicheContext }) {
  const canEdit = ctx.can("employees", "edit") && !ctx.record.archived_at;
  const { data: sites = [] } = useQuery(sitesQuery);
  const [toAdd, setToAdd] = useState("");

  const { data: links = [], isLoading } = useQuery({
    queryKey: [...employeeKey(ctx.id), "sites"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_sites")
        .select("*")
        .eq("employee_id", ctx.id)
        .is("archived_at", null);
      if (error) throw error;
      return data;
    },
  });

  const add = useEmployeeMutation(
    ctx.id,
    async (siteId: string) => {
      const { error } = await supabase
        .from("employee_sites")
        .insert({ employee_id: ctx.id, site_id: siteId, is_primary: links.length === 0 });
      if (error) throw error;
    },
    {
      success: "Site ajouté.",
      errorMessages: { "23505": "Ce site est déjà rattaché à l'employé." },
      onDone: () => setToAdd(""),
    },
  );

  const makePrimary = useEmployeeMutation(
    ctx.id,
    async (linkId: string) => {
      // Un seul site principal à la fois : on retire l'ancien avant de désigner le nouveau.
      const old = links.find((l) => l.is_primary);
      if (old) {
        const { error } = await supabase
          .from("employee_sites")
          .update({ is_primary: false })
          .eq("id", old.id);
        if (error) throw error;
      }
      const { error } = await supabase
        .from("employee_sites")
        .update({ is_primary: true })
        .eq("id", linkId);
      if (error) throw error;
    },
    { success: "Site principal modifié." },
  );

  const remove = useEmployeeMutation(
    ctx.id,
    async (linkId: string) => {
      const { error } = await supabase
        .from("employee_sites")
        .update({ archived_at: new Date().toISOString(), is_primary: false })
        .eq("id", linkId);
      if (error) throw error;
    },
    { success: "Site retiré." },
  );

  const siteName = (id: string) => sites.find((s) => s.id === id)?.name ?? "Site inconnu";
  const available = sites.filter((s) => !s.archived_at && !links.some((l) => l.site_id === s.id));

  return (
    <Section
      title="Sites de travail"
      description="Le site principal sert au filtrage et aux statistiques."
    >
      {isLoading ? (
        <Empty>Chargement…</Empty>
      ) : links.length === 0 ? (
        <Empty>Aucun site rattaché.</Empty>
      ) : (
        <ul className="divide-y">
          {links.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <span className="flex items-center gap-2 font-medium">
                {siteName(l.site_id)} {l.is_primary && <Badge>Principal</Badge>}
              </span>
              {canEdit && (
                <span className="flex items-center gap-1">
                  {!l.is_primary && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={makePrimary.isPending}
                      onClick={() => makePrimary.mutate(l.id)}
                    >
                      <Star /> Rendre principal
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={remove.isPending || (l.is_primary && links.length > 1)}
                    title={
                      l.is_primary && links.length > 1
                        ? "Désignez d'abord un autre site principal."
                        : undefined
                    }
                    onClick={() => remove.mutate(l.id)}
                  >
                    <X /> Retirer
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && available.length > 0 && (
        <div className="flex items-end gap-2 border-t px-5 py-4">
          <div className="flex-1">
            <FormRow label="Ajouter un site">
              <SelectInput
                value={toAdd}
                onChange={setToAdd}
                options={available.map((s) => ({ value: s.id, label: s.name }))}
              />
            </FormRow>
          </div>
          <Button disabled={!toAdd || add.isPending} onClick={() => add.mutate(toAdd)}>
            Ajouter
          </Button>
        </div>
      )}
    </Section>
  );
}
