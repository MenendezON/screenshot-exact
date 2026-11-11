import { useEffect } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { BrandName } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Fabri RH — Gestion du personnel Fabrimétal Sénégal" },
      {
        name: "description",
        content:
          "Outil interne de suivi du personnel de Fabrimétal Sénégal pour les sites de Sébikotane, Sindia et Dakar.",
      },
      { property: "og:title", content: "Fabri RH — Gestion du personnel Fabrimétal Sénégal" },
      {
        property: "og:description",
        content:
          "Outil interne de suivi du personnel de Fabrimétal Sénégal pour les sites de Sébikotane, Sindia et Dakar.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/accueil", replace: true });
    });
  }, [navigate]);

  return (
    <div className="flex min-h-screen flex-col bg-forge text-sidebar-foreground">
      <header className="px-6 py-6 sm:px-12">
        <BrandName inverted />
      </header>
      <main className="flex flex-1 items-center px-6 pb-16 sm:px-12">
        <div className="max-w-2xl">
          <p className="eyebrow text-sidebar-muted">Outil interne · ressources humaines</p>
          <h1 className="mt-5 text-4xl font-extrabold leading-[1.02] sm:text-6xl">
            Le suivi du personnel,
            <br />
            sans le classeur.
          </h1>
          <p className="mt-6 max-w-lg text-lg text-sidebar-muted">
            Sébikotane, Sindia et Dakar réunis dans un seul outil, accessible depuis le bureau ou le
            téléphone.
          </p>
          <Button asChild variant="signal" size="lg" className="mt-10">
            <Link to="/auth">
              Se connecter <ArrowRight />
            </Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
