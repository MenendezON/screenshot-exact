import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pencil, Tags } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  aliasesQuery,
  jobTitlesQuery,
  normalize,
  type JobTitle,
  type JobTitleAlias,
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

export function JobTitlesPanel() {
  const { data: titles = [], isLoading } = useQuery(jobTitlesQuery);
  const { data: aliases = [] } = useQuery(aliasesQuery);
  const rights = useRefRights();
  const usage = useUsage("job_title_id");
  const { save, setArchived } = useRefMutations("job_titles", "Poste");
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<JobTitle | "new" | null>(null);
  const [name, setName] = useState("");
  const [aliasFor, setAliasFor] = useState<string | null>(null);

  const rows = titles.filter((t) => showArchived || !t.archived_at);
  const activeAliases = (id: string) =>
    aliases.filter((a) => a.job_title_id === id && !a.archived_at);
  const open = (t: JobTitle | "new") => {
    setName(t === "new" ? "" : t.name);
    setEditing(t);
  };

  return (
    <Panel
      title="Postes et alias"
      description="Un alias est une autre appellation du même poste (utile à l'import de données existantes)."
      count={rows.length}
      showArchived={showArchived}
      onShowArchived={setShowArchived}
      onAdd={rights.canCreate ? () => open("new") : undefined}
      addLabel="Nouveau poste"
    >
      {isLoading ? (
        <Loading />
      ) : rows.length === 0 ? (
        <EmptyRow>Aucun poste.</EmptyRow>
      ) : (
        <ul className="divide-y">
          {rows.map((t) => {
            const list = activeAliases(t.id);
            return (
              <RowShell key={t.id} muted={!!t.archived_at}>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2 font-medium">
                    {t.name} {t.archived_at && <ArchivedBadge />}
                  </span>
                  {list.length > 0 && (
                    <span className="mt-1 flex flex-wrap gap-1.5">
                      {list.map((a) => (
                        <Badge key={a.id} variant="outline" className="font-normal">
                          {a.alias}
                        </Badge>
                      ))}
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  {!t.archived_at && (
                    <Button variant="ghost" size="sm" onClick={() => setAliasFor(t.id)}>
                      <Tags /> Alias
                    </Button>
                  )}
                  {rights.canEdit && !t.archived_at && (
                    <Button variant="ghost" size="sm" onClick={() => open(t)}>
                      <Pencil /> Modifier
                    </Button>
                  )}
                  {rights.canArchive && (
                    <ArchiveControl
                      archived={!!t.archived_at}
                      itemName={t.name}
                      usage={usage.get(t.id)}
                      pending={setArchived.isPending}
                      onChange={(archived) => setArchived.mutate({ id: t.id, archived })}
                    />
                  )}
                </span>
              </RowShell>
            );
          })}
        </ul>
      )}
      <FormDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing === "new" ? "Nouveau poste" : "Modifier le poste"}
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
        <Field
          label="Intitulé"
          hint={
            editing !== "new"
              ? "Le renommage s'applique à tous les dossiers rattachés à ce poste."
              : "Unique, sans distinction de casse."
          }
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
      </FormDialog>
      <AliasesDialog
        title={titles.find((t) => t.id === aliasFor) ?? null}
        aliases={aliases.filter((a) => a.job_title_id === aliasFor)}
        onClose={() => setAliasFor(null)}
      />
    </Panel>
  );
}

function AliasesDialog({
  title,
  aliases,
  onClose,
}: {
  title: JobTitle | null;
  aliases: JobTitleAlias[];
  onClose: () => void;
}) {
  const rights = useRefRights();
  const { save, setArchived } = useRefMutations("job_title_aliases", "Alias");
  const [alias, setAlias] = useState("");

  return (
    <Dialog open={title !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Alias — {title?.name}</DialogTitle>
          <DialogDescription>
            Un alias est unique parmi les alias actifs, quel que soit le poste, sans distinction de
            casse.
          </DialogDescription>
        </DialogHeader>
        {rights.canCreate && (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!title || !normalize(alias)) return;
              save.mutate(
                { values: { alias: normalize(alias), job_title_id: title.id } },
                { onSuccess: () => setAlias("") },
              );
            }}
          >
            <Input
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder="Nouvel alias"
              aria-label="Nouvel alias"
            />
            <Button type="submit" disabled={!normalize(alias) || save.isPending}>
              Ajouter
            </Button>
          </form>
        )}
        {aliases.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun alias.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {aliases.map((a) => (
              <li
                key={a.id}
                className={`flex items-center justify-between px-3 py-2 ${a.archived_at ? "opacity-60" : ""}`}
              >
                <span className="flex items-center gap-2 text-sm">
                  {a.alias} {a.archived_at && <ArchivedBadge />}
                </span>
                {rights.canArchive && (
                  <ArchiveControl
                    archived={!!a.archived_at}
                    itemName={a.alias}
                    pending={setArchived.isPending}
                    onChange={(archived) => setArchived.mutate({ id: a.id, archived })}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
