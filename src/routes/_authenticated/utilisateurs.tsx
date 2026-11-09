import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, UserPlus } from "lucide-react";

import { PageHeader, RequireRole } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/format";
import { ROLE_LABELS, ROLE_OPTIONS, useCurrentUser, type AppRole } from "@/lib/roles";
import { inviteUser } from "@/lib/users.functions";

export const Route = createFileRoute("/_authenticated/utilisateurs")({
  head: () => ({
    meta: [
      { title: "Utilisateurs — Fabrimétal Personnel" },
      { name: "description", content: "Invitation des utilisateurs et attribution des rôles." },
      { property: "og:title", content: "Utilisateurs — Fabrimétal Personnel" },
      { property: "og:description", content: "Invitation des utilisateurs et attribution des rôles." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: UsersPage,
});

type UserRow = {
  id: string;
  email: string;
  fullName: string;
  createdAt: string;
  role: AppRole | null;
  roleId: string | null;
  active: boolean;
};

const usersQuery = queryOptions({
  queryKey: ["users"],
  queryFn: async (): Promise<UserRow[]> => {
    const [profiles, roles] = await Promise.all([
      supabase.from("profiles").select("id, email, full_name, created_at").order("full_name"),
      supabase.from("user_roles").select("id, user_id, role, archived_at"),
    ]);
    if (profiles.error) throw profiles.error;
    if (roles.error) throw roles.error;
    const byUser = new Map(roles.data.map((r) => [r.user_id, r]));
    return profiles.data.map((p) => {
      const r = byUser.get(p.id);
      return {
        id: p.id,
        email: p.email,
        fullName: p.full_name,
        createdAt: p.created_at,
        role: r?.role ?? null,
        roleId: r?.id ?? null,
        active: !!r && r.archived_at === null,
      };
    });
  },
});

function UsersPage() {
  return (
    <RequireRole roles={["admin_rh"]}>
      <UsersContent />
    </RequireRole>
  );
}

function UsersContent() {
  const { data: users, isLoading, error } = useQuery(usersQuery);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow="Administration"
        title="Utilisateurs"
        description="Seules les personnes invitées peuvent se connecter. Un compte désactivé conserve son historique."
        actions={<InviteDialog />}
      />

      {isLoading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Chargement…
        </p>
      )}
      {error && <p className="text-sm text-destructive">Impossible de charger les utilisateurs.</p>}

      {users && (
        <ul className="divide-y rounded-lg border bg-card shadow-panel">
          {users.map((u) => (
            <UserItem key={u.id} user={u} />
          ))}
        </ul>
      )}
    </div>
  );
}

function UserItem({ user }: { user: UserRow }) {
  const queryClient = useQueryClient();
  const { data: me } = useCurrentUser();
  const isMe = me?.id === user.id;

  const mutation = useMutation({
    mutationFn: async (change: { role?: AppRole; active?: boolean }) => {
      if (!user.roleId) {
        const { error } = await supabase
          .from("user_roles")
          .insert({ user_id: user.id, role: change.role ?? "direction" });
        if (error) throw error;
        return;
      }
      const patch: { role?: AppRole; archived_at?: string | null } = {};
      if (change.role) patch.role = change.role;
      if (change.active !== undefined) patch.archived_at = change.active ? null : new Date().toISOString();
      const { error } = await supabase.from("user_roles").update(patch).eq("id", user.roleId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Accès mis à jour.");
      queryClient.invalidateQueries({ queryKey: ["users"] });
      if (isMe) queryClient.invalidateQueries({ queryKey: ["current-user"] });
    },
    onError: (e: Error) =>
      toast.error(e.message.includes("dernier administrateur") ? e.message : "Modification refusée."),
  });

  return (
    <li className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="flex items-center gap-2 font-medium">
          <span className="truncate">{user.fullName || user.email}</span>
          {isMe && <Badge variant="secondary">Vous</Badge>}
          {!user.active && <Badge variant="outline">Désactivé</Badge>}
        </p>
        <p className="truncate text-sm text-muted-foreground">{user.email}</p>
        <p className="text-xs text-muted-foreground">Créé le {formatDate(user.createdAt)}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Select
          value={user.role ?? ""}
          onValueChange={(role) => mutation.mutate({ role: role as AppRole })}
          disabled={mutation.isPending}
        >
          <SelectTrigger className="w-48" aria-label={`Rôle de ${user.email}`}>
            <SelectValue placeholder="Attribuer un rôle" />
          </SelectTrigger>
          <SelectContent>
            {ROLE_OPTIONS.map((r) => (
              <SelectItem key={r} value={r}>
                {ROLE_LABELS[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {user.roleId && (
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate({ active: !user.active })}
          >
            {user.active ? "Désactiver" : "Réactiver"}
          </Button>
        )}
      </div>
    </li>
  );
}

const inviteSchema = z.object({
  fullName: z.string().trim().min(2, "Nom requis"),
  email: z.string().trim().email("Adresse e-mail invalide"),
  role: z.enum(["admin_rh", "gestionnaire_rh", "direction"]),
});

function InviteDialog() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const invite = useServerFn(inviteUser);
  const form = useForm<z.infer<typeof inviteSchema>>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { fullName: "", email: "", role: "gestionnaire_rh" },
  });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: z.infer<typeof inviteSchema>) {
    try {
      await invite({
        data: { ...values, redirectTo: `${window.location.origin}/reset-password` },
      });
      toast.success(`Invitation envoyée à ${values.email}.`);
      form.reset();
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["users"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "L'invitation n'a pas pu être envoyée.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="signal">
          <UserPlus /> Inviter un utilisateur
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Inviter un utilisateur</DialogTitle>
          <DialogDescription>
            La personne reçoit un e-mail pour choisir son mot de passe.
          </DialogDescription>
        </DialogHeader>
        <form id="invite-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="fullName">Nom complet</Label>
            <Input id="fullName" {...form.register("fullName")} />
            {errors.fullName && <p className="text-sm text-destructive">{errors.fullName.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="invite-email">Adresse e-mail</Label>
            <Input id="invite-email" type="email" {...form.register("email")} />
            {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
          </div>
          <div className="space-y-2">
            <Label>Rôle</Label>
            <Controller
              control={form.control}
              name="role"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger aria-label="Rôle">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
        </form>
        <DialogFooter>
          <Button type="submit" form="invite-form" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="animate-spin" />}
            Envoyer l'invitation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
