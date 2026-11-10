import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Lock, Pencil } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { documentTypesQuery, normalize, type DocumentType } from "@/lib/referentials";
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
} from "./shared";

export function DocumentTypesPanel() {
  const { data, isLoading } = useQuery(documentTypesQuery);
  const rights = useRefRights();
  const { save, setArchived } = useRefMutations("document_types", "Type de document");
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<DocumentType | "new" | null>(null);
  const [name, setName] = useState("");
  const [confidentiality, setConfidentiality] = useState("standard");
  const [retention, setRetention] = useState("");
  const [order, setOrder] = useState("0");

  const rows = (data ?? []).filter((d) => showArchived || !d.archived_at);
  const open = (t: DocumentType | "new") => {
    setName(t === "new" ? "" : t.name);
    setConfidentiality(t === "new" ? "standard" : t.confidentiality);
    setRetention(t === "new" || t.retention_months === null ? "" : String(t.retention_months));
    setOrder(t === "new" ? String(((data?.length ?? 0) + 1) * 10) : String(t.sort_order));
    setEditing(t);
  };
  const retentionValue = retention.trim() === "" ? null : Number(retention);
  const retentionOk =
    retentionValue === null || (Number.isInteger(retentionValue) && retentionValue > 0);
  const orderValue = Number(order);

  return (
    <Panel
      title="Types de documents"
      description="Un type confidentiel restreint l'accès aux documents concernés."
      count={rows.length}
      showArchived={showArchived}
      onShowArchived={setShowArchived}
      onAdd={rights.canCreate ? () => open("new") : undefined}
      addLabel="Nouveau type"
    >
      {isLoading ? (
        <Loading />
      ) : rows.length === 0 ? (
        <EmptyRow>Aucun type de document.</EmptyRow>
      ) : (
        <ul className="divide-y">
          {rows.map((d) => (
            <RowShell key={d.id} muted={!!d.archived_at}>
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2 font-medium">
                  {d.name}
                  {d.confidentiality === "confidential" && (
                    <Badge variant="secondary" className="gap-1">
                      <Lock className="size-3" /> Confidentiel
                    </Badge>
                  )}
                  {d.archived_at && <ArchivedBadge />}
                </span>
                <span className="text-sm text-muted-foreground">
                  {d.retention_months
                    ? `Conservation : ${d.retention_months} mois`
                    : "Conservation non limitée"}
                </span>
              </span>
              <span className="flex items-center gap-1">
                {rights.canEdit && !d.archived_at && (
                  <Button variant="ghost" size="sm" onClick={() => open(d)}>
                    <Pencil /> Modifier
                  </Button>
                )}
                {rights.canArchive && (
                  <ArchiveControl
                    archived={!!d.archived_at}
                    itemName={d.name}
                    pending={setArchived.isPending}
                    onChange={(archived) => setArchived.mutate({ id: d.id, archived })}
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
        title={editing === "new" ? "Nouveau type de document" : "Modifier le type"}
        submitDisabled={!normalize(name) || !retentionOk || !Number.isInteger(orderValue)}
        pending={save.isPending}
        onSubmit={() =>
          save.mutate(
            {
              id: editing && editing !== "new" ? editing.id : undefined,
              values: {
                name: normalize(name),
                confidentiality,
                retention_months: retentionValue,
                sort_order: orderValue,
              },
            },
            { onSuccess: () => setEditing(null) },
          )
        }
      >
        <Field label="Libellé">
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label="Confidentialité">
          <Select value={confidentiality} onValueChange={setConfidentiality}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="standard">Standard</SelectItem>
              <SelectItem value="confidential">Confidentiel</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field
          label="Durée de conservation (mois)"
          hint="Laisser vide pour une conservation non limitée."
        >
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            value={retention}
            onChange={(e) => setRetention(e.target.value)}
          />
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
