import type { ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { employeeKey } from "@/lib/employees";
import { dbErrorMessage } from "@/lib/referentials";

const NONE = "__none__";

export function FormRow({
  label,
  error,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  htmlFor?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

export type Option = { value: string; label: string; disabled?: boolean };

/** Liste déroulante contrôlée. `emptyLabel` ajoute un choix « aucun » (valeur vide). */
export function SelectInput({
  id,
  value,
  onChange,
  options,
  placeholder = "Choisir…",
  emptyLabel,
  invalid,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  emptyLabel?: string;
  invalid?: boolean;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v === NONE ? "" : v)}>
      <SelectTrigger id={id} aria-invalid={invalid}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {emptyLabel && <SelectItem value={NONE}>{emptyLabel}</SelectItem>}
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} {...(o.disabled ? { disabled: true } : {})}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function Section({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border bg-card">
      <header className="flex flex-col gap-2 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

export function InfoGrid({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid gap-x-8 gap-y-4 px-5 py-5 sm:grid-cols-2">
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {i.label}
          </dt>
          <dd className="mt-0.5 break-words text-sm">
            {i.value === null || i.value === "" ? "—" : i.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-5 py-8 text-center text-sm text-muted-foreground">{children}</p>;
}

export function ReadOnlyNotice({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-2 border-b bg-muted px-5 py-2.5 text-xs text-muted-foreground">
      <Lock className="size-3.5 shrink-0" /> {children}
    </p>
  );
}

export function SubmitButton({
  pending,
  disabled,
  children = "Enregistrer",
}: {
  pending: boolean;
  disabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <Button type="submit" disabled={pending || disabled}>
      {pending && <Loader2 className="animate-spin" />}
      {children}
    </Button>
  );
}

/**
 * Mutation liée à un dossier : rafraîchit la fiche et la liste, affiche un message de succès
 * ou l'erreur de la base en français. `errorMessages` permet de préciser un code d'erreur connu.
 */
export function useEmployeeMutation<TVars>(
  employeeId: string,
  fn: (vars: TVars) => Promise<void>,
  options: { success: string; errorMessages?: Record<string, string>; onDone?: () => void },
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      toast.success(options.success);
      queryClient.invalidateQueries({ queryKey: employeeKey(employeeId) });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      options.onDone?.();
    },
    onError: (e) => {
      const code = (e as { code?: string } | null)?.code;
      toast.error((code && options.errorMessages?.[code]) || dbErrorMessage(e));
    },
  });
}
