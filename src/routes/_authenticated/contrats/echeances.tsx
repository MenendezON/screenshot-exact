import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import {
  FollowupShell,
  FollowupTable,
  matchesFollowup,
  parseFollowupSearch,
  PersonCell,
} from "@/components/contracts/followup";
import { Badge } from "@/components/ui/badge";
import { contractAlertsQuery, remainingLabel, upcomingEnds } from "@/lib/contracts";
import { CONTRACT_LABELS } from "@/lib/employee-schemas";
import { formatDate } from "@/lib/format";
import { orgUnitsQuery, sitesQuery } from "@/lib/referentials";

const TITLE = "Fins de contrat à venir";
const DESCRIPTION =
  "Contrats dont le nombre de jours restants est inférieur ou égal au délai de notification de leur type, du plus urgent au moins urgent.";

export const Route = createFileRoute("/_authenticated/contrats/echeances")({
  validateSearch: parseFollowupSearch,
  head: () => ({
    meta: [
      { title: `${TITLE} — Fabri RH` },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: UpcomingEndsPage,
});

function UpcomingEndsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: alerts, error } = useQuery(contractAlertsQuery);
  const { data: units = [] } = useQuery(orgUnitsQuery);
  const { data: sites = [] } = useQuery(sitesQuery);

  const rows = alerts
    ? upcomingEnds(alerts).filter((r) => matchesFollowup(r, search, units))
    : null;
  const siteName = (id: string | null) => sites.find((s) => s.id === id)?.name ?? "—";
  const unitName = (id: string | null) => units.find((u) => u.id === id)?.name ?? "—";

  return (
    <FollowupShell
      title={TITLE}
      description={DESCRIPTION}
      search={search}
      onSearch={(next) => navigate({ search: next, replace: true })}
      count={rows?.length ?? null}
    >
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          Impossible de charger les contrats.
        </p>
      ) : (
        <FollowupTable
          headers={["Employé", "Contrat", "Fin", "Reste", "Délai de notification", "Site", "Unité"]}
          empty="Aucun contrat n'arrive à échéance dans son délai de notification."
          rows={
            rows?.map((r) => [
              <PersonCell key="p" row={r} />,
              <Badge key="t" variant="secondary">
                {CONTRACT_LABELS[r.contract_type]}
              </Badge>,
              r.reference_date ? formatDate(r.reference_date) : "—",
              <UrgencyBadge key="u" days={r.days_remaining ?? 0} notice={r.notice_days} />,
              r.notice_days !== null ? `${r.notice_days} jours` : "—",
              siteName(r.primary_site_id),
              unitName(r.org_unit_id),
            ]) ?? null
          }
        />
      )}
    </FollowupShell>
  );
}

function UrgencyBadge({ days, notice }: { days: number; notice: number | null }) {
  // Le tiers final du délai est signalé en rouge ; le texte reste lisible sans la couleur.
  const urgent = notice !== null && days <= Math.ceil(notice / 3);
  return <Badge variant={urgent ? "destructive" : "outline"}>{remainingLabel(days)}</Badge>;
}
