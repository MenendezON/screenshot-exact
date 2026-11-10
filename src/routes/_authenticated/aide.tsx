import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { MarkdownLite } from "@/lib/markdown-lite";
import guide from "../../../docs/guide-utilisation.md?raw";

export const Route = createFileRoute("/_authenticated/aide")({
  head: () => ({
    meta: [
      { title: "Guide d'utilisation — Fabrimétal Personnel" },
      { name: "description", content: "Guide d'utilisation de l'outil de gestion du personnel." },
    ],
  }),
  component: GuidePage,
});

function GuidePage() {
  return (
    <>
      <PageHeader
        eyebrow="Aide"
        title="Guide d'utilisation"
        description="Accessible à tous les utilisateurs connectés."
        actions={
          <Button variant="outline" onClick={() => window.print()}>
            Imprimer
          </Button>
        }
      />
      <MarkdownLite source={guide.replace(/^# .*\n/, "")} />
    </>
  );
}
