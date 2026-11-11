import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Archive, ArrowLeft, Lock, RotateCcw } from "lucide-react";

import { AssignmentTab } from "@/components/employees/assignment-tab";
import { CompensationTab } from "@/components/employees/compensation-tab";
import { Empty, Section } from "@/components/employees/common";
import { ContractsTab } from "@/components/employees/contracts-tab";
import { DocumentsTab } from "@/components/employees/documents-tab";
import type { FicheContext } from "@/components/employees/fiche-context";
import { HistoryTab } from "@/components/employees/history-tab";
import { IdentityTab } from "@/components/employees/identity-tab";
import { ReviewsTab } from "@/components/employees/reviews-tab";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { CONTRACT_LABELS, type ContractType } from "@/lib/employee-schemas";
import {
  employeeKey,
  employeeQuery,
  fullName,
  initials,
  isFicheTab,
  type FicheTab,
} from "@/lib/employees";
import { formatDate } from "@/lib/format";
import { usePermissions } from "@/lib/permissions";
import { useCurrentUser } from "@/lib/roles";
import { dbErrorMessage, STATUS_LABELS } from "@/lib/referentials";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/_authenticated/employes/$employeeId")({
  validateSearch: (raw: Record<string, unknown>): { onglet?: FicheTab } =>
    isFicheTab(raw["onglet"]) && raw["onglet"] !== "identite" ? { onglet: raw["onglet"] } : {},
  head: () => ({
    meta: [
      { title: "Fiche employé — Fabrimétal Personnel" },
      { name: "description", content: "Fiche détaillée d'un employé." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FichePage,
});

function FichePage() {
  const { employeeId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const { can, ready } = usePermissions();
  const { data: user } = useCurrentUser();
  const [confirmArchive, setConfirmArchive] = useState(false);

  const valid = UUID.test(employeeId);
  const { data, isLoading, error } = useQuery({
    ...employeeQuery(employeeId),
    enabled: valid && ready,
  });

  const archive = useMutation({
    mutationFn: async (archived: boolean) => {
      const { error: err } = await supabase
        .from("employees")
        .update({ archived_at: archived ? new Date().toISOString() : null })
        .eq("id", employeeId);
      if (err) throw err;
      return archived;
    },
    onSuccess: (archived) => {
      toast.success(archived ? "Dossier archivé." : "Dossier restauré.");
      queryClient.invalidateQueries({ queryKey: employeeKey(employeeId) });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      setConfirmArchive(false);
    },
    onError: (e) => toast.error(dbErrorMessage(e)),
  });

  const back = (
    <Link
      to="/employes"
      className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" /> Retour à la liste
    </Link>
  );

  if (!valid || (data && !data.record) || (!isLoading && !data && !error && ready)) {
    return (
      <div className="mx-auto max-w-5xl">
        {back}
        <p className="rounded-lg border bg-card px-5 py-12 text-center text-muted-foreground">
          Dossier introuvable, ou hors de votre périmètre d'accès.
        </p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="mx-auto max-w-5xl">
        {back}
        <p className="rounded-lg border bg-card px-5 py-12 text-center text-destructive">
          Impossible de charger ce dossier.
        </p>
      </div>
    );
  }
  if (isLoading || !data || !data.record) {
    return (
      <div className="mx-auto max-w-5xl">
        {back}
        <p className="py-12 text-center text-muted-foreground">Chargement…</p>
      </div>
    );
  }

  const { record, current, metrics } = data;
  const ctx: FicheContext = {
    id: employeeId,
    record,
    current,
    metrics,
    can,
    userId: user?.id ?? null,
  };
  const tab: FicheTab = search.onglet ?? "identite";
  const canArchive = can("employees", "archive");
  const archived = !!record.archived_at;
  const exited = current?.is_active === false;

  return (
    <div className="mx-auto max-w-5xl">
      {back}
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-4">
          <span
            className="grid size-14 shrink-0 place-items-center rounded-full bg-secondary text-lg font-bold text-secondary-foreground"
            aria-hidden
          >
            {initials(record)}
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold leading-tight">{fullName(record)}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              <span className="font-mono">{record.matricule}</span>
              {current?.job_title_name && ` · ${current.job_title_name}`}
              {current?.org_unit_name && ` · ${current.org_unit_name}`}
              {current?.primary_site_name && ` · ${current.primary_site_name}`}
            </p>
            <p className="mt-2 flex flex-wrap items-center gap-2">
              {archived ? (
                <Badge variant="outline">Archivé</Badge>
              ) : exited ? (
                <Badge variant="secondary">
                  Sorti{current?.exit_date ? ` le ${formatDate(current.exit_date)}` : ""}
                </Badge>
              ) : (
                <Badge>En poste</Badge>
              )}
              {current?.contract_type && (
                <Badge variant="secondary">
                  {CONTRACT_LABELS[current.contract_type as ContractType]}
                </Badge>
              )}
              {current?.status && <Badge variant="outline">{STATUS_LABELS[current.status]}</Badge>}
            </p>
          </div>
        </div>
        {canArchive && (
          <Button
            variant="outline"
            size="sm"
            disabled={archive.isPending}
            onClick={() => (archived ? archive.mutate(false) : setConfirmArchive(true))}
          >
            {archived ? <RotateCcw /> : <Archive />}{" "}
            {archived ? "Restaurer le dossier" : "Archiver le dossier"}
          </Button>
        )}
      </header>

      <Tabs
        value={tab}
        onValueChange={(v) =>
          isFicheTab(v) &&
          navigate({ search: v === "identite" ? {} : { onglet: v }, replace: true })
        }
      >
        <TabsList className="mb-6 h-auto flex-wrap justify-start">
          <TabsTrigger value="identite">Identité</TabsTrigger>
          <TabsTrigger value="poste">Poste</TabsTrigger>
          <TabsTrigger value="contrats">Contrats et sortie</TabsTrigger>
          <TabsTrigger value="remuneration">Rémunération</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          {can("reviews", "view") && (
            <TabsTrigger value="appreciations">Appréciations</TabsTrigger>
          )}
          <TabsTrigger value="historique">Historique</TabsTrigger>
        </TabsList>
        <TabsContent value="identite">
          <IdentityTab ctx={ctx} />
        </TabsContent>
        <TabsContent value="poste">
          <AssignmentTab ctx={ctx} />
        </TabsContent>
        <TabsContent value="contrats">
          <ContractsTab ctx={ctx} />
        </TabsContent>
        <TabsContent value="remuneration">
          {can("compensation", "view") ? (
            <CompensationTab ctx={ctx} />
          ) : (
            <NoAccess title="Rémunération" />
          )}
        </TabsContent>
        <TabsContent value="documents">
          {can("documents", "view") || can("confidential_documents", "view") ? (
            <DocumentsTab ctx={ctx} />
          ) : (
            <NoAccess title="Documents" />
          )}
        </TabsContent>
        <TabsContent value="appreciations">
          {can("reviews", "view") ? (
            <ReviewsTab ctx={ctx} />
          ) : (
            <NoAccess title="Appréciations" />
          )}
        </TabsContent>
        <TabsContent value="historique">
          {can("audit", "view") ? (
            <HistoryTab ctx={ctx} />
          ) : (
            <NoAccess title="Historique du dossier" />
          )}
        </TabsContent>
      </Tabs>

      <AlertDialog open={confirmArchive} onOpenChange={setConfirmArchive}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archiver ce dossier ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le dossier de {fullName(record)} disparaît des listes par défaut et ne peut plus être
              modifié, mais toutes ses données sont conservées. Vous pourrez le restaurer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={() => archive.mutate(true)}>Archiver</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function NoAccess({ title }: { title: string }) {
  return (
    <Section title={title}>
      <Empty>
        <span className="inline-flex items-center gap-2">
          <Lock className="size-4" /> Votre rôle n'a pas accès à cet onglet.
        </span>
      </Empty>
    </Section>
  );
}
