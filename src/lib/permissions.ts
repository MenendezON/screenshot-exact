import { queryOptions, useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type Resource =
  | "referentials"
  | "users"
  | "audit"
  | "employees"
  | "sensitive_data"
  | "contracts"
  | "assignments"
  | "compensation"
  | "documents"
  | "confidential_documents"
  | "import_export"
  | "dashboards";
export type Action = "view" | "create" | "edit" | "archive" | "export" | "import";

export type PermissionRow = { resource: string; action: string; scope?: string };

export function hasPermission(
  rows: PermissionRow[] | undefined,
  resource: Resource,
  action: Action,
) {
  return (rows ?? []).some((p) => p.resource === resource && p.action === action);
}

export const myPermissionsQuery = queryOptions({
  queryKey: ["my-permissions"],
  queryFn: async () => {
    const { data, error } = await supabase.rpc("get_my_permissions");
    if (error) throw error;
    return data;
  },
  staleTime: 60_000,
});

/** Permissions de l'utilisateur connecté, telles que la base les applique (RLS). */
export function usePermissions() {
  const query = useQuery(myPermissionsQuery);
  return {
    ready: query.isSuccess,
    can: (resource: Resource, action: Action) => hasPermission(query.data, resource, action),
  };
}
