import { createFileRoute } from "@tanstack/react-router";

import { employeeColumns, projectEmployee, type EmployeeSource } from "@/lib/api/keys";
import { authenticate, db, intParam, json, listResponse } from "@/lib/api/server";

/** GET /api/v1/employees?presence=actifs|sortis|tous&site=<nom>&page=1&per_page=100 */
export const Route = createFileRoute("/api/v1/employees/")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const ctx = await authenticate(request, "identite");
        if (ctx instanceof Response) return ctx;
        const url = new URL(request.url);
        const presence = url.searchParams.get("presence") ?? "actifs";
        const page = intParam(url.searchParams.get("page"), 1, 100000);
        const perPage = intParam(url.searchParams.get("per_page"), 100, 1000);
        const site = url.searchParams.get("site");

        const d = await db();
        let q = d
          .from("v_employee_current")
          .select("*", { count: "exact" })
          .is("archived_at", null)
          .order("matricule")
          .range((page - 1) * perPage, page * perPage - 1);
        if (presence === "actifs") q = q.eq("is_active", true);
        else if (presence === "sortis") q = q.eq("is_active", false);
        else if (presence !== "tous") {
          await ctx.log(400);
          return json({ error: "presence doit valoir actifs, sortis ou tous." }, 400);
        }
        if (ctx.client.site_id) q = q.contains("site_ids", [ctx.client.site_id]);
        if (site) q = q.eq("primary_site_name", site);
        const { data, count, error } = await q;
        if (error) {
          await ctx.log(500);
          return json({ error: "Erreur interne." }, 500);
        }
        const rows = (data ?? []) as Array<EmployeeSource & { employee_id: string }>;

        const salaries = new Map<string, number>();
        if (ctx.client.level === "remuneration" && rows.length) {
          const today = new Date().toISOString().slice(0, 10);
          const { data: comp } = await d
            .from("compensation")
            .select("employee_id,net_monthly_salary_fcfa,effective_date")
            .in(
              "employee_id",
              rows.map((r) => r.employee_id),
            )
            .is("archived_at", null)
            .lte("effective_date", today)
            .order("effective_date", { ascending: false });
          for (const c of comp ?? [])
            if (!salaries.has(c.employee_id))
              salaries.set(c.employee_id, Number(c.net_monthly_salary_fcfa));
        }
        const out = rows.map((r) =>
          projectEmployee(r, ctx.client.level, salaries.get(r.employee_id)),
        );
        await ctx.log(200, out.length);
        return listResponse(
          url,
          out,
          { page, per_page: perPage, total: count ?? out.length },
          employeeColumns(ctx.client.level),
        );
      },
    },
  },
});
