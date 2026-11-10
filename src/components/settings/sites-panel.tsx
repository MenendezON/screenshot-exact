import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalize, sitesQuery, type Site } from "@/lib/referentials";
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

export function SitesPanel() {
  const { data, isLoading } = useQuery(sitesQuery);
  const rights = useRefRights();
  const { save, setArchived } = useRefMutations("sites", "Site");
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Site | "new" | null>(null);
  const [name, setName] = useState("");

  const rows = (data ?? []).filter((s) => showArchived || !s.archived_at);
  const open = (target: Site | "new") => {
    setName(target === "new" ? "" : target.name);
    setEditing(target);
  };

  return (
    <Panel
      title="Sites"
      description="Lieux de travail rattachables aux employés."
      count={rows.length}
      showArchived={showArchived}
      onShowArchived={setShowArchived}
      onAdd={rights.canCreate ? () => open("new") : undefined}
      addLabel="Nouveau site"
    >
      {isLoading ? (
        <Loading />
      ) : rows.length === 0 ? (
        <EmptyRow>Aucun site.</EmptyRow>
      ) : (
        <ul className="divide-y">
          {rows.map((s) => (
            <RowShell key={s.id} muted={!!s.archived_at}>
              <span className="flex items-center gap-2 font-medium">
                {s.name} {s.archived_at && <ArchivedBadge />}
              </span>
              <span className="flex items-center gap-1">
                {rights.canEdit && !s.archived_at && (
                  <Button variant="ghost" size="sm" onClick={() => open(s)}>
                    <Pencil /> Modifier
                  </Button>
                )}
                {rights.canArchive && (
                  <ArchiveControl
                    archived={!!s.archived_at}
                    itemName={s.name}
                    pending={setArchived.isPending}
                    onChange={(archived) => setArchived.mutate({ id: s.id, archived })}
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
        title={editing === "new" ? "Nouveau site" : "Modifier le site"}
        submitDisabled={!normalize(name)}
        pending={save.isPending}
        onSubmit={() =>
          save.mutate(
            {
              id: editing && editing !== "new" ? editing.id : undefined,
              values: { name: normalize(name) },
            },
            { onSuccess: () => setEditing(null) },
          )
        }
      >
        <Field label="Nom du site">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex. Sébikotane"
            autoFocus
          />
        </Field>
      </FormDialog>
    </Panel>
  );
}
