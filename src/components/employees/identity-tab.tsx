import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import {
  employeeSchema,
  ID_DOCUMENT_LABELS,
  ID_DOCUMENT_TYPES,
  KINSHIP_OPTIONS,
  MARITAL_LABELS,
  MARITAL_STATUS,
  sensitiveSchema,
  toEmployeePayload,
  toSensitivePayload,
  type EmployeeForm,
  type SensitiveForm,
} from "@/lib/employee-schemas";
import {
  employeeKey,
  fullName,
  managerOptionsQuery,
  type EmployeeRecord,
  type SensitiveRecord,
} from "@/lib/employees";
import { formatDate } from "@/lib/format";
import {
  Empty,
  FormRow,
  InfoGrid,
  ReadOnlyNotice,
  Section,
  SelectInput,
  SubmitButton,
  useEmployeeMutation,
} from "./common";
import type { FicheContext } from "./fiche-context";

export function IdentityTab({ ctx }: { ctx: FicheContext }) {
  return (
    <div className="space-y-6">
      <CivilSection ctx={ctx} />
      {ctx.can("sensitive_data", "view") && <SensitiveSection ctx={ctx} />}
    </div>
  );
}

const toForm = (r: EmployeeRecord): EmployeeForm => ({
  matricule: r.matricule,
  lastName: r.last_name,
  firstNames: r.first_names,
  birthDate: r.birth_date ?? "",
  birthPlace: r.birth_place ?? "",
  address: r.address ?? "",
  maritalStatus: r.marital_status ?? "",
  childrenCount: String(r.children_count),
  phone: r.phone ?? "",
  email: r.email ?? "",
  managerId: r.manager_id ?? "",
});

