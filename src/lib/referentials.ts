import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];

export type Site = Row<"sites">;
export type OrgUnit = Row<"org_units">;
export type JobTitle = Row<"job_titles">;
export type JobTitleAlias = Row<"job_title_aliases">;
export type Category = Row<"categories">;
export type ExitReason = Row<"exit_reasons">;
export type DocumentType = Row<"document_types">;

export type OrgUnitType = Database["public"]["Enums"]["org_unit_type"];
export type EmployeeStatus = Database["public"]["Enums"]["employee_status"];

export const ORG_TYPE_LABELS: Record<OrgUnitType, string> = {
  direction: "Direction",
  departement: "Département",
  service: "Service",
  equipe: "Équipe",
};
const ORG_TYPE_RANK: Record<OrgUnitType, number> = {
  direction: 0,
  departement: 1,
  service: 2,
  equipe: 3,
};
export const ORG_TYPES = Object.keys(ORG_TYPE_RANK) as OrgUnitType[];

export const STATUS_LABELS: Record<EmployeeStatus, string> = {
  cadre: "Cadre",
  agent_maitrise: "Agent de maîtrise",
  employe: "Employé",
  ouvrier: "Ouvrier",
  stagiaire: "Stagiaire",
};
export const STATUS_OPTIONS = Object.keys(STATUS_LABELS) as EmployeeStatus[];

/** Une unité ne peut avoir que des sous-unités de niveau inférieur (règle d'interface ; la base vérifie les boucles). */
export function allowedChildTypes(parent: OrgUnitType | null): OrgUnitType[] {
  if (!parent) return ORG_TYPES;
  return ORG_TYPES.filter((t) => ORG_TYPE_RANK[t] > ORG_TYPE_RANK[parent]);
}

export type OrgNode = OrgUnit & { depth: number; children: OrgNode[] };

const byOrder = (a: OrgUnit, b: OrgUnit) =>
  a.sort_order - b.sort_order || a.name.localeCompare(b.name, "fr");

/** Arbre trié. Une unité archivée disparaît avec ses sous-unités, sauf si `withArchived`. */
export function buildOrgTree(units: OrgUnit[], withArchived: boolean): OrgNode[] {
  const visible = units.filter((u) => withArchived || !u.archived_at);
  const ids = new Set(visible.map((u) => u.id));
  const childrenOf = new Map<string | null, OrgUnit[]>();
  for (const u of visible) {
    const key = u.parent_id && ids.has(u.parent_id) ? u.parent_id : null;
    childrenOf.set(key, [...(childrenOf.get(key) ?? []), u]);
  }
  const build = (parent: string | null, depth: number): OrgNode[] =>
    (childrenOf.get(parent) ?? [])
      .sort(byOrder)
      .map((u) => ({ ...u, depth, children: build(u.id, depth + 1) }));
  return build(null, 0);
}

export function flattenTree(nodes: OrgNode[]): OrgNode[] {
  return nodes.flatMap((n) => [n, ...flattenTree(n.children)]);
}

/** Identifiants de l'unité et de tous ses descendants (pour interdire un déplacement circulaire). */
export function descendantIds(units: OrgUnit[], id: string): Set<string> {
  const out = new Set<string>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const u of units) {
      if (u.parent_id && out.has(u.parent_id) && !out.has(u.id)) {
        out.add(u.id);
        grew = true;
      }
    }
  }
  return out;
}

export function hasActiveChildren(units: OrgUnit[], id: string) {
  return units.some((u) => u.parent_id === id && !u.archived_at);
}

// ---------- Usage ----------

export type Usage = { current: number; total: number };
export type UsageMap = Map<string, Usage>;
export type AssignmentRef = {
  org_unit_id: string | null;
  job_title_id: string | null;
  category_id: string | null;
  end_date: string | null;
};

export function countUsage(
  rows: AssignmentRef[],
  field: "org_unit_id" | "job_title_id" | "category_id",
  today: string,
): UsageMap {
  const map: UsageMap = new Map();
  for (const r of rows) {
    const id = r[field];
    if (!id) continue;
    const u = map.get(id) ?? { current: 0, total: 0 };
    u.total += 1;
    if (!r.end_date || r.end_date >= today) u.current += 1;
    map.set(id, u);
  }
  return map;
}

export function describeUsage(usage: Usage | undefined | null): string {
  if (usage === null) return "Usage non vérifiable avec votre rôle.";
  if (!usage || usage.total === 0) return "Non utilisé.";
  const s = (n: number) => (n > 1 ? "s" : "");
  return `${usage.current} affectation${s(usage.current)} en cours, ${usage.total} au total.`;
}

// ---------- Validation et erreurs ----------

export const normalize = (s: string) => s.trim().replace(/\s+/g, " ");

export function dbErrorMessage(error: unknown): string {
  const e = error as { code?: string; message?: string } | null;
  if (e?.code === "23505")
    return "Cette valeur existe déjà (la casse est ignorée, archivés compris).";
  if (e?.code === "42501") return "Action non autorisée pour votre rôle.";
  // Les règles métier de la base (RAISE EXCEPTION) sont rédigées en français.
  if (e?.code === "P0001" && e.message) return e.message;
  if (e?.message?.includes("row-level security")) return "Action non autorisée pour votre rôle.";
  return "L'opération a échoué.";
}

