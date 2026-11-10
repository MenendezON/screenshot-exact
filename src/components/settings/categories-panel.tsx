import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  categoriesQuery,
  normalize,
  STATUS_LABELS,
  STATUS_OPTIONS,
  type Category,
  type EmployeeStatus,
} from "@/lib/referentials";
import {
  ArchiveControl,
  ArchivedBadge,
  EmptyRow,
  Field,
  FormDialog,
  Loading,
  Panel,
  RowShell,
  useRefMutations,
  useRefRights,
  useUsage,
} from "./shared";

export function CategoriesPanel() {
  const { data, isLoading } = useQuery(categoriesQuery);
  const rights = useRefRights();
  const usage = useUsage("category_id");
  const { save, setArchived } = useRefMutations("categories", "Catégorie");
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Category | "new" | null>(null);
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<EmployeeStatus>("employe");
  const [order, setOrder] = useState("0");

  const rows = (data ?? []).filter((c) => showArchived || !c.archived_at);
  const open = (t: Category | "new") => {
    setCode(t === "new" ? "" : t.code);
    setStatus(t === "new" ? "employe" : t.default_status);
    setOrder(t === "new" ? String(((data?.length ?? 0) + 1) * 10) : String(t.sort_order));
    setEditing(t);
  };
  const orderValue = Number(order);

  return (
    <Panel
      title="Catégories professionnelles"
      description="Chaque catégorie propose un statut par défaut lors d'une affectation."
      count={rows.length}
      showArchived={showArchived}
      onShowArchived={setShowArchived}
      onAdd={rights.canCreate ? () => open("new") : undefined}
      addLabel="Nouvelle catégorie"
    >
      {isLoading ? (
        <Loading />
      ) : rows.length === 0 ? (
        <EmptyRow>Aucune catégorie.</EmptyRow>
      ) : (
        <ul className="divide-y">
          {rows.map((c) => (
            <RowShell key={c.id} muted={!!c.archived_at}>
              <span className="min-w-0">
                <span className="flex items-center gap-2 font-medium">
                  <span className="font-mono">{c.code}</span> {c.archived_at && <ArchivedBadge />}
                </span>
                <span className="text-sm text-muted-foreground">
                  Statut par défaut : {STATUS_LABELS[c.default_status]}
                </span>
              </span>
              <span className="flex items-center gap-1">
                {rights.canEdit && !c.archived_at && (
                  <Button variant="ghost" size="sm" onClick={() => open(c)}>
                    <Pencil /> Modifier
                  </Button>
                )}
                {rights.canArchive && (
                  <ArchiveControl
                    archived={!!c.archived_at}
                    itemName={c.code}
                    usage={usage.get(c.id)}
                    pending={setArchived.isPending}
                    onChange={(archived) => setArchived.mutate({ id: c.id, archived })}
                  />
                )}
              </span>
            </RowShell>
          ))}
        </ul>
      )}
      <FormDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing === "new" ? "Nouvelle catégorie" : "Modifier la catégorie"}
        submitDisabled={!normalize(code) || !Number.isInteger(orderValue)}
        pending={save.isPending}
        onSubmit={() =>
          save.mutate(
            {
              id: editing && editing !== "new" ? editing.id : undefined,
              values: { code: normalize(code), default_status: status, sort_order: orderValue },
            },
            { onSuccess: () => setEditing(null) },
          )
        }
      >
        <Field label="Code" hint="Unique, sans distinction de casse.">
          <Input value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
        </Field>
        <Field label="Statut par défaut">
          <Select value={status} onValueChange={(v) => setStatus(v as EmployeeStatus)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Ordre d'affichage">
          <Input
            type="number"
            inputMode="numeric"
            value={order}
            onChange={(e) => setOrder(e.target.value)}
          />
        </Field>
      </FormDialog>
    </Panel>
  );
}
