import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { PageHeader, RequirePermission } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import {
  ACTIONS,
  ACTION_LABELS,
  cellScope,
  lockoutError,
  matrixQuery,
  planCellChange,
  resourcesOf,
  SCOPES,
  SCOPE_HINTS,
  SCOPE_LABELS,
  type Scope,
} from "@/lib/admin";
import { supabase } from "@/integrations/supabase/client";
import { usePermission } from "@/lib/permissions";
import { dbErrorMessage } from "@/lib/referentials";

export const Route = createFileRoute("/_authenticated/permissions")({
  head: () => ({
    meta: [
      { title: "Permissions — Fabri RH" },
      { name: "description", content: "Matrice des rôles, permissions et périmètres." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <RequirePermission resource="users" action="view">
      <MatrixPage />
    </RequirePermission>
  ),
});

const NONE = "none";

function MatrixPage() {
  const queryClient = useQueryClient();
  const canEdit = usePermission("users", "edit");
  const { data, isLoading, error } = useQuery(matrixQuery);

  const change = useMutation({
    mutationFn: async (v: {
      roleId: string;
      roleCode: string;
      resource: string;
      action: string;
      next: Scope | null;
    }) => {
      if (!data) return;
      const locked = lockoutError(v.roleCode, v.resource, v.action, v.next);
      if (locked) throw new Error(locked);
      const plan = planCellChange(data, v.roleId, v.resource, v.action, v.next);
      let res: { error: unknown } = { error: null };
      if (plan.kind === "insert")
        res = await supabase
          .from("role_permissions")
          .insert({ role_id: plan.roleId, permission_id: plan.permissionId, scope: plan.scope });
      else if (plan.kind === "update")
        res = await supabase
          .from("role_permissions")
          .update({ scope: plan.scope })
          .eq("id", plan.id);
      else if (plan.kind === "restore")
        res = await supabase
          .from("role_permissions")
          .update({ scope: plan.scope, archived_at: null })
          .eq("id", plan.id);
      else if (plan.kind === "archive")
        res = await supabase
          .from("role_permissions")
          .update({ archived_at: new Date().toISOString() })
          .eq("id", plan.id);
      if (res.error) throw res.error;
    },
    onSuccess: () => {
      toast.success("Permission mise à jour.");
      queryClient.invalidateQueries({ queryKey: matrixQuery.queryKey });
      queryClient.invalidateQueries({ queryKey: ["my-permissions"] });
    },
    onError: (e: Error) => {
      const known = e instanceof Error && !("code" in e) && e.message;
      toast.error(known ? e.message : dbErrorMessage(e));
    },
  });

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        eyebrow="Administration"
        title="Permissions"
        description="Droits de chaque rôle sur chaque ressource, avec leur périmètre. La base de données applique ces règles : un changement prend effet à la prochaine actualisation des droits de l'utilisateur."
      />
      {isLoading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Chargement…
        </p>
      )}
      {error && <p className="text-sm text-destructive">Impossible de charger la matrice.</p>}
      {data && (
        <>
          <dl className="mb-6 grid gap-2 rounded-lg border bg-card p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {SCOPES.map((s) => (
              <div key={s}>
                <dt className="font-medium">{SCOPE_LABELS[s]}</dt>
                <dd className="text-muted-foreground">{SCOPE_HINTS[s]}</dd>
              </div>
            ))}
          </dl>
          <div className="space-y-8">
            {data.roles.map((role) => (
              <section
                key={role.id}
                className="rounded-lg border bg-card"
                aria-labelledby={`role-${role.id}`}
              >
                <div className="flex flex-wrap items-center gap-2 border-b px-5 py-3">
                  <h2 id={`role-${role.id}`} className="text-base font-semibold">
                    {role.label}
                  </h2>
                  {role.requires_mfa && (
                    <Badge variant="outline">Double authentification exigée</Badge>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th scope="col" className="px-4 py-2 font-medium">
                          Ressource
                        </th>
                        {ACTIONS.map((a) => (
                          <th key={a} scope="col" className="px-2 py-2 font-medium">
                            {ACTION_LABELS[a]}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {resourcesOf(data.permissions).map(({ resource, label }) => (
                        <tr key={resource}>
                          <th scope="row" className="px-4 py-2 text-left font-medium">
                            {label}
                          </th>
                          {ACTIONS.map((a) => {
                            const cell = cellScope(data, role.id, resource, a);
                            const exists = data.permissions.some(
                              (p) => p.resource === resource && p.action === a,
                            );
                            if (!exists)
                              return (
                                <td key={a} className="px-2 py-2 text-muted-foreground">
                                  —
                                </td>
                              );
                            return (
                              <td key={a} className="px-2 py-2">
                                {canEdit ? (
                                  <select
                                    aria-label={`${role.label} : ${ACTION_LABELS[a]} ${label}`}
                                    className="h-8 w-28 rounded-md border bg-background px-1 text-xs"
                                    value={cell?.scope ?? NONE}
                                    disabled={change.isPending}
                                    onChange={(e) =>
                                      change.mutate({
                                        roleId: role.id,
                                        roleCode: role.code,
                                        resource,
                                        action: a,
                                        next:
                                          e.target.value === NONE
                                            ? null
                                            : (e.target.value as Scope),
                                      })
                                    }
                                  >
                                    <option value={NONE}>Aucun</option>
                                    {SCOPES.map((s) => (
                                      <option key={s} value={s}>
                                        {SCOPE_LABELS[s]}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <span className={cell ? "font-medium" : "text-muted-foreground"}>
                                    {cell ? SCOPE_LABELS[cell.scope] : "Aucun"}
                                  </span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
