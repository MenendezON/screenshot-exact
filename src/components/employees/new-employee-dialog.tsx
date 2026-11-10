import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import {
  employeeSchema,
  MARITAL_LABELS,
  MARITAL_STATUS,
  toEmployeePayload,
  type EmployeeForm,
} from "@/lib/employee-schemas";
import { managerOptionsQuery } from "@/lib/employees";
import { dbErrorMessage, sitesQuery } from "@/lib/referentials";
import { FormRow, SelectInput, SubmitButton } from "./common";

const EMPTY: EmployeeForm = {
  matricule: "",
  lastName: "",
  firstNames: "",
  birthDate: "",
  birthPlace: "",
  address: "",
  maritalStatus: "",
  childrenCount: "0",
  phone: "",
  email: "",
  managerId: "",
};

export function NewEmployeeDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: sites = [] } = useQuery(sitesQuery);
  const { data: managers = [] } = useQuery(managerOptionsQuery);

  const [siteId, setSiteId] = useState("");
  const form = useForm<EmployeeForm>({
    resolver: zodResolver(employeeSchema),
    defaultValues: EMPTY,
  });
  const { control, register, handleSubmit, reset, setError, formState } = form;
  const errors = formState.errors;

  const create = useMutation({
    mutationFn: async (v: EmployeeForm) => {
      const { data, error } = await supabase
        .from("employees")
        .insert(toEmployeePayload(v))
        .select("id")
        .single();
      if (error) throw error;
      let siteLinked = true;
      if (siteId) {
        const { error: siteError } = await supabase
          .from("employee_sites")
          .insert({ employee_id: data.id, site_id: siteId, is_primary: true });
        siteLinked = !siteError;
      }
      return { id: data.id, siteLinked };
    },
    onSuccess: ({ id, siteLinked }) => {
      toast.success("Dossier créé.");
      if (!siteLinked)
        toast.warning("Le site n'a pas pu être rattaché : ajoutez-le depuis l'onglet Poste.");
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      onOpenChange(false);
      reset(EMPTY);
      setSiteId("");
      navigate({ to: "/employes/$employeeId", params: { employeeId: id } });
    },
    onError: (e) => {
      if ((e as { code?: string } | null)?.code === "23505") {
        setError("matricule", { message: "Ce matricule est déjà utilisé par un autre dossier." });
      } else {
        toast.error(dbErrorMessage(e));
      }
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset(EMPTY);
        setSiteId("");
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nouvel employé</DialogTitle>
          <DialogDescription>
            Créez le dossier, puis ajoutez le poste, le contrat et les documents depuis sa fiche.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={handleSubmit((v) => create.mutate(v))}
          className="grid gap-4 sm:grid-cols-2"
          noValidate
        >
          <FormRow
            label="Matricule"
            htmlFor="n-matricule"
            error={errors.matricule?.message}
            hint="Permanent et unique."
          >
            <Input
              id="n-matricule"
              className="font-mono uppercase"
              aria-invalid={!!errors.matricule}
              placeholder="Ex. FM-0042"
              {...register("matricule")}
            />
          </FormRow>
          <FormRow label="Site principal">
            <SelectInput
              value={siteId}
              onChange={setSiteId}
              emptyLabel="Aucun pour l'instant"
              options={sites
                .filter((s) => !s.archived_at)
                .map((s) => ({ value: s.id, label: s.name }))}
            />
          </FormRow>
          <FormRow label="Nom" htmlFor="n-last" error={errors.lastName?.message}>
            <Input
              id="n-last"
              aria-invalid={!!errors.lastName}
              placeholder="Ex. Diop"
              {...register("lastName")}
            />
          </FormRow>
          <FormRow label="Prénoms" htmlFor="n-first" error={errors.firstNames?.message}>
            <Input
              id="n-first"
              aria-invalid={!!errors.firstNames}
              placeholder="Ex. Awa Fatou"
              {...register("firstNames")}
            />
          </FormRow>
          <FormRow label="Date de naissance" htmlFor="n-birth" error={errors.birthDate?.message}>
            <Input
              id="n-birth"
              type="date"
              aria-invalid={!!errors.birthDate}
              {...register("birthDate")}
            />
          </FormRow>
          <FormRow label="Lieu de naissance" htmlFor="n-place" error={errors.birthPlace?.message}>
            <Input id="n-place" placeholder="Ex. Dakar" {...register("birthPlace")} />
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
            htmlFor="n-children"
            error={errors.childrenCount?.message}
          >
            <Input
              id="n-children"
              inputMode="numeric"
              aria-invalid={!!errors.childrenCount}
              placeholder="0"
              {...register("childrenCount")}
            />
          </FormRow>
          <FormRow label="Téléphone" htmlFor="n-phone" error={errors.phone?.message}>
            <Input
              id="n-phone"
              type="tel"
              placeholder="+221 77 123 45 67"
              aria-invalid={!!errors.phone}
              {...register("phone")}
            />
          </FormRow>
          <FormRow label="E-mail" htmlFor="n-email" error={errors.email?.message}>
            <Input
              id="n-email"
              type="email"
              aria-invalid={!!errors.email}
              placeholder="prenom.nom@exemple.sn"
              {...register("email")}
            />
          </FormRow>
          <div className="sm:col-span-2">
            <FormRow label="Adresse" htmlFor="n-address" error={errors.address?.message}>
              <Input id="n-address" placeholder="Quartier, rue, ville" {...register("address")} />
            </FormRow>
          </div>
          <div className="sm:col-span-2">
            <FormRow label="Responsable hiérarchique" error={errors.managerId?.message}>
              <Controller
                control={control}
                name="managerId"
                render={({ field }) => (
                  <SelectInput
                    value={field.value}
                    onChange={field.onChange}
                    emptyLabel="Aucun"
                    options={managers.map((m) => ({
                      value: m.employee_id ?? "",
                      label: `${m.last_name} ${m.first_names} (${m.matricule})`,
                    }))}
                  />
                )}
              />
            </FormRow>
          </div>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <SubmitButton pending={create.isPending}>Créer le dossier</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
