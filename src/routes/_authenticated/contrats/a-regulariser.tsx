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
import { contractAlertsQuery, toRegularize } from "@/lib/contracts";
import { CONTRACT_LABELS } from "@/lib/employee-schemas";
import { formatDate } from "@/lib/format";
import { orgUnitsQuery, sitesQuery } from "@/lib/referentials";

const TITLE = "À régulariser";
const DESCRIPTION =
  "Contrats à durée déterminée échus, sans renouvellement ni sortie enregistrés. Ouvrez la fiche pour renouveler le contrat, le convertir en CDI ou enregistrer la sortie.";

export const Route = createFileRoute("/_authenticated/contrats/a-regulariser")({
  validateSearch: parseFollowupSearch,
  head: () => ({
    meta: [
      { title: `${TITLE} — Fabri RH` },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ToRegularizePage,
});

function ToRegularizePage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: alerts, error } = useQuery(contractAlertsQuery);
  const { data: units = [] } = useQuery(orgUnitsQuery);
  const { data: sites = [] } = useQuery(sitesQuery);

  const rows = alerts
    ? toRegularize(alerts).filter((r) => matchesFollowup(r, search, units))
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
          headers={["Employé", "Contrat", "Échu le", "Retard", "Site", "Unité"]}
          empty="Aucun contrat à régulariser."
          rows={
            rows?.map((r) => [
              <PersonCell key="p" row={r} />,
              <Badge key="t" variant="secondary">
                {CONTRACT_LABELS[r.contract_type]}
              </Badge>,
              r.contract_end ? formatDate(r.contract_end) : "—",
              <Badge key="d" variant="destructive">
                {Math.abs(r.days_remaining ?? 0)} jour
                {Math.abs(r.days_remaining ?? 0) > 1 ? "s" : ""}
              </Badge>,
              siteName(r.primary_site_id),
              unitName(r.org_unit_id),
            ]) ?? null
          }
        />
      )}
    </FollowupShell>
  );
}
