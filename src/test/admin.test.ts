import { describe, expect, it } from "vitest";

import {
  cellScope,
  diffAssignments,
  lockoutError,
  planCellChange,
  resourcesOf,
  type PermissionRow,
  type RolePermissionRow,
} from "@/lib/admin";
import { auditDiff, displayAuditValue, periodBounds, tableLabel } from "@/lib/audit-view";

const permissions: PermissionRow[] = [
  { id: "p1", resource: "employees", action: "view", label: "Employés" },
  { id: "p2", resource: "employees", action: "edit", label: "Employés" },
  { id: "p3", resource: "users", action: "view", label: "Utilisateurs" },
];
const rp = (over: Partial<RolePermissionRow>): RolePermissionRow => ({
  id: "r1",
  role_id: "drh",
  permission_id: "p1",
  scope: "all",
  archived_at: null,
  ...over,
});

describe("matrice des permissions", () => {
  it("liste les ressources une fois, dans l'ordre", () => {
    expect(resourcesOf(permissions).map((r) => r.resource)).toEqual(["employees", "users"]);
  });
  it("lit le périmètre actif d'une case", () => {
    const m = {
      permissions,
      rolePermissions: [rp({}), rp({ id: "r2", permission_id: "p2", archived_at: "2026-01-01" })],
    };
    expect(cellScope(m, "drh", "employees", "view")?.scope).toBe("all");
    expect(cellScope(m, "drh", "employees", "edit")).toBeNull(); // archivée
    expect(cellScope(m, "drh", "users", "view")).toBeNull();
  });
  it("planifie l'opération minimale", () => {
    const m = {
      permissions,
      rolePermissions: [rp({}), rp({ id: "r2", permission_id: "p2", archived_at: "2026-01-01" })],
    };
    expect(planCellChange(m, "drh", "employees", "view", "all")).toEqual({ kind: "none" });
    expect(planCellChange(m, "drh", "employees", "view", "team")).toEqual({
      kind: "update",
      id: "r1",
      scope: "team",
    });
    expect(planCellChange(m, "drh", "employees", "view", null)).toEqual({
      kind: "archive",
      id: "r1",
    });
    expect(planCellChange(m, "drh", "employees", "edit", "all")).toEqual({
      kind: "restore",
      id: "r2",
      scope: "all",
    });
    expect(planCellChange(m, "drh", "users", "view", "all")).toEqual({
      kind: "insert",
      roleId: "drh",
      permissionId: "p3",
      scope: "all",
    });
    expect(planCellChange(m, "paie", "employees", "edit", null)).toEqual({ kind: "none" });
    expect(planCellChange(m, "drh", "inconnue", "view", "all")).toEqual({ kind: "none" });
  });
  it("empêche l'administrateur IT de se verrouiller", () => {
    expect(lockoutError("admin_it", "users", "edit", null)).toMatch(/garder/);
    expect(lockoutError("admin_it", "users", "view", "team")).toMatch(/garder/);
    expect(lockoutError("admin_it", "users", "view", "all")).toBeNull();
    expect(lockoutError("admin_it", "users", "create", null)).toBeNull();
    expect(lockoutError("drh", "users", "edit", null)).toBeNull();
  });
});

describe("rôles et périmètres d'un utilisateur", () => {
  const existing = [
    { id: "a", key: "drh", archived_at: null },
    { id: "b", key: "paie", archived_at: "2026-01-01" },
    { id: "c", key: "auditeur", archived_at: null },
  ];
  it("ajoute, restaure et archive sans toucher au reste", () => {
    const d = diffAssignments(existing, new Set(["drh", "paie", "manager"]));
    expect(d).toEqual({ insert: ["manager"], restore: ["b"], archive: ["c"] });
  });
  it("ne fait rien si l'état est déjà le bon", () => {
    expect(diffAssignments(existing, new Set(["drh", "auditeur"]))).toEqual({
      insert: [],
      restore: [],
      archive: [],
    });
  });
});

describe("journal d'audit", () => {
  it("affiche l'avant et l'après d'une modification, sans champs techniques", () => {
    const lines = auditDiff({
      action: "UPDATE",
      table_name: "user_roles",
      old_data: { role: "drh", archived_at: null },
      new_data: { role: "paie", archived_at: null },
      changed_fields: ["role", "updated_at"],
    });
    expect(lines).toEqual([{ field: "role", label: "Rôle", before: "DRH", after: "Paie" }]);
  });
  it("liste les valeurs d'une création et d'une suppression", () => {
    const created = auditDiff({
      action: "INSERT",
      table_name: "sites",
      old_data: null,
      new_data: { id: "x", name: "Dakar", created_at: "2026-01-01", archived_at: null },
      changed_fields: null,
    });
    expect(created).toEqual([{ field: "name", label: "Nom", before: null, after: "Dakar" }]);
    const deleted = auditDiff({
      action: "DELETE",
      table_name: "sites",
      old_data: { id: "x", name: "Dakar" },
      new_data: null,
      changed_fields: null,
    });
    expect(deleted[0]).toMatchObject({ before: "Dakar", after: null });
  });
  it("masque le contenu des données sensibles", () => {
    expect(displayAuditValue("employee_sensitive", "id_document_number", "SN123")).toBe(
      "valeur masquée",
    );
    expect(displayAuditValue("employees", "birth_date", "1990-03-05")).toBe("05/03/1990");
    expect(displayAuditValue("sites", "x", null)).toBe("—");
    expect(displayAuditValue("role_permissions", "scope", "team")).toBe("Son équipe");
  });
  it("libelle les tables et calcule les bornes de période", () => {
    expect(tableLabel("user_scopes")).toBe("Périmètre d'un utilisateur");
    expect(tableLabel("zzz")).toBe("zzz");
    expect(periodBounds("2026-11-01", "2026-11-10")).toEqual({
      gte: "2026-11-01T00:00:00Z",
      lt: "2026-11-11T00:00:00.000Z",
    });
    expect(periodBounds("pas une date", undefined)).toEqual({});
  });
});
