import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  History,
  Home,
  Loader2,
  LogOut,
  Menu,
  Network,
  SlidersHorizontal,
  Users,
  type LucideIcon,
} from "lucide-react";

import { BrandName } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useSignOut } from "@/lib/auth-context";
import { usePermissions, type Action, type Resource } from "@/lib/permissions";
import { ROLE_LABELS, useCurrentUser, type AppRole } from "@/lib/roles";

type NavItem = {
  to: "/accueil" | "/employes" | "/organigramme" | "/parametres" | "/utilisateurs" | "/journal";
  label: string;
  icon: LucideIcon;
  roles?: AppRole[];
  /** Visible seulement si la base accorde cette permission au rôle de l'utilisateur. */
  permission?: [Resource, Action];
};

const NAV: NavItem[] = [
  { to: "/accueil", label: "Accueil", icon: Home },
  { to: "/employes", label: "Employés", icon: Users, permission: ["employees", "view"] },
  { to: "/organigramme", label: "Organigramme", icon: Network, permission: ["employees", "view"] },
  { to: "/parametres", label: "Paramètres RH", icon: SlidersHorizontal, roles: ["admin_it", "drh"] },
  { to: "/utilisateurs", label: "Utilisateurs", icon: Users, roles: ["admin_rh"] },
  { to: "/journal", label: "Journal d'audit", icon: History, roles: ["admin_rh"] },
];

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { data: user } = useCurrentUser();
  const signOut = useSignOut();
  const { can } = usePermissions();
  const items = NAV.filter(
    (item) =>
      (!item.roles || (user?.role && item.roles.includes(user.role))) && (!item.permission || can(...item.permission)),
  );

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="border-b border-sidebar-border px-5 py-5">
        <BrandName inverted />
      </div>
      <nav className="flex-1 space-y-1 px-3 py-5" aria-label="Navigation principale">
        {items.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            onClick={onNavigate}
            className="group flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            activeProps={{
              className:
                "bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_3px_0_0_var(--sidebar-primary)]",
            }}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        ))}
      </nav>
      <div className="border-t border-sidebar-border p-4">
        {user && (
          <div className="mb-3 px-1">
            <p className="truncate text-sm font-medium">{user.fullName || user.email}</p>
            <p className="eyebrow mt-1 text-sidebar-muted">
              {user.role ? ROLE_LABELS[user.role] : "Sans rôle"}
            </p>
          </div>
        )}
        <button
          type="button"
          onClick={signOut}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <LogOut className="size-4" /> Se déconnecter
        </button>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { data: user, isLoading } = useCurrentUser();
  const signOut = useSignOut();

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[16rem_1fr]">
      <aside className="sticky top-0 hidden h-screen lg:block">
        <SidebarContent />
      </aside>

      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-sidebar px-4 py-3 text-sidebar-foreground lg:hidden">
          <BrandName inverted />
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                aria-label="Ouvrir le menu"
                className="rounded-md p-2 hover:bg-sidebar-accent"
              >
                <Menu className="size-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 border-sidebar-border p-0">
              <SheetTitle className="sr-only">Menu</SheetTitle>
              <SidebarContent onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-8 sm:py-10">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Chargement…
            </div>
          ) : !user?.role ? (
            <div className="mx-auto max-w-md rounded-lg border bg-card p-8 text-center">
              <h1 className="text-xl font-bold">Accès non attribué</h1>
              <p className="mt-3 text-sm text-muted-foreground">
                Votre compte n'a pas de rôle actif. Contactez l'administrateur RH pour obtenir un
                accès.
              </p>
              <Button variant="outline" className="mt-6" onClick={signOut}>
                <LogOut /> Se déconnecter
              </Button>
            </div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="eyebrow text-muted-foreground">{eyebrow}</p>}
        <h1 className="mt-1 text-2xl font-bold sm:text-3xl">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

export function RequireRole({
  roles,
  message = "Cette page est réservée à l'administrateur RH.",
  children,
}: {
  roles: AppRole[];
  message?: string;
  children: ReactNode;
}) {
  const { data: user } = useCurrentUser();
  if (!user?.role || !roles.includes(user.role)) {
    return (
      <div className="mx-auto max-w-md rounded-lg border bg-card p-8 text-center">
        <h1 className="text-xl font-bold">Accès réservé</h1>
        <p className="mt-3 text-sm text-muted-foreground">{message}</p>
      </div>
    );
  }
  return <>{children}</>;
}
