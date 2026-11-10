import { FormRow, SelectInput } from "@/components/employees/common";
import { Input } from "@/components/ui/input";

export type PeriodFilters = {
  user?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
};

export function UserFilter({
  value,
  users,
  onChange,
}: {
  value: string;
  users: { id: string; name: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <FormRow label="Utilisateur">
      <SelectInput
        value={value}
        onChange={onChange}
        emptyLabel="Tous les utilisateurs"
        options={users.map((u) => ({ value: u.id, label: u.name }))}
      />
    </FormRow>
  );
}

export function PeriodFilter({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (patch: { from?: string; to?: string }) => void;
}) {
  return (
    <>
      <FormRow label="Du" htmlFor="audit-from">
        <Input
          id="audit-from"
          type="date"
          value={from}
          max={to || undefined}
          onChange={(e) => onChange({ from: e.target.value })}
        />
      </FormRow>
      <FormRow label="Au" htmlFor="audit-to">
        <Input
          id="audit-to"
          type="date"
          value={to}
          min={from || undefined}
          onChange={(e) => onChange({ to: e.target.value })}
        />
      </FormRow>
    </>
  );
}

export function Pager({
  page,
  hasNext,
  onPage,
}: {
  page: number;
  hasNext: boolean;
  onPage: (p: number) => void;
}) {
  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm">
      <button
        type="button"
        className="rounded-md border px-3 py-1.5 enabled:hover:bg-muted disabled:opacity-50"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        Précédent
      </button>
      <span className="text-muted-foreground">Page {page}</span>
      <button
        type="button"
        className="rounded-md border px-3 py-1.5 enabled:hover:bg-muted disabled:opacity-50"
        disabled={!hasNext}
        onClick={() => onPage(page + 1)}
      >
        Suivant
      </button>
    </nav>
  );
}
