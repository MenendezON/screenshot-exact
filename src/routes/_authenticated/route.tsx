import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { needsMfaStep } from "@/lib/mfa";

export const Route = createFileRoute("/_authenticated")({
  // La session vit dans le navigateur : la vérification se fait côté client uniquement.
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/auth", search: { redirect: location.href } });
    }
    // Les rôles RH exigent une session à deux facteurs : sans elle, la base ne renvoie aucune donnée.
    if (await needsMfaStep()) {
      throw redirect({ to: "/mfa", search: { redirect: location.href } });
    }
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
