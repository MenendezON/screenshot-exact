import { createFileRoute } from "@tanstack/react-router";

import { authenticate, db, intParam, json } from "@/lib/api/server";

/** GET /api/v1/contracts?matricule=F0001&page=1&per_page=100 — niveau 2 (contrats) minimum. */
export const Route = createFileRoute("/api/v1/contracts")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const ctx = await authenticate(request, "contrats");
        if (ctx instanceof Response) return ctx;
        const url = new URL(request.url);
        const page = intParam(url.searchParams.get("page"), 1, 100000);
        const perPage = intParam(url.searchParams.get("per_page"), 100, 200);
        const matricule = url.searchParams.get("matricule");

        const d = await db();
        let q = d
          .from("contracts")
          .select(
            "type,start_date,end_date,terminated_on,duration_months,employees!inner(matricule,id)",
            { count: "exact" },
          )
          .is("archived_at", null)
          .order("start_date", { ascending: false })
          .range((page - 1) * perPage, page * perPage - 1);
        if (matricule) q = q.eq("employees.matricule", matricule);
        if (ctx.client.site_id) {
          const { data: ids } = await d
            .from("employee_sites")
            .select("employee_id")
            .eq("site_id", ctx.client.site_id)
            .is("archived_at", null);
          q = q.in(
            "employee_id",
            (ids ?? []).map((r: { employee_id: string }) => r.employee_id),
          );
        }
        const { data, count, error } = await q;
        if (error) {
          await ctx.log(500);
          return json({ error: "Erreur interne." }, 500);
        }
        const out = (data ?? []).map((c: Record<string, any>) => ({
          matricule: c["employees"]?.matricule,
          type: c["type"],
          debut: c["start_date"],
          fin_prevue: c["end_date"],
          fin_effective: c["terminated_on"],
          duree_mois: c["duration_months"],
        }));
        await ctx.log(200, out.length);
        return json({ data: out, page, per_page: perPage, total: count ?? out.length });
      },
    },
  },
});
