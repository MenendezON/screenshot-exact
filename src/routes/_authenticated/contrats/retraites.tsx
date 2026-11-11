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
import { remainingLabel, retirementQuery } from "@/lib/contracts";
import { todayIso } from "@/lib/employee-schemas";
import { formatDate } from "@/lib/format";
import { orgUnitsQuery, sitesQuery } from "@/lib/referentials";
import { settingsQuery } from "@/lib/settings";

const TITLE = "Suivi des retraites";
const DESCRIPTION =
  "Employés en poste triés par temps restant avant le départ à la retraite. Une alerte s'affiche dans le délai de notification d'un CDI.";

export const Route = createFileRoute("/_authenticated/contrats/retraites")({
  validateSearch: parseFollowupSearch,
  head: () => ({
    meta: [
      { title: `${TITLE} — Fabri RH` },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RetirementPage,
});

function RetirementPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const today = todayIso();
  const { data: settings } = useQuery(settingsQuery);
  const noticeRaw = settings?.find((s) => s.key === "notice_days_cdi")?.value;
  const noticeDays = typeof noticeRaw === "number" ? noticeRaw : 60;
  const { data: all, error } = useQuery({
    ...retirementQuery(today, noticeDays),
    enabled: settings !== undefined,
  });
  const { data: units = [] } = useQuery(orgUnitsQuery);
  const { data: sites = [] } = useQuery(sitesQuery);

  const rows = all?.filter((r) => matchesFollowup(r, search, units)) ?? null;
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
          Impossible de calculer les départs à la retraite.
        </p>
      ) : (
        <FollowupTable
          headers={["Employé", "Naissance", "Retraite le", "Temps restant", "Site", "Unité"]}
          empty="Aucun employé en poste avec une date de naissance renseignée."
          rows={
            rows?.map((r) => [
              <PersonCell key="p" row={r} />,
              formatDate(r.birth_date),
              formatDate(r.retirement_date),
              <span key="d" className="flex flex-wrap items-center gap-2">
                {remainingLabel(r.days_remaining)}
                {r.alert && (
                  <Badge variant="destructive">
                    {r.days_remaining < 0 ? "Âge dépassé" : `Moins de ${noticeDays} jours`}
                  </Badge>
                )}
              </span>,
              siteName(r.primary_site_id),
              unitName(r.org_unit_id),
            ]) ?? null
          }
        />
      )}
    </FollowupShell>
  );
}
