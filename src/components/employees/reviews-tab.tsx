import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus } from "lucide-react";

import { ArchiveControl } from "@/components/settings/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { CONTRACT_LABELS, todayIso, type ContractType } from "@/lib/employee-schemas";
import { employeeKey } from "@/lib/employees";
import { formatDate } from "@/lib/format";
import {
  RATING_LABELS,
  REVIEW_KIND_LABELS,
  REVIEW_KINDS,
  reviewSchema,
  toReviewPayload,
  type ReviewForm,
  type ReviewKind,
  type ReviewRecord,
} from "@/lib/reviews";
import {
  Empty,
  FormRow,
  ReadOnlyNotice,
  Section,
  SelectInput,
  SubmitButton,
  useEmployeeMutation,
} from "./common";
import type { FicheContext } from "./fiche-context";

const blank = (): ReviewForm => ({
  kind: "performance",
  reviewDate: todayIso(),
  rating: "",
  title: "",
  comment: "",
  contractId: "",
});

export function ReviewsTab({ ctx }: { ctx: FicheContext }) {
  const [editing, setEditing] = useState<ReviewRecord | "new" | null>(null);
  const open = !ctx.record.archived_at;
  const canCreate = ctx.can("reviews", "create") && open;
  const canEdit = ctx.can("reviews", "edit") && open;
  const canArchive = ctx.can("reviews", "archive") && open;

  const { data: rows = [], isLoading } = useQuery({
    queryKey: [...employeeKey(ctx.id), "reviews"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_reviews")
        .select("*")
        .eq("employee_id", ctx.id)
        .is("archived_at", null)
        .order("review_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const { data: contracts = [] } = useQuery({
    queryKey: [...employeeKey(ctx.id), "contracts-options"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select("id, type, start_date")
        .eq("employee_id", ctx.id)
        .is("archived_at", null)
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const contractLabel = (c: { type: string; start_date: string }) =>
    `${CONTRACT_LABELS[c.type as ContractType] ?? c.type} depuis le ${formatDate(c.start_date)}`;

  const form = useForm<ReviewForm>({ resolver: zodResolver(reviewSchema), defaultValues: blank() });
  const { register, control, handleSubmit, reset, formState } = form;
  const errors = formState.errors;

  const save = useEmployeeMutation(
    ctx.id,
    async (v: ReviewForm) => {
      const payload = toReviewPayload(v);
      const { error } =
        editing && editing !== "new"
          ? await supabase.from("employee_reviews").update(payload).eq("id", editing.id)
          : await supabase.from("employee_reviews").insert({ ...payload, employee_id: ctx.id });
      if (error) throw error;
    },
    { success: "Appréciation enregistrée.", onDone: () => setEditing(null) },
  );
  const archive = useEmployeeMutation(
    ctx.id,
    async (id: string) => {
      const { error } = await supabase
        .from("employee_reviews")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    { success: "Appréciation archivée." },
  );

  const openDialog = (target: ReviewRecord | "new") => {
    reset(
      target === "new"
        ? blank()
        : {
            kind: target.kind,
            reviewDate: target.review_date,
            rating: target.rating == null ? "" : String(target.rating),
            title: target.title ?? "",
            comment: target.comment,
            contractId: target.contract_id ?? "",
          },
    );
    setEditing(target);
  };

  return (
    <Section
      title="Appréciations"
      description="Contenu confidentiel : réservé aux rôles habilités. L'intéressé ne voit pas ses propres appréciations, et le texte n'apparaît pas dans l'historique."
      actions={
        canCreate ? (
          <Button size="sm" onClick={() => openDialog("new")}>
            <Plus /> Nouvelle appréciation
          </Button>
        ) : undefined
      }
    >
      {!canCreate && !canEdit && <ReadOnlyNotice>Lecture seule avec votre rôle.</ReadOnlyNotice>}
      {isLoading ? (
        <Empty>Chargement…</Empty>
      ) : rows.length === 0 ? (
        <Empty>Aucune appréciation.</Empty>
      ) : (
        <ul className="divide-y">
          {rows.map((r) => {
            const contract = contracts.find((c) => c.id === r.contract_id);
            return (
              <li key={r.id} className="px-5 py-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2 font-medium">
                      {r.title || REVIEW_KIND_LABELS[r.kind as ReviewKind] || r.kind}
                      <Badge variant="outline">{REVIEW_KIND_LABELS[r.kind as ReviewKind]}</Badge>
                      {r.rating != null && (
                        <Badge variant="secondary">
                          {r.rating}/5 · {RATING_LABELS[r.rating]}
                        </Badge>
                      )}
                    </span>
                    <span className="block text-sm text-muted-foreground">
                      {formatDate(r.review_date)}
                      {contract && ` · ${contractLabel(contract)}`}
                    </span>
                    <span className="mt-2 block whitespace-pre-wrap text-sm">{r.comment}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    {canEdit && (
                      <Button variant="ghost" size="sm" onClick={() => openDialog(r)}>
                        <Pencil /> Modifier
                      </Button>
                    )}
                    {canArchive && (
                      <ArchiveControl
                        archived={false}
                        itemName="cette appréciation"
                        pending={archive.isPending}
                        onChange={() => archive.mutate(r.id)}
                      />
                    )}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing === "new" ? "Nouvelle appréciation" : "Modifier l'appréciation"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit((v) => save.mutate(v))} className="space-y-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormRow label="Nature" error={errors.kind?.message}>
                <Controller
                  control={control}
                  name="kind"
                  render={({ field }) => (
                    <SelectInput
                      value={field.value}
                      onChange={field.onChange}
                      options={REVIEW_KINDS.map((k) => ({
                        value: k,
                        label: REVIEW_KIND_LABELS[k],
                      }))}
                    />
                  )}
                />
              </FormRow>
              <FormRow label="Date" htmlFor="rv-date" error={errors.reviewDate?.message}>
                <Input id="rv-date" type="date" {...register("reviewDate")} />
              </FormRow>
              <FormRow label="Note (facultatif)" error={errors.rating?.message}>
                <Controller
                  control={control}
                  name="rating"
                  render={({ field }) => (
                    <SelectInput
                      value={field.value}
                      onChange={field.onChange}
                      emptyLabel="Pas de note"
                      options={[1, 2, 3, 4, 5].map((n) => ({
                        value: String(n),
                        label: `${n} — ${RATING_LABELS[n]}`,
                      }))}
                    />
                  )}
                />
              </FormRow>
              <FormRow label="Contrat concerné (facultatif)" error={errors.contractId?.message}>
                <Controller
                  control={control}
                  name="contractId"
                  render={({ field }) => (
                    <SelectInput
                      value={field.value}
                      onChange={field.onChange}
                      emptyLabel="Aucun"
                      options={contracts.map((c) => ({ value: c.id, label: contractLabel(c) }))}
                    />
                  )}
                />
              </FormRow>
            </div>
            <FormRow label="Titre (facultatif)" htmlFor="rv-title" error={errors.title?.message}>
              <Input id="rv-title" maxLength={150} {...register("title")} />
            </FormRow>
            <FormRow
              label="Commentaire"
              htmlFor="rv-comment"
              error={errors.comment?.message}
              hint="4 000 caractères au plus."
            >
              <Textarea
                id="rv-comment"
                rows={6}
                maxLength={4000}
                aria-invalid={!!errors.comment}
                {...register("comment")}
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
