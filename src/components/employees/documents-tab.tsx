import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Download, Eye, FileText, History, Plus, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import {
  chainIds,
  DEFAULT_EXPIRY_NOTICE_DAYS,
  DOCUMENT_BUCKET,
  expiryState,
  formatSize,
  groupVersions,
  isPreviewable,
  nextVersion,
  sniffFile,
  storagePathFor,
  type VersionGroup,
} from "@/lib/documents";
import { getDocumentUrl } from "@/lib/documents.functions";
import {
  documentSchema,
  todayIso,
  validateDocumentFile,
  type DocumentForm,
} from "@/lib/employee-schemas";
import { employeeKey, type DocumentRecord } from "@/lib/employees";
import { formatDate } from "@/lib/format";
import { dbErrorMessage, documentTypesQuery } from "@/lib/referentials";
import { settingsQuery } from "@/lib/settings";
import { ArchiveControl } from "@/components/settings/shared";
import { Empty, FormRow, Section, SelectInput, SubmitButton, useEmployeeMutation } from "./common";
import type { FicheContext } from "./fiche-context";

type Preview = { doc: DocumentRecord; url: string } | null;

export function DocumentsTab({ ctx }: { ctx: FicheContext }) {
  const [upload, setUpload] = useState<{ replacing: DocumentRecord | null } | null>(null);
  const [preview, setPreview] = useState<Preview>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const requestUrl = useServerFn(getDocumentUrl);
  const { data: types = [] } = useQuery(documentTypesQuery);
  const { data: settings } = useQuery(settingsQuery);
  const noticeRaw = settings?.find((s) => s.key === "document_expiry_notice_days")?.value;
  const noticeDays = typeof noticeRaw === "number" ? noticeRaw : DEFAULT_EXPIRY_NOTICE_DAYS;
  const canCreateStd = ctx.can("documents", "create");
  const canCreateConf = ctx.can("confidential_documents", "create");
  const canCreate = (canCreateStd || canCreateConf) && !ctx.record.archived_at;
  const today = todayIso();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: [...employeeKey(ctx.id), "documents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .eq("employee_id", ctx.id)
        .is("archived_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const groups = groupVersions(rows);
  const typeOf = (id: string) => types.find((t) => t.id === id);
  const isConfidential = (d: DocumentRecord) =>
    typeOf(d.document_type_id)?.confidentiality === "confidential";
  const canWrite = (d: DocumentRecord, action: "create" | "archive") =>
    ctx.can(isConfidential(d) ? "confidential_documents" : "documents", action);

  const archive = useEmployeeMutation(
    ctx.id,
    async (ids: string[]) => {
      const { error } = await supabase
        .from("documents")
        .update({ archived_at: new Date().toISOString() })
        .in("id", ids);
      if (error) throw error;
    },
    { success: "Document archivé." },
  );

  /** L'accès passe toujours par la fonction serveur : droits, journal, puis URL signée de 60 s. */
  async function open(doc: DocumentRecord, action: "view" | "download") {
    setOpening(`${doc.id}:${action}`);
    try {
      const res = await requestUrl({ data: { documentId: doc.id, action } });
      if (action === "view") setPreview({ doc, url: res.url });
      else window.open(res.url, "_blank", "noopener");
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Impossible d'ouvrir ce document.");
    } finally {
      setOpening(null);
    }
  }

  const actionsFor = (d: DocumentRecord) => (
    <>
      {isPreviewable(d.mime_type) && (
        <Button
          variant="ghost"
          size="sm"
          disabled={opening !== null}
          onClick={() => open(d, "view")}
        >
          <Eye /> Aperçu
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        disabled={opening !== null}
        onClick={() => open(d, "download")}
      >
        <Download /> Télécharger
      </Button>
    </>
  );

  return (
    <Section
      title="Documents"
      description="Les documents confidentiels ne sont visibles que des rôles habilités. Chaque ouverture ou téléchargement est tracé."
      actions={
        canCreate ? (
          <Button size="sm" onClick={() => setUpload({ replacing: null })}>
            <Plus /> Ajouter un document
          </Button>
        ) : undefined
      }
    >
      {isLoading ? (
        <Empty>Chargement…</Empty>
      ) : groups.length === 0 ? (
        <Empty>Aucun document.</Empty>
      ) : (
        <ul className="divide-y">
          {groups.map((g) => (
            <DocumentItem
              key={g.current.id}
              group={g}
              typeName={typeOf(g.current.document_type_id)?.name ?? "Document"}
              confidential={isConfidential(g.current)}
              state={expiryState(g.current.expires_on, today, noticeDays)}
              actionsFor={actionsFor}
              canReplace={canWrite(g.current, "create") && !ctx.record.archived_at}
              onReplace={() => setUpload({ replacing: g.current })}
              archiveControl={
                canWrite(g.current, "archive") ? (
                  <ArchiveControl
                    archived={false}
                    itemName={g.current.file_name}
                    pending={archive.isPending}
                    onChange={() => archive.mutate(chainIds(g))}
                  />
                ) : null
              }
            />
          ))}
        </ul>
      )}
      <UploadDialog
        ctx={ctx}
        state={upload}
        onClose={() => setUpload(null)}
        canStd={canCreateStd}
        canConf={canCreateConf}
      />
      <PreviewDialog preview={preview} onClose={() => setPreview(null)} />
    </Section>
  );
}

function DocumentItem({
  group,
  typeName,
  confidential,
  state,
  actionsFor,
  canReplace,
  onReplace,
  archiveControl,
}: {
  group: VersionGroup;
  typeName: string;
  confidential: boolean;
  state: "expired" | "soon" | null;
  actionsFor: (d: DocumentRecord) => React.ReactNode;
  canReplace: boolean;
  onReplace: () => void;
  archiveControl: React.ReactNode;
}) {
  const [showOlder, setShowOlder] = useState(false);
  const d = group.current;
  return (
    <li className="px-5 py-3.5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span className="flex min-w-0 items-start gap-3">
          <FileText className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2 font-medium">
              {typeName}
              <Badge variant="outline">Version {d.version}</Badge>
              {confidential && <Badge variant="secondary">Confidentiel</Badge>}
              {state === "expired" && <Badge variant="destructive">Expiré</Badge>}
              {state === "soon" && <Badge variant="outline">Expire bientôt</Badge>}
            </span>
            <span className="block truncate text-sm text-muted-foreground">
              {d.file_name} · {formatSize(d.size_bytes)}
              {d.document_date && ` · ${formatDate(d.document_date)}`}
              {d.expires_on && ` · expire le ${formatDate(d.expires_on)}`}
            </span>
            {d.description && (
              <span className="block text-sm text-muted-foreground">{d.description}</span>
            )}
          </span>
        </span>
        <span className="flex shrink-0 flex-wrap items-center gap-1">
          {actionsFor(d)}
          {canReplace && (
            <Button variant="ghost" size="sm" onClick={onReplace}>
              <RefreshCw /> Remplacer
            </Button>
          )}
          {group.older.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={showOlder}
              onClick={() => setShowOlder((v) => !v)}
            >
              <History /> {group.older.length} version{group.older.length > 1 ? "s" : ""} précédente
              {group.older.length > 1 ? "s" : ""}
            </Button>
          )}
          {archiveControl}
        </span>
      </div>
      {showOlder && (
        <ul className="mt-3 space-y-2 border-l-2 pl-4">
          {group.older.map((o) => (
            <li
              key={o.id}
              className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="min-w-0 truncate text-muted-foreground">
                <span className="font-medium text-foreground">Version {o.version}</span> ·{" "}
                {o.file_name} · déposée le {formatDate(o.created_at)}
              </span>
              <span className="flex shrink-0 items-center gap-1">{actionsFor(o)}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function PreviewDialog({ preview, onClose }: { preview: Preview; onClose: () => void }) {
  const doc = preview?.doc;
  return (
    <Dialog open={preview !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="truncate">{doc?.file_name ?? "Aperçu"}</DialogTitle>
        </DialogHeader>
        {preview && doc && (
          <div className="max-h-[75vh] overflow-auto bg-muted">
            {doc.mime_type === "application/pdf" ? (
              <iframe
                title={`Aperçu de ${doc.file_name}`}
                src={preview.url}
                className="h-[70vh] w-full border-0 bg-background"
              />
            ) : (
              <img
                src={preview.url}
                alt={`Aperçu de ${doc.file_name}`}
                className="mx-auto max-h-[70vh] object-contain"
              />
            )}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Le lien de l'aperçu expire au bout de 60 secondes ; rouvrez le document si l'affichage
          s'interrompt.
        </p>
      </DialogContent>
    </Dialog>
  );
}

function UploadDialog({
  ctx,
  state,
  onClose,
  canStd,
  canConf,
}: {
  ctx: FicheContext;
  state: { replacing: DocumentRecord | null } | null;
  onClose: () => void;
  canStd: boolean;
  canConf: boolean;
}) {
  const queryClient = useQueryClient();
  const { data: types = [] } = useQuery(documentTypesQuery);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const replacing = state?.replacing ?? null;

  const form = useForm<DocumentForm>({
    resolver: zodResolver(documentSchema),
    defaultValues: { documentTypeId: "", documentDate: "", expiresOn: "", description: "" },
  });
  const { control, register, handleSubmit, reset, setValue, formState } = form;
  // En remplacement, le type est celui du document remplacé (non modifiable).
  const replacedTypeId = replacing?.document_type_id ?? "";
  useEffect(() => {
    if (replacedTypeId) setValue("documentTypeId", replacedTypeId);
  }, [replacedTypeId, setValue]);
  const errors = formState.errors;

  const close = () => {
    onClose();
    reset();
    setFileError(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  async function submit(v: DocumentForm) {
    const file = fileRef.current?.files?.[0] ?? null;
    const problem = validateDocumentFile(file) ?? (file ? await sniffFile(file) : null);
    setFileError(problem);
    if (problem || !file) return;

    setBusy(true);
    // Le fichier est déposé d'abord ; s'il n'est pas référencé ensuite, on tente de le retirer.
    const path = storagePathFor(ctx.id);
    const upload = await supabase.storage
      .from(DOCUMENT_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (upload.error) {
      setBusy(false);
      toast.error("Le dépôt du fichier a échoué. Vérifiez vos droits et votre connexion.");
      return;
    }
    const typeId = replacing ? replacing.document_type_id : v.documentTypeId;
    const { error } = await supabase.from("documents").insert({
      employee_id: ctx.id,
      document_type_id: typeId,
      storage_path: path,
      file_name: file.name,
      mime_type: file.type,
      size_bytes: file.size,
      document_date: v.documentDate || null,
      expires_on: v.expiresOn || null,
      description: v.description.trim() || null,
      ...(replacing
        ? {
            replaces_document_id: replacing.id,
            version: nextVersion(replacing),
            contract_id: replacing.contract_id,
          }
        : {}),
    });
    setBusy(false);
    if (error) {
      await supabase.storage.from(DOCUMENT_BUCKET).remove([path]);
      toast.error(
        (error as { code?: string }).code === "23505" && replacing
          ? "Ce document a déjà été remplacé par une autre version. Actualisez la page."
          : dbErrorMessage(error),
      );
      return;
    }
    toast.success(replacing ? `Version ${nextVersion(replacing)} déposée.` : "Document ajouté.");
    queryClient.invalidateQueries({ queryKey: employeeKey(ctx.id) });
    close();
  }

  const options = types
    .filter((t) => !t.archived_at)
    .map((t) => {
      const confidential = t.confidentiality === "confidential";
      return {
        value: t.id,
        label: confidential ? `${t.name} (confidentiel)` : t.name,
        disabled: confidential ? !canConf : !canStd,
      };
    });
  const replacedTypeName = replacing
    ? (types.find((t) => t.id === replacing.document_type_id)?.name ?? "Document")
    : null;

  return (
    <Dialog open={state !== null} onOpenChange={(o) => !o && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {replacing ? `Remplacer : ${replacedTypeName}` : "Ajouter un document"}
          </DialogTitle>
        </DialogHeader>
        {replacing && (
          <p className="text-sm text-muted-foreground">
            Le fichier actuel (version {replacing.version}) est conservé dans l'historique ; le
            nouveau sera la version {nextVersion(replacing)}.
          </p>
        )}
        <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
          {!replacing && (
            <FormRow label="Type de document" error={errors.documentTypeId?.message}>
              <Controller
                control={control}
                name="documentTypeId"
                render={({ field }) => (
                  <SelectInput
                    value={field.value}
                    onChange={field.onChange}
                    options={options}
                    invalid={!!errors.documentTypeId}
                  />
                )}
              />
            </FormRow>
          )}
          <FormRow
            label="Fichier"
            htmlFor="doc-file"
            error={fileError ?? undefined}
            hint="PDF, JPEG ou PNG — 10 Mo au maximum."
          >
            <Input
              id="doc-file"
              ref={fileRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              aria-invalid={!!fileError}
            />
          </FormRow>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormRow
              label="Date du document"
              htmlFor="doc-date"
              error={errors.documentDate?.message}
            >
              <Input id="doc-date" type="date" {...register("documentDate")} />
            </FormRow>
            <FormRow
              label="Expiration (facultatif)"
              htmlFor="doc-expiry"
              error={errors.expiresOn?.message}
            >
              <Input id="doc-expiry" type="date" {...register("expiresOn")} />
            </FormRow>
          </div>
          <FormRow
            label="Description (facultatif)"
            htmlFor="doc-description"
            error={errors.description?.message}
            hint="500 caractères au plus. Ne saisissez pas d'information sensible."
          >
            <Input
              id="doc-description"
              placeholder="Ex. Avenant de renouvellement signé"
              maxLength={500}
              {...register("description")}
            />
          </FormRow>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={close}>
              Annuler
            </Button>
            <SubmitButton pending={busy}>{replacing ? "Remplacer" : "Déposer"}</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