function CivilSection({ ctx }: { ctx: FicheContext }) {
  const [editing, setEditing] = useState(false);
  const canEdit = ctx.can("employees", "edit") && !ctx.record.archived_at;
  const { data: managers = [] } = useQuery(managerOptionsQuery);
  const manager = managers.find((m) => m.employee_id === ctx.record.manager_id);

  const form = useForm<EmployeeForm>({
    resolver: zodResolver(employeeSchema),
    defaultValues: toForm(ctx.record),
  });
  const { register, control, handleSubmit, reset, formState } = form;
  const errors = formState.errors;

  const save = useEmployeeMutation(
    ctx.id,
    async (values: EmployeeForm) => {
      const { matricule: _kept, ...payload } = toEmployeePayload(values); // le matricule est permanent
      void _kept;
      const { error } = await supabase.from("employees").update(payload).eq("id", ctx.id);
      if (error) throw error;
    },
    { success: "Dossier mis à jour.", onDone: () => setEditing(false) },
  );

  const startEdit = () => {
    reset(toForm(ctx.record));
    setEditing(true);
  };

  const r = ctx.record;
  return (
    <Section
      title="État civil et contact"
      actions={
        canEdit && !editing ? (
          <Button variant="outline" size="sm" onClick={startEdit}>
            <Pencil /> Modifier
          </Button>
        ) : undefined
      }
    >
      {!editing ? (
        <InfoGrid
          items={[
            { label: "Matricule", value: <span className="font-mono">{r.matricule}</span> },
            { label: "Nom", value: r.last_name },
            { label: "Prénoms", value: r.first_names },
            {
              label: "Date de naissance",
              value: r.birth_date
                ? `${formatDate(r.birth_date)}${ctx.metrics?.age_years != null ? ` (${ctx.metrics.age_years} ans)` : ""}`
                : null,
            },
            { label: "Lieu de naissance", value: r.birth_place },
            {
              label: "Situation familiale",
              value: r.marital_status
                ? MARITAL_LABELS[r.marital_status as keyof typeof MARITAL_LABELS]
                : null,
            },
            { label: "Enfants à charge", value: String(r.children_count) },
            { label: "Téléphone", value: r.phone },
            { label: "E-mail", value: r.email },
            { label: "Adresse", value: r.address },
            {
              label: "Responsable hiérarchique",
              value: manager
                ? `${manager.first_names} ${manager.last_name} (${manager.matricule})`
                : r.manager_id
                  ? "Responsable hors de votre périmètre"
                  : null,
            },
          ]}
        />
      ) : (
        <form
          onSubmit={handleSubmit((v) => save.mutate(v))}
          className="grid gap-4 px-5 py-5 sm:grid-cols-2"
          noValidate
        >
          <FormRow label="Matricule" hint="Permanent : il ne peut pas être modifié.">
            <Input value={r.matricule} disabled className="font-mono" />
          </FormRow>
          <span className="hidden sm:block" />
          <FormRow label="Nom" htmlFor="lastName" error={errors.lastName?.message}>
            <Input
              id="lastName"
              aria-invalid={!!errors.lastName}
              placeholder="Ex. Diop"
              {...register("lastName")}
            />
          </FormRow>
          <FormRow label="Prénoms" htmlFor="firstNames" error={errors.firstNames?.message}>
            <Input
              id="firstNames"
              aria-invalid={!!errors.firstNames}
              placeholder="Ex. Awa Fatou"
              {...register("firstNames")}
            />
          </FormRow>
          <FormRow label="Date de naissance" htmlFor="birthDate" error={errors.birthDate?.message}>
            <Input
              id="birthDate"
              type="date"
              aria-invalid={!!errors.birthDate}
              {...register("birthDate")}
            />
          </FormRow>
          <FormRow
            label="Lieu de naissance"
            htmlFor="birthPlace"
            error={errors.birthPlace?.message}
          >
            <Input id="birthPlace" placeholder="Ex. Dakar" {...register("birthPlace")} />
          </FormRow>
          <FormRow label="Situation familiale" error={errors.maritalStatus?.message}>
            <Controller
              control={control}
              name="maritalStatus"
              render={({ field }) => (
                <SelectInput
                  value={field.value}
                  onChange={field.onChange}
                  emptyLabel="Non renseignée"
                  options={MARITAL_STATUS.map((s) => ({ value: s, label: MARITAL_LABELS[s] }))}
                />
              )}
            />
          </FormRow>
          <FormRow
            label="Enfants à charge"
            htmlFor="childrenCount"
            error={errors.childrenCount?.message}
          >
            <Input
              id="childrenCount"
              inputMode="numeric"
              aria-invalid={!!errors.childrenCount}
              placeholder="0"
              {...register("childrenCount")}
            />
          </FormRow>
          <FormRow label="Téléphone" htmlFor="phone" error={errors.phone?.message}>
            <Input
              id="phone"
              type="tel"
              placeholder="+221 77 123 45 67"
              aria-invalid={!!errors.phone}
              {...register("phone")}
            />
          </FormRow>
          <FormRow label="E-mail" htmlFor="email" error={errors.email?.message}>
            <Input
              id="email"
              type="email"
              aria-invalid={!!errors.email}
              placeholder="prenom.nom@exemple.sn"
              {...register("email")}
            />
          </FormRow>
          <div className="sm:col-span-2">
            <FormRow label="Adresse" htmlFor="address" error={errors.address?.message}>
              <Input id="address" placeholder="Quartier, rue, ville" {...register("address")} />
            </FormRow>
          </div>
          <div className="sm:col-span-2">
            <FormRow
              label="Responsable hiérarchique"
              error={errors.managerId?.message}
              hint="Une boucle hiérarchique est refusée par l'application."
            >
              <Controller
                control={control}
                name="managerId"
                render={({ field }) => (
                  <SelectInput
                    value={field.value}
                    onChange={field.onChange}
                    emptyLabel="Aucun"
                    options={managers
                      .filter((m) => m.employee_id !== ctx.id)
                      .map((m) => ({
                        value: m.employee_id ?? "",
                        label: `${m.last_name} ${m.first_names} (${m.matricule})`,
                      }))}
                  />
                )}
              />
            </FormRow>
          </div>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => setEditing(false)}>
              Annuler
            </Button>
            <SubmitButton pending={save.isPending} />
          </div>
        </form>
      )}
    </Section>
  );
}

const sensitiveToForm = (s: SensitiveRecord | null): SensitiveForm => ({
  idDocumentType: s?.id_document_type ?? "",
  idDocumentNumber: s?.id_document_number ?? "",
  emergencyName: s?.emergency_contact_name ?? "",
  emergencyRelation: s?.emergency_contact_relation ?? "",
  emergencyPhone: s?.emergency_contact_phone ?? "",
});

