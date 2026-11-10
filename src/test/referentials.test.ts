import { describe, expect, it } from "vitest";

import { hasPermission } from "@/lib/permissions";
import {
  allowedChildTypes,
  buildOrgTree,
  countUsage,
  dbErrorMessage,
  describeUsage,
  descendantIds,
  flattenTree,
  hasActiveChildren,
  summarizeChange,
  type OrgUnit,
} from "@/lib/referentials";

const unit = (
  id: string,
  parent: string | null,
  type: OrgUnit["type"],
  extra: Partial<OrgUnit> = {},
): OrgUnit => ({
  id,
  name: id,
  parent_id: parent,
  type,
  sort_order: 0,
  archived_at: null,
  created_at: "",
  created_by: null,
  updated_at: "",
  updated_by: null,
  ...extra,
});

const UNITS = [
  unit("prod", null, "direction"),
  unit("usinage", "prod", "departement"),
  unit("tournage", "usinage", "service"),
  unit("equipe-a", "tournage", "equipe", { archived_at: "2026-01-01" }),
  unit("rh", null, "direction", { sort_order: -1 }),
];

describe("arbre organisationnel", () => {
  it("trie par ordre puis nom et calcule la profondeur", () => {
    const flat = flattenTree(buildOrgTree(UNITS, false));
    expect(flat.map((n) => [n.id, n.depth])).toEqual([
      ["rh", 0],
      ["prod", 0],
      ["usinage", 1],
      ["tournage", 2],
    ]);
  });

  it("masque les archivés, sauf demande contraire", () => {
    expect(flattenTree(buildOrgTree(UNITS, false)).some((n) => n.id === "equipe-a")).toBe(false);
    expect(flattenTree(buildOrgTree(UNITS, true)).some((n) => n.id === "equipe-a")).toBe(true);
  });

  it("une sous-unité n'est pas orpheline quand son parent archivé est masqué", () => {
    const units = [
      unit("a", null, "direction", { archived_at: "x" }),
      unit("b", "a", "departement"),
    ];
    expect(flattenTree(buildOrgTree(units, false)).map((n) => [n.id, n.depth])).toEqual([["b", 0]]);
  });

  it("n'autorise que des types de niveau inférieur sous un parent", () => {
    expect(allowedChildTypes(null)).toHaveLength(4);
    expect(allowedChildTypes("departement")).toEqual(["service", "equipe"]);
    expect(allowedChildTypes("equipe")).toEqual([]);
  });

  it("exclut l'unité et ses descendants des parents possibles", () => {
    expect([...descendantIds(UNITS, "prod")].sort()).toEqual([
      "equipe-a",
      "prod",
      "tournage",
      "usinage",
    ]);
  });

  it("ignore les sous-unités archivées pour bloquer l'archivage", () => {
    expect(hasActiveChildren(UNITS, "prod")).toBe(true);
    expect(hasActiveChildren(UNITS, "tournage")).toBe(false);
  });
});

describe("usage", () => {
  const rows = [
    { org_unit_id: "u1", job_title_id: "j1", category_id: null, end_date: null },
    { org_unit_id: "u1", job_title_id: "j1", category_id: null, end_date: "2025-01-31" },
    { org_unit_id: "u1", job_title_id: null, category_id: null, end_date: "2026-12-31" },
  ];

  it("distingue affectations en cours et historique", () => {
    expect(countUsage(rows, "org_unit_id", "2026-11-10").get("u1")).toEqual({
      current: 2,
      total: 3,
    });
    expect(countUsage(rows, "job_title_id", "2026-11-10").get("j1")).toEqual({
      current: 1,
      total: 2,
    });
  });

  it("n'affirme jamais « non utilisé » quand l'usage est inconnu", () => {
    expect(describeUsage(null)).toMatch(/non vérifiable/);
    expect(describeUsage({ current: 0, total: 0 })).toBe("Non utilisé.");
    expect(describeUsage({ current: 1, total: 4 })).toBe("1 affectation en cours, 4 au total.");
    expect(describeUsage({ current: 2, total: 4 })).toBe("2 affectations en cours, 4 au total.");
  });
});

describe("journal", () => {
  it("décrit un archivage et une restauration", () => {
    const base = { old_data: { name: "Tournage" }, changed_fields: ["archived_at", "updated_at"] };
    expect(
      summarizeChange({
        ...base,
        action: "UPDATE",
        new_data: { name: "Tournage", archived_at: "2026-11-10" },
      }),
    ).toEqual(["Archivage de « Tournage »"]);
    expect(
      summarizeChange({
        ...base,
        action: "UPDATE",
        new_data: { name: "Tournage", archived_at: null },
      }),
    ).toEqual(["Restauration de « Tournage »"]);
  });

  it("décrit un changement de valeur sans exposer les champs techniques", () => {
    expect(
      summarizeChange({
        action: "UPDATE",
        old_data: { label: "Âge de départ à la retraite", value: 60 },
        new_data: { label: "Âge de départ à la retraite", value: 62 },
        changed_fields: ["value", "updated_at", "updated_by"],
      }),
    ).toEqual(["Valeur : 60 → 62"]);
  });

  it("décrit une création et une modification de nom", () => {
    expect(
      summarizeChange({
        action: "INSERT",
        old_data: null,
        new_data: { name: "Kaolack" },
        changed_fields: null,
      }),
    ).toEqual(["Création de « Kaolack »"]);
    expect(
      summarizeChange({
        action: "UPDATE",
        old_data: { name: "A" },
        new_data: { name: "B" },
        changed_fields: ["name"],
      }),
    ).toEqual(["Nom : A → B"]);
  });
});

describe("erreurs et permissions", () => {
  it("traduit les erreurs de la base", () => {
    expect(dbErrorMessage({ code: "23505" })).toMatch(/existe déjà/);
    expect(dbErrorMessage({ code: "42501" })).toMatch(/non autorisée/);
    expect(
      dbErrorMessage({
        code: "P0001",
        message: "Archivez d'abord les sous-unités de cette unité.",
      }),
    ).toBe("Archivez d'abord les sous-unités de cette unité.");
    expect(dbErrorMessage(new Error("boom"))).toBe("L'opération a échoué.");
  });

  it("lit les permissions renvoyées par la base", () => {
    const rows = [{ resource: "referentials", action: "edit" }];
    expect(hasPermission(rows, "referentials", "edit")).toBe(true);
    expect(hasPermission(rows, "referentials", "archive")).toBe(false);
    expect(hasPermission(undefined, "referentials", "view")).toBe(false);
  });
});
