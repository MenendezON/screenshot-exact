import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Download, FileText, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import {
  documentSchema,
  safeFileName,
  todayIso,
  validateDocumentFile,
  type DocumentForm,
} from "@/lib/employee-schemas";
import { employeeKey, type DocumentRecord } from "@/lib/employees";
import { formatDate } from "@/lib/format";
import { dbErrorMessage, documentTypesQuery } from "@/lib/referentials";
import { ArchiveControl } from "@/components/settings/shared";
import { Empty, FormRow, Section, SelectInput, SubmitButton, useEmployeeMutation } from "./common";
import type { FicheContext } from "./fiche-context";

const BUCKET = "employee-documents";
const SOON_DAYS = 30;

function expiryState(expiresOn: string | null, today: string): "expired" | "soon" | null {
  if (!expiresOn) return null;
  if (expiresOn < today) return "expired";
  const limit = new Date(`${today}T00:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() + SOON_DAYS);
  return expiresOn <= limit.toISOString().slice(0, 10) ? "soon" : null;
}

const formatSize = (bytes: number | null) => {
  if (!bytes) return "";
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} Ko`
    : `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`;
};

export function DocumentsTab({ ctx }: { ctx: FicheContext }) {
  const [open, setOpen] = useState(false);
  const { data: types = [] } = useQuery(documentTypesQuery);
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

  const typeOf = (id: string) => types.find((t) => t.id === id);

  const archive = useEmployeeMutation(
    ctx.id,
    async ({ id, archived }: { id: string; archived: boolean }) => {
      const { error } = await supabase
        .from("documents")
        .update({ archived_at: archived ? new Date().toISOString() : null })
        .eq("id", id);
      if (error) throw error;
    },
    { success: "Document archivé." },
  );

  async function download(doc: DocumentRecord) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(doc.storage_path, 60, { download: doc.file_name });
    if (error || !data) {
      toast.error("Impossible d'ouvrir ce document. Il a peut-être été retiré du stockage.");
      return;
    }
    // Chaque téléchargement est tracé ; un échec de traçage ne bloque pas l'ouverture.
    if (ctx.userId) {
      await supabase
        .from("document_access_log")
        .insert({ document_id: doc.id, user_id: ctx.userId, action: "download" });
    }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  return (
    <Section
      title="Documents"
      description="Les documents confidentiels ne sont visibles que des rôles habilités. Chaque téléchargement est tracé."
      actions={
        canCreate ? (
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus /> Ajouter un document
          </Button>
        ) : undefined
      }
    >
      {isLoading ? (
        <Empty>Chargement…</Empty>
      ) : rows.length === 0 ? (
        <Empty>Aucun document.</Empty>
      ) : (
        <ul className="divide-y">
          {rows.map((d) => {
            const type = typeOf(d.document_type_id);
            const state = expiryState(d.expires_on, today);
            const canArchive =
              type?.confidentiality === "confidential"
                ? ctx.can("confidential_documents", "archive")
                : ctx.can("documents", "archive");
            return (
              <li
                key={d.id}
                className="flex flex-col gap-2 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="flex min-w-0 items-start gap-3">
                  <FileText className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2 font-medium">
                      {type?.name ?? "Document"}
                      {type?.confidentiality === "confidential" && (
                        <Badge variant="secondary">Confidentiel</Badge>
                      )}
                      {state === "expired" && <Badge variant="destructive">Expiré</Badge>}
                      {state === "soon" && <Badge variant="outline">Expire bientôt</Badge>}
                    </span>
                    <span className="block truncate text-sm text-muted-foreground">
                      {d.file_name} · {formatSize(d.size_bytes)}
                      {d.document_date && ` · ${formatDate(d.document_date)}`}
                      {d.expires_on && ` · expire le ${formatDate(d.expires_on)}`}
                    </span>
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => download(d)}>
                    <Download /> Télécharger
                  </Button>
                  {canArchive && (
                    <ArchiveControl
                      archived={false}
                      itemName={d.file_name}
                      pending={archive.isPending}
                      onChange={(archived) => archive.mutate({ id: d.id, archived })}
                    />
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <UploadDialog
        ctx={ctx}
        open={open}
        onOpenChange={setOpen}
        canStd={canCreateStd}
        canConf={canCreateConf}
      />
    </Section>
  );
}

function UploadDialog({
  ctx,
  open,
  onOpenChange,
  canStd,
  canConf,
}: {
  ctx: FicheContext;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  canStd: boolean;
  canConf: boolean;
}) {
  const queryClient = useQueryClient();
  const { data: types = [] } = useQuery(documentTypesQuery);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const form = useForm<DocumentForm>({
    resolver: zodResolver(documentSchema),
    defaultValues: { documentTypeId: "", documentDate: "", expiresOn: "" },
  });
  const { control, register, handleSubmit, reset, formState } = form;
  const errors = formState.errors;

  const close = () => {
    onOpenChange(false);
    reset();
    setFileError(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  async function submit(v: DocumentForm) {
    const file = fileRef.current?.files?.[0] ?? null;
    const problem = validateDocumentFile(file);
    setFileError(problem);
    if (problem || !file) return;

    setBusy(true);
    // Le fichier est déposé d'abord ; s'il n'est pas référencé ensuite, on le retire pour ne pas laisser d'orphelin.
    const path = `${ctx.id}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
    const upload = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (upload.error) {
      setBusy(false);
      toast.error("Le dépôt du fichier a échoué. Vérifiez vos droits et votre connexion.");
      return;
    }
    const { error } = await supabase.from("documents").insert({
      employee_id: ctx.id,
      document_type_id: v.documentTypeId,
      storage_path: path,
      file_name: file.name,
      mime_type: file.type,
      size_bytes: file.size,
      document_date: v.documentDate || null,
      expires_on: v.expiresOn || null,
    });
    setBusy(false);
    if (error) {
      await supabase.storage.from(BUCKET).remove([path]);
      toast.error(dbErrorMessage(error));
      return;
    }
    toast.success("Document ajouté.");
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

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajouter un document</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
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
          <FormRow
            label="Fichier"
            htmlFor="doc-file"
            error={fileError ?? undefined}
            hint="PDF, JPEG, PNG ou Word — 10 Mo au maximum."
          >
            <Input
              id="doc-file"
              ref={fileRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.docx"
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
            <FormRow label="Expiration" htmlFor="doc-expiry" error={errors.expiresOn?.message}>
              <Input id="doc-expiry" type="date" {...register("expiresOn")} />
            </FormRow>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={close}>
              Annuler
            </Button>
            <SubmitButton pending={busy}>Déposer</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