function SensitiveSection({ ctx }: { ctx: FicheContext }) {
  const [editing, setEditing] = useState(false);
  const canEdit = ctx.can("sensitive_data", "edit") && !ctx.record.archived_at;
  const { data, isLoading } = useQuery({
    queryKey: [...employeeKey(ctx.id), "sensitive"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_sensitive")
        .select("*")
        .eq("employee_id", ctx.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const form = useForm<SensitiveForm>({
    resolver: zodResolver(sensitiveSchema),
    defaultValues: sensitiveToForm(null),
  });
  const { register, control, handleSubmit, reset, formState } = form;
  const errors = formState.errors;

  const save = useEmployeeMutation(
    ctx.id,
    async (values: SensitiveForm) => {
      const payload = toSensitivePayload(values);
      const { error } = data
        ? await supabase.from("employee_sensitive").update(payload).eq("id", data.id)
        : await supabase.from("employee_sensitive").insert({ ...payload, employee_id: ctx.id });
      if (error) throw error;
    },
    { success: "Données sensibles mises à jour.", onDone: () => setEditing(false) },
  );

  return (
    <Section
      title="Pièce d'identité et contact d'urgence"
      description="Données sensibles : leur consultation et leur modification sont tracées."
      actions={
        canEdit && !editing ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              reset(sensitiveToForm(data ?? null));
              setEditing(true);
            }}
          >
            <Pencil /> Modifier
          </Button>
        ) : undefined
      }
    >
      {isLoading ? (
        <Empty>Chargement…</Empty>
      ) : !editing ? (
        <InfoGrid
          items={[
            {
              label: "Type de pièce",
              value: data?.id_document_type
                ? ID_DOCUMENT_LABELS[data.id_document_type as keyof typeof ID_DOCUMENT_LABELS]
                : null,
            },
            {
              label: "Numéro de pièce",
              value: data?.id_document_number ? (
                <span className="font-mono">{data.id_document_number}</span>
              ) : null,
            },
            { label: "Nom du contact d'urgence", value: data?.emergency_contact_name },
            { label: "Lien de parenté", value: data?.emergency_contact_relation },
            { label: "Téléphone du contact d'urgence", value: data?.emergency_contact_phone },
          ]}
        />
      ) : (
        <form
          onSubmit={handleSubmit((v) => save.mutate(v))}
          className="grid gap-4 px-5 py-5 sm:grid-cols-2"
          noValidate
        >
          <FormRow label="Type de pièce" error={errors.idDocumentType?.message}>
            <Controller
              control={control}
              name="idDocumentType"
              render={({ field }) => (
                <SelectInput
                  value={field.value}
                  onChange={field.onChange}
                  emptyLabel="Non renseignée"
                  options={ID_DOCUMENT_TYPES.map((t) => ({
                    value: t,
                    label: ID_DOCUMENT_LABELS[t],
                  }))}
                />
              )}
            />
          </FormRow>
          <FormRow
            label="Numéro de pièce"
            htmlFor="idDocumentNumber"
            error={errors.idDocumentNumber?.message}
          >
            <Input
              id="idDocumentNumber"
              className="font-mono"
              autoComplete="off"
              placeholder="Numéro figurant sur la pièce"
              {...register("idDocumentNumber")}
            />
          </FormRow>
          <FormRow
            label="Nom du contact d'urgence"
            htmlFor="emergencyName"
            error={errors.emergencyName?.message}
            hint="La personne à prévenir en cas d'urgence."
          >
            <Input
              id="emergencyName"
              placeholder="Prénom et nom de la personne à prévenir"
              {...register("emergencyName")}
            />
          </FormRow>
          <FormRow
            label="Lien de parenté"
            htmlFor="emergencyRelation"
            error={errors.emergencyRelation?.message}
          >
            <Controller
              control={control}
              name="emergencyRelation"
              render={({ field }) => (
                <SelectInput
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="Choisir le lien de parenté"
                  emptyLabel="Non renseigné"
                  invalid={!!errors.emergencyRelation}
                  options={[
                    ...KINSHIP_OPTIONS.map((k) => ({ value: k, label: k })),
                    // Une ancienne saisie libre reste sélectionnable : on ne la perd pas à la modification.
                    ...(field.value && !(KINSHIP_OPTIONS as readonly string[]).includes(field.value)
                      ? [{ value: field.value, label: field.value }]
                      : []),
                  ]}
                />
              )}
            />
          </FormRow>
          <FormRow
            label="Téléphone du contact d'urgence"
            htmlFor="emergencyPhone"
            error={errors.emergencyPhone?.message}
            hint="Le numéro pour joindre cette personne."
          >
            <Input
              id="emergencyPhone"
              type="tel"
              placeholder="+221 77 123 45 67"
              {...register("emergencyPhone")}
            />
          </FormRow>
          <div className="flex items-end justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => setEditing(false)}>
              Annuler
            </Button>
            <SubmitButton pending={save.isPending} />
          </div>
        </form>
      )}
      {!canEdit && !editing && <ReadOnlyNotice>Lecture seule avec votre rôle.</ReadOnlyNotice>}
    </Section>
  );
}