// ---------- Requêtes ----------

const PAGE = 1000;

async function listAll<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
) {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await fetchPage(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE) return out;
  }
}

export const sitesQuery = queryOptions({
  queryKey: ["ref", "sites"],
  queryFn: async () => {
    const { data, error } = await supabase.from("sites").select("*").order("name");
    if (error) throw error;
    return data;
  },
});

export const orgUnitsQuery = queryOptions({
  queryKey: ["ref", "org_units"],
  queryFn: async () => {
    const { data, error } = await supabase.from("org_units").select("*");
    if (error) throw error;
    return data;
  },
});

export const jobTitlesQuery = queryOptions({
  queryKey: ["ref", "job_titles"],
  queryFn: async () => {
    const { data, error } = await supabase.from("job_titles").select("*").order("name");
    if (error) throw error;
    return data;
  },
});

export const aliasesQuery = queryOptions({
  queryKey: ["ref", "job_title_aliases"],
  queryFn: async () => {
    const { data, error } = await supabase.from("job_title_aliases").select("*").order("alias");
    if (error) throw error;
    return data;
  },
});

export const categoriesQuery = queryOptions({
  queryKey: ["ref", "categories"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("categories")
      .select("*")
      .order("sort_order")
      .order("code");
    if (error) throw error;
    return data;
  },
});

export const exitReasonsQuery = queryOptions({
  queryKey: ["ref", "exit_reasons"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("exit_reasons")
      .select("*")
      .order("sort_order")
      .order("name");
    if (error) throw error;
    return data;
  },
});

export const documentTypesQuery = queryOptions({
  queryKey: ["ref", "document_types"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("document_types")
      .select("*")
      .order("sort_order")
      .order("name");
    if (error) throw error;
    return data;
  },
});

/** Affectations non archivées. Lisibles seulement avec la permission « assignments:view » (RLS). */
export const assignmentRefsQuery = queryOptions({
  queryKey: ["ref", "assignment-refs"],
  queryFn: () =>
    listAll<AssignmentRef>((from, to) =>
      supabase
        .from("assignments")
        .select("org_unit_id, job_title_id, category_id, end_date")
        .is("archived_at", null)
        .order("id")
        .range(from, to),
    ),
});

export const REFERENTIAL_TABLES = [
  "sites",
  "org_units",
  "job_titles",
  "job_title_aliases",
  "categories",
  "exit_reasons",
  "document_types",
  "settings",
] as const;

export const TABLE_LABELS: Record<string, string> = {
  sites: "Site",
  org_units: "Unité organisationnelle",
  job_titles: "Poste",
  job_title_aliases: "Alias de poste",
  categories: "Catégorie",
  exit_reasons: "Motif de sortie",
  document_types: "Type de document",
  settings: "Paramètre métier",
};

export const FIELD_LABELS: Record<string, string> = {
  name: "Nom",
  code: "Code",
  alias: "Alias",
  type: "Type",
  parent_id: "Unité parente",
  job_title_id: "Poste",
  default_status: "Statut par défaut",
  is_confidential: "Confidentiel",
  confidentiality: "Confidentialité",
  retention_months: "Conservation (mois)",
  sort_order: "Ordre",
  archived_at: "Archivage",
  value: "Valeur",
};

// ---------- Lecture du journal ----------

export type AuditEntry = {
  action: string;
  old_data: unknown;
  new_data: unknown;
  changed_fields: string[] | null;
};

const IGNORED_FIELDS = new Set(["updated_at", "updated_by", "created_at", "created_by", "id"]);
const REFERENCE_FIELDS = new Set(["parent_id", "job_title_id"]);

const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

export function recordLabel(data: unknown): string {
  const d = asRecord(data);
  for (const key of ["label", "name", "code", "alias"]) {
    if (typeof d[key] === "string" && d[key]) return d[key] as string;
  }
  return "";
}

function formatAuditValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Oui" : "Non";
  return String(v);
}

/** Phrases lisibles décrivant une entrée du journal (création, archivage, modifications de champs). */
export function summarizeChange(e: AuditEntry): string[] {
  const subject = recordLabel(e.new_data) || recordLabel(e.old_data);
  if (e.action === "INSERT") return [`Création de « ${subject} »`];
  if (e.action === "DELETE") return [`Suppression de « ${subject} »`];

  const oldD = asRecord(e.old_data);
  const newD = asRecord(e.new_data);
  const lines: string[] = [];
  for (const field of e.changed_fields ?? []) {
    if (IGNORED_FIELDS.has(field)) continue;
    if (field === "archived_at") {
      lines.push(
        newD["archived_at"] ? `Archivage de « ${subject} »` : `Restauration de « ${subject} »`,
      );
    } else if (REFERENCE_FIELDS.has(field)) {
      lines.push(`${FIELD_LABELS[field] ?? field} modifié`);
    } else {
      lines.push(
        `${FIELD_LABELS[field] ?? field} : ${formatAuditValue(oldD[field])} → ${formatAuditValue(newD[field])}`,
      );
    }
  }
  return lines.length ? lines : ["Mise à jour"];
}
