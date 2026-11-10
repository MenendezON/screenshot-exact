import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { KeyRound, Loader2, Pencil, ShieldOff, UserPlus } from "lucide-react";

import { PageHeader, RequirePermission } from "@/components/app-shell";
import { FormRow } from "@/components/employees/common";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { adminUsersQuery, diffAssignments, userIsActive, type AdminUser } from "@/lib/admin";
import { formatDate } from "@/lib/format";
import { usePermission } from "@/lib/permissions";
import { dbErrorMessage, orgUnitsQuery, sitesQuery } from "@/lib/referentials";
import { ROLE_LABELS, ROLE_OPTIONS, useCurrentUser, type AppRole } from "@/lib/roles";
import { inviteUser, resetUserMfa, sendPasswordReset, setUserActive } from "@/lib/users.functions";

export const Route = createFileRoute("/_authenticated/utilisateurs")({
  head: () => ({
    meta: [
      { title: "Utilisateurs — Fabrimétal Personnel" },
      { name: "description", content: "Comptes, rôles, périmètres et accès des utilisateurs." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <RequirePermission resource="users" action="view">
      <UsersContent />
    </RequirePermission>
  ),
});

function UsersContent() {
  const canCreate = usePermission("users", "create");
  const { data: users, isLoading, error } = useQuery(adminUsersQuery);
  const [creating, setCreating] = useState(false);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow="Administration"
        title="Utilisateurs"
        description="Seules les personnes invitées peuvent se connecter. Un compte désactivé conserve son historique."
        actions={
          canCreate ? (
            <Button onClick={() => setCreating(true)}>
              <UserPlus /> Créer un compte
            </Button>
          ) : undefined
        }
      />
      {isLoading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Chargement…
        </p>
      )}
      {error && <p className="text-sm text-destructive">Impossible de charger les utilisateurs.</p>}
      {users && (
        <ul className="divide-y rounded-lg border bg-card">
          {users.map((u) => (
            <UserItem key={u.id} user={u} />
          ))}
        </ul>
      )}
      <UserDialog mode="create" open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

type Confirm = { kind: "toggle" | "mfa" | "password"; user: AdminUser } | null;

function UserItem({ user }: { user: AdminUser }) {
  const queryClient = useQueryClient();
  const { data: me } = useCurrentUser();
  const canEdit = usePermission("users", "edit");
  const { data: sites = [] } = useQuery(sitesQuery);
  const { data: units = [] } = useQuery(orgUnitsQuery);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const toggle = useServerFn(setUserActive);
  const mfa = useServerFn(resetUserMfa);
  const reset = useServerFn(sendPasswordReset);
  const isMe = me?.id === user.id;
  const active = userIsActive(user);

  const run = useMutation({
    mutationFn: async (c: NonNullable<Confirm>) => {
      if (c.kind === "toggle")
        await toggle({ data: { userId: c.user.id, active: !userIsActive(c.user) } });
      else if (c.kind === "mfa") await mfa({ data: { userId: c.user.id } });
      else
        await reset({
          data: { userId: c.user.id, redirectTo: `${window.location.origin}/reset-password` },
        });
    },
    onSuccess: (_d, c) => {
      toast.success(
        c.kind === "toggle"
          ? "Accès mis à jour."
          : c.kind === "mfa"
            ? "Double authentification réinitialisée : un nouveau QR code sera demandé à la prochaine connexion."
            : "E-mail de réinitialisation envoyé.",
      );
      queryClient.invalidateQueries({ queryKey: adminUsersQuery.queryKey });
      setConfirm(null);
    },
    onError: (e: Error) => {
      toast.error(e.message || "L'opération a échoué.");
      setConfirm(null);
    },
  });

  const activeRoles = user.roles.filter((r) => r.archived_at === null);
  const scopeNames = user.scopes
    .filter((s) => s.archived_at === null)
    .map((s) =>
      s.site_id
        ? (sites.find((x) => x.id === s.site_id)?.name ?? "Site")
        : (units.find((x) => x.id === s.org_unit_id)?.name ?? "Unité"),
    );

  return (
    <li className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 font-medium">
          <span className="truncate">{user.fullName || user.email}</span>
          {isMe && <Badge variant="secondary">Vous</Badge>}
          {!active && (
            <Badge variant="outline">{user.roles.length ? "Désactivé" : "Sans rôle"}</Badge>
          )}
        </p>
        <p className="truncate text-sm text-muted-foreground">{user.email}</p>
        <p className="mt-1 flex flex-wrap gap-1">
          {activeRoles.map((r) => (
            <Badge key={r.id} variant="secondary">
              {ROLE_LABELS[r.role]}
            </Badge>
          ))}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {scopeNames.length
            ? `Périmètre : ${scopeNames.join(", ")}`
            : "Aucun site ni unité attribué"}{" "}
          · Créé le {formatDate(user.createdAt)}
        </p>
      </div>
      {canEdit && (
        <div className="flex shrink-0 flex-wrap items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil /> Modifier
          </Button>
          {!isMe && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirm({ kind: "password", user })}
              >
                <KeyRound /> Mot de passe
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirm({ kind: "mfa", user })}>
                <ShieldOff /> Double facteur
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirm({ kind: "toggle", user })}
              >
                {active ? "Désactiver" : "Réactiver"}
              </Button>
            </>
          )}
        </div>
      )}
      <UserDialog mode="edit" user={user} open={editing} onClose={() => setEditing(false)} />
      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === "toggle"
                ? active
                  ? "Désactiver ce compte ?"
                  : "Réactiver ce compte ?"
                : confirm?.kind === "mfa"
                  ? "Réinitialiser la double authentification ?"
                  : "Envoyer un lien de réinitialisation ?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === "toggle" && active
                ? `${user.email} ne pourra plus se connecter. Ses rôles sont archivés et son historique est conservé.`
                : confirm?.kind === "toggle"
                  ? `${user.email} pourra de nouveau se connecter avec ses rôles précédents.`
                  : confirm?.kind === "mfa"
                    ? `Les appareils enregistrés de ${user.email} sont supprimés. Il devra scanner un nouveau QR code à sa prochaine connexion. L'opération est tracée.`
                    : `Un e-mail est envoyé à ${user.email} pour choisir un nouveau mot de passe.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={run.isPending}
              onClick={() => confirm && run.mutate(confirm)}
            >
              Confirmer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

function CheckList({
  legend,
  items,
  selected,
  onToggle,
  idPrefix,
}: {
  legend: string;
  items: { value: string; label: string }[];
  selected: Set<string>;
  onToggle: (value: string) => void;
  idPrefix: string;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun élément disponible.</p>
      ) : (
        <div className="grid max-h-44 gap-2 overflow-y-auto sm:grid-cols-2">
          {items.map((i) => (
            <label
              key={i.value}
              htmlFor={`${idPrefix}-${i.value}`}
              className="flex items-center gap-2 text-sm"
            >
              <Checkbox
                id={`${idPrefix}-${i.value}`}
                checked={selected.has(i.value)}
                onCheckedChange={() => onToggle(i.value)}
              />
              {i.label}
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}

const flip = (set: Set<string>, v: string) => {
  const next = new Set(set);
  if (next.has(v)) next.delete(v);
  else next.add(v);
  return next;
};

function UserDialog({
  mode,
  user,
  open,
  onClose,
}: {
  mode: "create" | "edit";
  user?: AdminUser;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const invite = useServerFn(inviteUser);
  const { data: sites = [] } = useQuery(sitesQuery);
  const { data: units = [] } = useQuery(orgUnitsQuery);
  const initial = (u?: AdminUser) => ({
    roles: new Set(u?.roles.filter((r) => !r.archived_at).map((r) => r.role as string) ?? []),
    sites: new Set(
      u?.scopes.filter((s) => !s.archived_at && s.site_id).map((s) => s.site_id!) ?? [],
    ),
    units: new Set(
      u?.scopes.filter((s) => !s.archived_at && s.org_unit_id).map((s) => s.org_unit_id!) ?? [],
    ),
  });
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [state, setState] = useState(initial(user));
  const [errors, setErrors] = useState<{ name?: string; email?: string; roles?: string }>({});

  const close = () => {
    onClose();
    setErrors({});
    if (mode === "create") {
      setFullName("");
      setEmail("");
      setState(initial());
    } else setState(initial(user));
  };

  const save = useMutation({
    mutationFn: async () => {
      if (mode === "create") {
        await invite({
          data: {
            fullName,
            email,
            roles: [...state.roles].filter(
              (r): r is Exclude<AppRole, "admin_rh"> => r !== "admin_rh",
            ),
            siteIds: [...state.sites],
            unitIds: [...state.units],
            redirectTo: `${window.location.origin}/reset-password`,
          },
        });
        return;
      }
      if (!user) return;
      const roleDiff = diffAssignments(
        user.roles.map((r) => ({ id: r.id, key: r.role, archived_at: r.archived_at })),
        state.roles,
      );
      const scopeKey = (s: AdminUser["scopes"][number]) =>
        s.site_id ? `site:${s.site_id}` : `unit:${s.org_unit_id}`;
      const wantedScopes = new Set(
        [...state.sites].map((x) => `site:${x}`).concat([...state.units].map((x) => `unit:${x}`)),
      );
      const scopeDiff = diffAssignments(
        user.scopes.map((s) => ({ id: s.id, key: scopeKey(s), archived_at: s.archived_at })),
        wantedScopes,
      );
      const now = new Date().toISOString();
      const run = async (p: PromiseLike<{ error: unknown }>) => {
        const { error } = await p;
        if (error) throw error;
      };
      if (roleDiff.insert.length)
        await run(
          supabase
            .from("user_roles")
            .insert(roleDiff.insert.map((role) => ({ user_id: user.id, role: role as AppRole }))),
        );
      if (roleDiff.restore.length)
        await run(
          supabase.from("user_roles").update({ archived_at: null }).in("id", roleDiff.restore),
        );
      if (roleDiff.archive.length)
        await run(
          supabase.from("user_roles").update({ archived_at: now }).in("id", roleDiff.archive),
        );
      if (scopeDiff.insert.length)
        await run(
          supabase
            .from("user_scopes")
            .insert(
              scopeDiff.insert.map((k) =>
                k.startsWith("site:")
                  ? { user_id: user.id, site_id: k.slice(5) }
                  : { user_id: user.id, org_unit_id: k.slice(5) },
              ),
            ),
        );
      if (scopeDiff.restore.length)
        await run(
          supabase.from("user_scopes").update({ archived_at: null }).in("id", scopeDiff.restore),
        );
      if (scopeDiff.archive.length)
        await run(
          supabase.from("user_scopes").update({ archived_at: now }).in("id", scopeDiff.archive),
        );
    },
    onSuccess: () => {
      toast.success(mode === "create" ? "Invitation envoyée." : "Accès mis à jour.");
      queryClient.invalidateQueries({ queryKey: adminUsersQuery.queryKey });
      queryClient.invalidateQueries({ queryKey: ["current-user"] });
      close();
    },
    onError: (e: Error) => {
      const m = (e as { message?: string }).message ?? "";
      toast.error(
        m.includes("dernier") || m.includes("propres rôles") || mode === "create"
          ? m || dbErrorMessage(e)
          : dbErrorMessage(e),
      );
    },
  });

  function submit() {
    const next: typeof errors = {};
    if (mode === "create") {
      if (fullName.trim().length < 2) next.name = "Saisissez le nom complet.";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = "Adresse e-mail invalide.";
    }
    if (state.roles.size === 0) next.roles = "Choisissez au moins un rôle.";
    setErrors(next);
    if (Object.keys(next).length === 0) save.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Créer un compte" : `Modifier ${user?.fullName || user?.email}`}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Une invitation est envoyée par e-mail ; la personne choisit son mot de passe."
              : "Un utilisateur peut cumuler plusieurs rôles : ses droits s'additionnent."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {mode === "create" && (
            <>
              <FormRow label="Nom complet" htmlFor="user-name" error={errors.name}>
                <Input
                  id="user-name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ex. Awa Diop"
                />
              </FormRow>
              <FormRow label="Adresse e-mail" htmlFor="user-email" error={errors.email}>
                <Input
                  id="user-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="prenom.nom@exemple.com"
                />
              </FormRow>
            </>
          )}
          <div>
            <CheckList
              legend="Rôles"
              idPrefix="role"
              items={ROLE_OPTIONS.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
              selected={state.roles}
              onToggle={(v) => setState((s) => ({ ...s, roles: flip(s.roles, v) }))}
            />
            {errors.roles && (
              <p role="alert" className="mt-1 text-sm text-destructive">
                {errors.roles}
              </p>
            )}
          </div>
          <CheckList
            legend="Sites (pour les rôles à périmètre « sites »)"
            idPrefix="site"
            items={sites.filter((s) => !s.archived_at).map((s) => ({ value: s.id, label: s.name }))}
            selected={state.sites}
            onToggle={(v) => setState((s) => ({ ...s, sites: flip(s.sites, v) }))}
          />
          <CheckList
            legend="Unités (pour les rôles à périmètre « unités »)"
            idPrefix="unit"
            items={units
              .filter((u) => !u.archived_at)
              .sort((a, b) => a.name.localeCompare(b.name, "fr"))
              .map((u) => ({ value: u.id, label: u.name }))}
            selected={state.units}
            onToggle={(v) => setState((s) => ({ ...s, units: flip(s.units, v) }))}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={save.isPending}>
            {save.isPending && <Loader2 className="animate-spin" />}
            {mode === "create" ? "Envoyer l'invitation" : "Enregistrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
