import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Archive, Loader2, Plus, RotateCcw } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/lib/permissions";
import {
  assignmentRefsQuery,
  countUsage,
  dbErrorMessage,
  describeUsage,
  type Usage,
} from "@/lib/referentials";

export type RefTable =
  | "sites"
  | "org_units"
  | "job_titles"
  | "job_title_aliases"
  | "categories"
  | "exit_reasons"
  | "document_types";

/** Droits d'écriture tels que la base les applique : l'interface ne fait que les refléter. */
export function useRefRights() {
  const { can } = usePermissions();
  return {
    canCreate: can("referentials", "create"),
    canEdit: can("referentials", "edit"),
    canArchive: can("referentials", "archive"),
  };
}

/**
 * Mutations communes. Aucune suppression : une ligne se crée, se modifie ou s'archive.
 * Pas de `.select()` après écriture : certaines lignes (motifs confidentiels) ne sont pas
 * relisibles par tous les rôles, et la relecture ferait échouer l'écriture.
 */
export function useRefMutations(table: RefTable, label: string) {
  const queryClient = useQueryClient();
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["ref", table] });
    queryClient.invalidateQueries({ queryKey: ["ref-history"] });
  };
  const onError = (e: unknown) => toast.error(dbErrorMessage(e));

  const save = useMutation({
    mutationFn: async ({
      id,
      values,
    }: {
      id?: string | undefined;
      values: Record<string, unknown>;
    }) => {
      const query = supabase.from(table);
      const { error } = id
        ? await query.update(values as never).eq("id", id)
        : await query.insert(values as never);
      if (error) throw error;
      return !!id;
    },
    onSuccess: (updated) => {
      toast.success(updated ? `${label} modifié.` : `${label} créé.`);
      refresh();
    },
    onError,
  });

  const setArchived = useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const { error } = await supabase
        .from(table)
        .update({ archived_at: archived ? new Date().toISOString() : null } as never)
        .eq("id", id);
      if (error) throw error;
      return archived;
    },
    onSuccess: (archived) => {
      toast.success(archived ? `${label} archivé.` : `${label} restauré.`);
      refresh();
    },
    onError,
  });

  return { save, setArchived };
}

/**
 * Nombre d'affectations par élément. Les affectations ne sont lisibles qu'avec la permission
 * « assignments:view » : sans elle, `get` renvoie `null` (usage inconnu), jamais 0.
 */
export function useUsage(field: "org_unit_id" | "job_title_id" | "category_id") {
  const { can, ready } = usePermissions();
  const allowed = ready && can("assignments", "view");
  const { data } = useQuery({ ...assignmentRefsQuery, enabled: allowed });
  const map = data ? countUsage(data, field, new Date().toISOString().slice(0, 10)) : null;
  return {
    verifiable: allowed,
    get: (id: string): Usage | null => {
      if (!allowed || !map) return null;
      return map.get(id) ?? { current: 0, total: 0 };
    },
  };
}

export function Panel({
  title,
  description,
  count,
  showArchived,
  onShowArchived,
  onAdd,
  addLabel = "Ajouter",
  children,
}: {
  title: string;
  description: string;
  count: number;
  showArchived: boolean;
  onShowArchived: (v: boolean) => void;
  onAdd?: (() => void) | undefined;
  addLabel?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border bg-card">
      <header className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold">
            {title}{" "}
            <span className="ml-1 text-sm font-medium text-muted-foreground">({count})</span>
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex items-center gap-4">
          <Label className="flex items-center gap-2 text-sm font-normal text-muted-foreground">
            <Switch checked={showArchived} onCheckedChange={onShowArchived} />
            Archivés
          </Label>
          {onAdd && (
            <Button size="sm" onClick={onAdd}>
              <Plus /> {addLabel}
            </Button>
          )}
        </div>
      </header>
      {children}
    </section>
  );
}

export function EmptyRow({ children }: { children: ReactNode }) {
  return <p className="px-5 py-8 text-center text-sm text-muted-foreground">{children}</p>;
}

export function ArchivedBadge() {
  return (
    <Badge variant="outline" className="text-muted-foreground">
      Archivé
    </Badge>
  );
}

/**
 * Archivage avec confirmation. L'élément n'est jamais supprimé : il garde son historique
 * et n'est simplement plus proposé pour de nouvelles saisies.
 */
export function ArchiveControl({
  archived,
  itemName,
  usage,
  blockedReason,
  pending,
  onChange,
}: {
  archived: boolean;
  itemName: string;
  usage?: Usage | null | undefined;
  blockedReason?: string | undefined;
  pending: boolean;
  onChange: (archived: boolean) => void;
}) {
  const [open, setOpen] = useState(false);

  if (archived) {
    return (
      <Button variant="ghost" size="sm" disabled={pending} onClick={() => onChange(false)}>
        <RotateCcw /> Restaurer
      </Button>
    );
  }
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        disabled={pending || !!blockedReason}
        title={blockedReason}
        onClick={() => setOpen(true)}
      >
        <Archive /> Archiver
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archiver « {itemName} » ?</AlertDialogTitle>
            <AlertDialogDescription>
              {usage !== undefined && `${describeUsage(usage)} `}L'élément ne sera plus proposé pour
              de nouvelles saisies, mais les dossiers déjà rattachés conservent leur historique.
              Vous pourrez le restaurer à tout moment.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onChange(true);
                setOpen(false);
              }}
            >
              Archiver
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function FormDialog({
  open,
  onOpenChange,
  title,
  submitDisabled,
  pending,
  onSubmit,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  submitDisabled?: boolean | undefined;
  pending: boolean;
  onSubmit: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!submitDisabled && !pending) onSubmit();
          }}
        >
          {children}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={submitDisabled || pending}>
              {pending && <Loader2 className="animate-spin" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Loading() {
  return (
    <div className="flex justify-center px-5 py-10 text-muted-foreground">
      <Loader2 className="animate-spin" aria-label="Chargement" />
    </div>
  );
}

export function RowShell({ muted, children }: { muted?: boolean; children: ReactNode }) {
  return (
    <li
      className={`flex items-center justify-between gap-3 px-5 py-3 ${muted ? "opacity-60" : ""}`}
    >
      {children}
    </li>
  );
}
