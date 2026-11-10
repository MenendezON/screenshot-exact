import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CornerDownRight, Pencil, Plus } from "lucide-react";

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
import {
  allowedChildTypes,
  buildOrgTree,
  descendantIds,
  flattenTree,
  hasActiveChildren,
  normalize,
  ORG_TYPE_LABELS,
  ORG_TYPES,
  orgUnitsQuery,
  type OrgNode,
  type OrgUnitType,
} from "@/lib/referentials";
import {
  ArchiveControl,
  ArchivedBadge,
  EmptyRow,
  Field,
  FormDialog,
  Loading,
  Panel,
  useRefMutations,
  useRefRights,
  useUsage,
} from "./shared";

const ROOT = "__root__";

type Draft = { id?: string; name: string; type: OrgUnitType; parentId: string; order: string };

export function OrgTreePanel() {
  const { data: units = [], isLoading } = useQuery(orgUnitsQuery);
  const rights = useRefRights();
  const usage = useUsage("org_unit_id");
  const { save, setArchived } = useRefMutations("org_units", "Unité");
  const [showArchived, setShowArchived] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);

  const nodes = flattenTree(buildOrgTree(units, showArchived));
  const byId = new Map(units.map((u) => [u.id, u]));

  const openNew = (parentId: string | null) => {
    const parentType = parentId ? (byId.get(parentId)?.type ?? null) : null;
    const siblings = units.filter((u) => (u.parent_id ?? null) === parentId).length;
    setDraft({
      name: "",
      type: allowedChildTypes(parentType)[0] ?? "equipe",
      parentId: parentId ?? ROOT,
      order: String((siblings + 1) * 10),
    });
  };
  const openEdit = (n: OrgNode) =>
    setDraft({
      id: n.id,
      name: n.name,
      type: n.type,
      parentId: n.parent_id ?? ROOT,
      order: String(n.sort_order),
    });

  // Parents possibles : unités actives, hors l'unité elle-même et ses descendants.
  const excluded = draft?.id ? descendantIds(units, draft.id) : new Set<string>();
  const parentOptions = flattenTree(buildOrgTree(units, false)).filter((u) => !excluded.has(u.id));
  const parentType =
    draft && draft.parentId !== ROOT ? (byId.get(draft.parentId)?.type ?? null) : null;
  // Une unité doit rester d'un niveau supérieur à ses propres sous-unités actives.
  const childRanks = draft?.id
    ? units
        .filter((u) => u.parent_id === draft.id && !u.archived_at)
        .map((u) => ORG_TYPES.indexOf(u.type))
    : [];
  const typeOptions = allowedChildTypes(parentType).filter(
    (t) => childRanks.length === 0 || ORG_TYPES.indexOf(t) < Math.min(...childRanks),
  );
  const orderValue = Number(draft?.order);

  const changeParent = (parentId: string) => {
    if (!draft) return;
    const pType = parentId === ROOT ? null : (byId.get(parentId)?.type ?? null);
    const allowed = allowedChildTypes(pType);
    setDraft({
      ...draft,
      parentId,
      type: allowed.includes(draft.type) ? draft.type : (allowed[0] ?? draft.type),
    });
  };

  return (
    <Panel
      title="Arbre organisationnel"
      description="Directions, départements, services et équipes. Une unité ne s'archive qu'une fois ses sous-unités archivées."
      count={nodes.length}
      showArchived={showArchived}
      onShowArchived={setShowArchived}
      onAdd={rights.canCreate ? () => openNew(null) : undefined}
      addLabel="Nouvelle unité"
    >
      {isLoading ? (
        <Loading />
      ) : nodes.length === 0 ? (
        <EmptyRow>Aucune unité.</EmptyRow>
      ) : (
        <ul className="divide-y">
          {nodes.map((n) => {
            const archived = !!n.archived_at;
            const u = usage.get(n.id);
            return (
              <li
                key={n.id}
                className={`flex flex-col gap-2 py-3 pr-5 sm:flex-row sm:items-center sm:justify-between ${archived ? "opacity-60" : ""}`}
                style={{ paddingLeft: `${1.25 + n.depth * 1.5}rem` }}
              >
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  {n.depth > 0 && (
                    <CornerDownRight className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="font-medium">{n.name}</span>
                  <Badge variant="secondary">{ORG_TYPE_LABELS[n.type]}</Badge>
                  {archived && <ArchivedBadge />}
                  {u && u.total > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {u.current} en cours / {u.total}
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  {rights.canCreate && !archived && allowedChildTypes(n.type).length > 0 && (
                    <Button variant="ghost" size="sm" onClick={() => openNew(n.id)}>
                      <Plus /> Sous-unité
                    </Button>
                  )}
                  {rights.canEdit && !archived && (
                    <Button variant="ghost" size="sm" onClick={() => openEdit(n)}>
                      <Pencil /> Modifier
                    </Button>
                  )}
                  {rights.canArchive && (
                    <ArchiveControl
                      archived={archived}
                      itemName={n.name}
                      usage={u}
                      blockedReason={
                        hasActiveChildren(units, n.id)
                          ? "Archivez d'abord les sous-unités."
                          : undefined
                      }
                      pending={setArchived.isPending}
                      onChange={(a) => setArchived.mutate({ id: n.id, archived: a })}
                    />
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <FormDialog
        open={draft !== null}
        onOpenChange={(o) => !o && setDraft(null)}
        title={draft?.id ? "Modifier l'unité" : "Nouvelle unité"}
        submitDisabled={
          !draft ||
          !normalize(draft.name) ||
          !Number.isInteger(orderValue) ||
          typeOptions.length === 0
        }
        pending={save.isPending}
        onSubmit={() =>
          draft &&
          save.mutate(
            {
              id: draft.id,
              values: {
                name: normalize(draft.name),
                type: draft.type,
                parent_id: draft.parentId === ROOT ? null : draft.parentId,
                sort_order: orderValue,
              },
            },
            { onSuccess: () => setDraft(null) },
          )
        }
      >
        {draft && (
          <>
            <Field label="Nom">
              <Input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Ex. Direction de la production"
                autoFocus
              />
            </Field>
            <Field label="Unité parente">
              <Select value={draft.parentId} onValueChange={changeParent}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ROOT}>Aucune (niveau supérieur)</SelectItem>
                  {parentOptions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {"— ".repeat(p.depth)}
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field
              label="Type"
              hint="Une sous-unité est toujours d'un niveau inférieur à son parent."
            >
              <Select
                value={draft.type}
                onValueChange={(v) => setDraft({ ...draft, type: v as OrgUnitType })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {typeOptions.map((t) => (
                    <SelectItem key={t} value={t}>
                      {ORG_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Ordre d'affichage">
              <Input
                type="number"
                inputMode="numeric"
                placeholder="Ex. 10"
                value={draft.order}
                onChange={(e) => setDraft({ ...draft, order: e.target.value })}
              />
            </Field>
          </>
        )}
      </FormDialog>
    </Panel>
  );
}
