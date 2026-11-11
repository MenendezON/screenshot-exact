import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { PageHeader } from "@/components/app-shell";
import { LoadingState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { MarkdownLite } from "@/lib/markdown-lite";
import { useCurrentUser } from "@/lib/roles";
import apiDoc from "../../../docs/api.md?raw";
import guide from "../../../docs/guide-utilisation.md?raw";
import recette from "../../../docs/recette.md?raw";
import readme from "../../../README.md?raw";

export const Route = createFileRoute("/_authenticated/documentation")({
  head: () => ({
    meta: [
      { title: "Documentation — Fabri RH" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

const DOCS = [
  { id: "readme", label: "README (installation, sauvegarde)", file: "README.md", text: readme },
  { id: "api", label: "API de lecture", file: "docs/api.md", text: apiDoc },
  { id: "recette", label: "Checklist de recette", file: "docs/recette.md", text: recette },
  { id: "guide", label: "Guide d'utilisation", file: "docs/guide-utilisation.md", text: guide },
];

function Page() {
  const { data: user, isLoading } = useCurrentUser();
  const [id, setId] = useState("readme");
  if (isLoading) return <LoadingState />;
  if (user?.role !== "admin_it")
    return (
      <div className="mx-auto max-w-md rounded-lg border bg-card p-8 text-center">
        <h1 className="text-xl font-bold">Accès réservé</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          La documentation technique est réservée à l'administrateur IT.
        </p>
      </div>
    );
  const doc = DOCS.find((d) => d.id === id)!;
  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Documentation"
        description="Documents du dossier docs/ du projet, pour l'administrateur IT."
      />
      <div role="tablist" aria-label="Documents" className="mb-4 flex flex-wrap gap-2">
        {DOCS.map((d) => (
          <Button
            key={d.id}
            role="tab"
            aria-selected={d.id === id}
            variant={d.id === id ? "default" : "outline"}
            size="sm"
            onClick={() => setId(d.id)}
          >
            {d.label}
          </Button>
        ))}
      </div>
      <p className="mb-2 text-xs text-muted-foreground">
        Fichier source : <code>{doc.file}</code>
      </p>
      <MarkdownLite source={doc.text.replace(/^# .*\n/, "")} />
    </>
  );
}
