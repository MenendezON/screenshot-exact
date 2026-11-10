import { createFileRoute } from "@tanstack/react-router";

import { projectEmployee, type EmployeeSource } from "@/lib/api/keys";
import { authenticate, db, json } from "@/lib/api/server";

/** GET /api/v1/employees/{matricule} */
export const Route = createFileRoute("/api/v1/employees/$matricule")({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: { matricule: string } }) => {
        const ctx = await authenticate(request, "identite");
        if (ctx instanceof Response) return ctx;
        const d = await db();
        let q = d
          .from("v_employee_current")
          .select("*")
          .is("archived_at", null)
          .eq("matricule", params.matricule);
        if (ctx.client.site_id) q = q.contains("site_ids", [ctx.client.site_id]);
        const { data } = await q.maybeSingle();
        if (!data) {
          await ctx.log(404);
          return json({ error: "Employé introuvable." }, 404);
        }
        let salary: number | null = null;
        if (ctx.client.level === "remuneration") {
          const { data: c } = await d
            .from("compensation")
            .select("net_monthly_salary_fcfa")
            .eq("employee_id", data.employee_id)
            .is("archived_at", null)
            .lte("effective_date", new Date().toISOString().slice(0, 10))
            .order("effective_date", { ascending: false })
            .limit(1)
            .maybeSingle();
          salary = c ? Number(c.net_monthly_salary_fcfa) : null;
        }
        await ctx.log(200, 1);
        return json({ data: projectEmployee(data as EmployeeSource, ctx.client.level, salary) });
      },
    },
  },
});
