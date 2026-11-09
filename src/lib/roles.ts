import { queryOptions, useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];

export const ROLE_LABELS: Record<AppRole, string> = {
  admin_rh: "Administrateur RH",
  gestionnaire_rh: "Gestionnaire RH",
  direction: "Direction (lecture)",
};

export const ROLE_OPTIONS: AppRole[] = ["admin_rh", "gestionnaire_rh", "direction"];

export type CurrentUser = {
  id: string;
  email: string;
  fullName: string;
  role: AppRole | null;
};

export const currentUserQuery = queryOptions({
  queryKey: ["current-user"],
  queryFn: async (): Promise<CurrentUser | null> => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return null;
    const [{ data: profile }, { data: role }] = await Promise.all([
      supabase.from("profiles").select("full_name, email").eq("id", auth.user.id).maybeSingle(),
      supabase.rpc("get_my_role"),
    ]);
    return {
      id: auth.user.id,
      email: profile?.email ?? auth.user.email ?? "",
      fullName: profile?.full_name ?? "",
      role: (role as AppRole | null) ?? null,
    };
  },
  staleTime: 60_000,
});

export function useCurrentUser() {
  return useQuery(currentUserQuery);
}
