import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { listAll } from "@/lib/referentials";
import type { Action, Resource } from "@/lib/permissions";
import type { AppRole } from "@/lib/roles";

// ---------- Libellés ----------

export const ACTIONS: Action[] = ["view", "create", "edit", "archive", "export", "import"];
export const ACTION_LABELS: Record<Action, string> = {
  view: "Voir",
  create: "Créer",
  edit: "Modifier",
  archive: "Archiver",
  export: "Exporter",
  import: "Importer",
};

export const SCOPES = ["all", "site", "unit", "team", "self"] as const;
export type Scope = (typeof SCOPES)[number];
export const SCOPE_LABELS: Record<Scope, string> = {
  all: "Tout",
  site: "Ses sites",
  unit: "Ses unités",
  team: "Son équipe",
  self: "Lui-même",
};

// ---------- Matrice rôles × permissions × périmètre ----------

export type RoleRow = {
  id: string;
  code: string;
  label: string;
  requires_mfa: boolean;
  sort_order: number;
};
export type PermissionRow = { id: string; resource: string; action: string; label: string };
export type RolePermissionRow = {
  id: string;
  role_id: string;
  permission_id: string;
  scope: Scope;
  archived_at: string | null;
};

export const matrixQuery = queryOptions({
  queryKey: ["admin", "matrix"],
  queryFn: async () => {
    const [roles, permissions, rolePermissions] = await Promise.all([
      supabase
        .from("roles")
        .select("id, code, label, requires_mfa, sort_order")
        .is("archived_at", null)
        .order("sort_order"),
      supabase.from("permissions").select("id, resource, action, label").is("archived_at", null),
      listAll((from, to) =>
        supabase
          .from("role_permissions")
          .select("id, role_id, permission_id, scope, archived_at")
          .order("id")
          .range(from, to),
      ),
    ]);
    if (roles.error) throw roles.error;
    if (permissions.error) throw permissions.error;
    return {
      roles: roles.data as RoleRow[],
      permissions: permissions.data as PermissionRow[],
      rolePermissions: rolePermissions as RolePermissionRow[],
    };
  },
});

/** Ressources dans l'ordre d'affichage, avec le libellé de la base. */
export function resourcesOf(permissions: PermissionRow[]): { resource: string; label: string }[] {
  const seen = new Map<string, string>();
  for (const p of permissions) if (!seen.has(p.resource)) seen.set(p.resource, p.label);
  return [...seen.entries()].map(([resource, label]) => ({ resource, label }));
}

export type CellKey = `${string}:${string}:${string}`;

/** Périmètre actif d'une case (rôle, ressource, action), ou null si la permission n'est pas accordée. */
export function cellScope(
  matrix: { permissions: PermissionRow[]; rolePermissions: RolePermissionRow[] },
  roleId: string,
  resource: string,
  action: string,
): { scope: Scope; row: RolePermissionRow } | null {
  const perm = matrix.permissions.find((p) => p.resource === resource && p.action === action);
  if (!perm) return null;
  const row = matrix.rolePermissions.find(
    (r) => r.role_id === roleId && r.permission_id === perm.id && r.archived_at === null,
  );
  return row ? { scope: row.scope, row } : null;
}

export type CellChange =
  | { kind: "none" }
  | { kind: "insert"; roleId: string; permissionId: string; scope: Scope }
  | { kind: "update"; id: string; scope: Scope }
  | { kind: "restore"; id: string; scope: Scope }
  | { kind: "archive"; id: string };

/** Traduit le choix de l'éditeur (`null` = retirer) en opération sur `role_permissions`. */
export function planCellChange(
  matrix: { permissions: PermissionRow[]; rolePermissions: RolePermissionRow[] },
  roleId: string,
  resource: string,
  action: string,
  next: Scope | null,
): CellChange {
  const perm = matrix.permissions.find((p) => p.resource === resource && p.action === action);
  if (!perm) return { kind: "none" };
  const rows = matrix.rolePermissions.filter(
    (r) => r.role_id === roleId && r.permission_id === perm.id,
  );
  const live = rows.find((r) => r.archived_at === null);
  if (next === null) return live ? { kind: "archive", id: live.id } : { kind: "none" };
  if (live)
    return live.scope === next ? { kind: "none" } : { kind: "update", id: live.id, scope: next };
  const old = rows[0];
  return old
    ? { kind: "restore", id: old.id, scope: next }
    : { kind: "insert", roleId, permissionId: perm.id, scope: next };
}

