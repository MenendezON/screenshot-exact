import { createFileRoute } from "@tanstack/react-router";

import { PageHeader, RequireRole } from "@/components/app-shell";
import { BusinessSettingsPanel } from "@/components/settings/business-settings-panel";
import { CategoriesPanel } from "@/components/settings/categories-panel";
import { DocumentTypesPanel } from "@/components/settings/document-types-panel";
import { ExitReasonsPanel } from "@/components/settings/exit-reasons-panel";
import { HistoryPanel } from "@/components/settings/history-panel";
import { JobTitlesPanel } from "@/components/settings/job-titles-panel";
import { NotificationRecipientsPanel } from "@/components/settings/notification-recipients-panel";
import { OrgTreePanel } from "@/components/settings/org-tree-panel";
import { SitesPanel } from "@/components/settings/sites-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePermissions } from "@/lib/permissions";
import type { AppRole } from "@/lib/roles";

const SETTINGS_ROLES: AppRole[] = ["admin_it", "drh"];

const DESCRIPTION =
  "Sites, organisation, postes, catégories, motifs de sortie, types de documents et règles de gestion.";

export const Route = createFileRoute("/_authenticated/parametres")({
  head: () => ({
    meta: [
      { title: "Paramètres RH — Fabrimétal Personnel" },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: "Paramètres RH — Fabrimétal Personnel" },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <RequireRole
      roles={SETTINGS_ROLES}
      message="Cette page est réservée à l'administrateur IT et au DRH."
    >
      <SettingsContent />
    </RequireRole>
  );
}

function SettingsContent() {
  const { can } = usePermissions();

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader eyebrow="Référentiels" title="Paramètres RH" description={DESCRIPTION} />
      <Tabs defaultValue="sites">
        <TabsList className="mb-6 h-auto flex-wrap justify-start">
          <TabsTrigger value="sites">Sites</TabsTrigger>
          <TabsTrigger value="organisation">Organisation</TabsTrigger>
          <TabsTrigger value="postes">Postes</TabsTrigger>
          <TabsTrigger value="categories">Catégories</TabsTrigger>
          <TabsTrigger value="motifs">Motifs de sortie</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="regles">Règles métier</TabsTrigger>
          <TabsTrigger value="alertes">Alertes</TabsTrigger>
          {can("audit", "view") && <TabsTrigger value="historique">Historique</TabsTrigger>}
        </TabsList>
        <TabsContent value="sites">
          <SitesPanel />
        </TabsContent>
        <TabsContent value="organisation">
          <OrgTreePanel />
        </TabsContent>
        <TabsContent value="postes">
          <JobTitlesPanel />
        </TabsContent>
        <TabsContent value="categories">
          <CategoriesPanel />
        </TabsContent>
        <TabsContent value="motifs">
          <ExitReasonsPanel />
        </TabsContent>
        <TabsContent value="documents">
          <DocumentTypesPanel />
        </TabsContent>
        <TabsContent value="regles">
          <BusinessSettingsPanel />
        </TabsContent>
        <TabsContent value="alertes">
          <NotificationRecipientsPanel />
        </TabsContent>
        {can("audit", "view") && (
          <TabsContent value="historique">
            <HistoryPanel />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
