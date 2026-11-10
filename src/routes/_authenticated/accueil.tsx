import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, History, SlidersHorizontal, Users } from "lucide-react";

import { PageHeader } from "@/components/app-shell";
import { usePermission } from "@/lib/permissions";
import { ROLE_LABELS, useCurrentUser } from "@/lib/roles";
import { settingsQuery } from "@/lib/settings";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/accueil")({
  head: () => ({
    meta: [
      { title: "Accueil — Fabrimétal Personnel" },
      { name: "description", content: "Tableau d'accueil de l'outil de gestion du personnel." },
      { property: "og:title", content: "Accueil — Fabrimétal Personnel" },
      { property: "og:description", content: "Tableau d'accueil de l'outil de gestion du personnel." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const { data: user } = useCurrentUser();
  const { data: settings } = useQuery(settingsQuery);
  const isAdmin = usePermission("users", "view");
  const firstName = user?.fullName?.split(" ")[0];

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow={formatDate(new Date())}
        title={firstName ? `Bonjour ${firstName}` : "Bonjour"}
        description={user?.role ? `Connecté en tant que ${ROLE_LABELS[user.role]}.` : ""}
      />

      <section className="rounded-lg border bg-card">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-base font-semibold">Paramètres métier en vigueur</h2>
          <Link to="/parametres" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
            Détails <ArrowRight className="size-4" />
          </Link>
        </div>
        <dl className="grid grid-cols-2 divide-x divide-y sm:grid-cols-3">
          {(settings ?? []).map((s) => (
            <div key={s.id} className="px-5 py-4">
              <dt className="text-xs text-muted-foreground">{s.label}</dt>
              <dd className="mt-1 font-display text-2xl font-bold">
                {s.value} <span className="text-sm font-medium text-muted-foreground">{s.unit}</span>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {isAdmin && (
        <section className="mt-6 grid gap-4 sm:grid-cols-3">
          <QuickLink to="/utilisateurs" icon={Users} title="Utilisateurs" text="Inviter et attribuer les rôles" />
          <QuickLink to="/parametres" icon={SlidersHorizontal} title="Paramètres" text="Ajuster les règles métier" />
          <QuickLink to="/journal" icon={History} title="Journal d'audit" text="Tracer chaque modification" />
        </section>
      )}
    </div>
  );
}

function QuickLink({
  to,
  icon: Icon,
  title,
  text,
}: {
  to: "/utilisateurs" | "/parametres" | "/journal";
  icon: typeof Users;
  title: string;
  text: string;
}) {
  return (
    <Link
      to={to}
      className="group rounded-lg border bg-card p-5 transition-colors hover:border-primary"
    >
      <Icon className="size-5 text-signal" />
      <p className="mt-3 font-semibold">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{text}</p>
    </Link>
  );
}