/**
 * Garde-fou contre l'auto-verrouillage : l'administrateur IT doit toujours pouvoir gérer les
 * utilisateurs et les rôles, sur tout le périmètre. Renvoie le message de refus, ou null.
 */
export function lockoutError(
  roleCode: string,
  resource: string,
  action: string,
  next: Scope | null,
): string | null {
  if (roleCode !== "admin_it" || resource !== "users") return null;
  if (action !== "view" && action !== "edit") return null;
  if (next === "all") return null;
  return "L'administrateur IT doit garder « Voir » et « Modifier » sur les utilisateurs, pour tout le périmètre : sans cela, plus personne ne pourrait corriger la matrice.";
}

/** Un périmètre limité (sites, unités) n'a de sens que si des périmètres sont attribués aux utilisateurs. */
export const SCOPE_HINTS: Record<Scope, string> = {
  all: "Toutes les données",
  site: "Les employés des sites attribués à l'utilisateur",
  unit: "Les employés des unités attribuées (sous-unités comprises)",
  team: "Les subordonnés directs et indirects de l'employé lié au compte",
  self: "Uniquement la fiche de l'employé lié au compte",
};

// ---------- Rôles et périmètres des utilisateurs ----------

export type Assignment = { id: string; key: string; archived_at: string | null };

/**
 * Compare l'état voulu (clés cochées) aux lignes existantes : ajouter, restaurer une ligne
 * archivée, ou archiver. Ne touche pas aux lignes déjà dans le bon état.
 */
export function diffAssignments(existing: Assignment[], wanted: Set<string>) {
  const insert: string[] = [];
  const restore: string[] = [];
  const archive: string[] = [];
  const byKey = new Map<string, Assignment[]>();
  for (const a of existing) byKey.set(a.key, [...(byKey.get(a.key) ?? []), a]);

  for (const key of wanted) {
    const rows = byKey.get(key) ?? [];
    if (rows.some((r) => r.archived_at === null)) continue;
    const old = rows[0];
    if (old) restore.push(old.id);
    else insert.push(key);
  }
  for (const a of existing) if (a.archived_at === null && !wanted.has(a.key)) archive.push(a.id);
  return { insert, restore, archive };
}

export type AdminUser = {
  id: string;
  email: string;
  fullName: string;
  createdAt: string;
  roles: { id: string; role: AppRole; archived_at: string | null }[];
  scopes: {
    id: string;
    site_id: string | null;
    org_unit_id: string | null;
    archived_at: string | null;
  }[];
};

export const userIsActive = (u: Pick<AdminUser, "roles">) =>
  u.roles.some((r) => r.archived_at === null);

export const adminUsersQuery = queryOptions({
  queryKey: ["admin", "users"],
  queryFn: async (): Promise<AdminUser[]> => {
    const [profiles, roles, scopes] = await Promise.all([
      listAll((from, to) =>
        supabase
          .from("profiles")
          .select("id, email, full_name, created_at")
          .order("id")
          .range(from, to),
      ),
      listAll((from, to) =>
        supabase
          .from("user_roles")
          .select("id, user_id, role, archived_at")
          .order("id")
          .range(from, to),
      ),
      listAll((from, to) =>
        supabase
          .from("user_scopes")
          .select("id, user_id, site_id, org_unit_id, archived_at")
          .order("id")
          .range(from, to),
      ),
    ]);
    return profiles
      .map((p) => ({
        id: p.id,
        email: p.email,
        fullName: p.full_name,
        createdAt: p.created_at,
        roles: roles.filter((r) => r.user_id === p.id),
        scopes: scopes.filter((s) => s.user_id === p.id),
      }))
      .sort((a, b) => (a.fullName || a.email).localeCompare(b.fullName || b.email, "fr"));
  },
});

export type { Resource };
