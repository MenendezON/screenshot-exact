import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Lock, Pencil } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { usePermissions } from "@/lib/permissions";
import { exitReasonsQuery, normalize, type ExitReason } from "@/lib/referentials";
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

export function ExitReasonsPanel() {
  const { data, isLoading } = useQuery(exitReasonsQuery);
  const rights = useRefRights();
  const { can } = usePermissions();
  const { save, setArchived } = useRefMutations("exit_reasons", "Motif");
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<ExitReason | "new" | null>(null);
  const [name, setName] = useState("");
  const [confidential, setConfidential] = useState(false);
  const [order, setOrder] = useState("0");

  const rows = (data ?? []).filter((r) => showArchived || !r.archived_at);
  const open = (t: ExitReason | "new") => {
    setName(t === "new" ? "" : t.name);
    setConfidential(t === "new" ? false : t.is_confidential);
    setOrder(t === "new" ? String(((data?.length ?? 0) + 1) * 10) : String(t.sort_order));
    setEditing(t);
  };
  const orderValue = Number(order);

  return (
    <Panel
      title="Motifs de sortie"
      description="Un motif confidentiel n'est visible que des rôles habilités aux données sensibles."
      count={rows.length}
      showArchived={showArchived}
      onShowArchived={setShowArchived}
      onAdd={rights.canCreate ? () => open("new") : undefined}
      addLabel="Nouveau motif"
    >
      {!can("sensitive_data", "view") && (
        <p className="border-b bg-muted px-5 py-2.5 text-xs text-muted-foreground">
          Les motifs confidentiels ne sont pas affichés avec votre rôle. Si vous en créez un, il
          n'apparaîtra pas dans cette liste.
        </p>
      )}
      {isLoading ? (
        <Loading />
      ) : rows.length === 0 ? (
        <EmptyRow>Aucun motif.</EmptyRow>
      ) : (
        <ul className="divide-y">
          {rows.map((r) => (
            <RowShell key={r.id} muted={!!r.archived_at}>
              <span className="flex flex-wrap items-center gap-2 font-medium">
                {r.name}
                {r.is_confidential && (
                  <Badge variant="secondary" className="gap-1">
                    <Lock className="size-3" /> Confidentiel
                  </Badge>
                )}
                {r.archived_at && <ArchivedBadge />}
              </span>
              <span className="flex items-center gap-1">
                {rights.canEdit && !r.archived_at && (
                  <Button variant="ghost" size="sm" onClick={() => open(r)}>
                    <Pencil /> Modifier
                  </Button>
                )}
                {rights.canArchive && (
                  <ArchiveControl
                    archived={!!r.archived_at}
                    itemName={r.name}
                    pending={setArchived.isPending}
                    onChange={(archived) => setArchived.mutate({ id: r.id, archived })}
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
        title={editing === "new" ? "Nouveau motif de sortie" : "Modifier le motif"}
        submitDisabled={!normalize(name) || !Number.isInteger(orderValue)}
        pending={save.isPending}
        onSubmit={() =>
          save.mutate(
            {
              id: editing && editing !== "new" ? editing.id : undefined,
              values: {
                name: normalize(name),
                is_confidential: confidential,
                sort_order: orderValue,
              },
            },
            { onSuccess: () => setEditing(null) },
          )
        }
      >
        <Field label="Libellé">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex. Démission"
            autoFocus
          />
        </Field>
        <Label className="flex items-center justify-between gap-4 rounded-md border px-3 py-2.5 font-normal">
          <span>
            Motif confidentiel
            <span className="block text-xs text-muted-foreground">
              Masqué aux rôles sans accès aux données sensibles.
            </span>
          </span>
          <Switch checked={confidential} onCheckedChange={setConfidential} />
        </Label>
        <Field label="Ordre d'affichage">
          <Input
            type="number"
            inputMode="numeric"
            placeholder="Ex. 10"
            value={order}
            onChange={(e) => setOrder(e.target.value)}
          />
        </Field>
      </FormDialog>
    </Panel>
  );
}
