import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { CONTRACT_TYPES, STATUS_VALUES, type ContractType } from "@/lib/employee-schemas";
import { listAll } from "@/lib/referentials";

export type EmployeeRow = Database["public"]["Views"]["v_employee_current"]["Row"];
export type MetricsRow = Database["public"]["Views"]["v_employee_metrics"]["Row"];
export type EmployeeRecord = Database["public"]["Tables"]["employees"]["Row"];
export type SensitiveRecord = Database["public"]["Tables"]["employee_sensitive"]["Row"];
export type AssignmentRecord = Database["public"]["Tables"]["assignments"]["Row"];
export type ContractRecord = Database["public"]["Tables"]["contracts"]["Row"];
export type CompensationRecord = Database["public"]["Tables"]["compensation"]["Row"];
export type DocumentRecord = Database["public"]["Tables"]["documents"]["Row"];
export type SiteLinkRecord = Database["public"]["Tables"]["employee_sites"]["Row"];
export type ExitDetailRow = Database["public"]["Views"]["v_exit_details"]["Row"];
export type EmployeeStatus = Database["public"]["Enums"]["employee_status"];

export const PAGE_SIZE = 25;

export const fullName = (e: { first_names?: string | null; last_name?: string | null }) =>
  [e.first_names, e.last_name].filter(Boolean).join(" ") || "—";

export const initials = (e: { first_names?: string | null; last_name?: string | null }) =>
  `${(e.first_names ?? "").trim().charAt(0)}${(e.last_name ?? "").trim().charAt(0)}`.toUpperCase() ||
  "?";

/** « 3 ans 4 mois », « 8 mois », « — » si inconnue. */
export function formatSeniority(months: number | null | undefined): string {
  if (months === null || months === undefined || months < 0) return "—";
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const parts = [];
  if (years > 0) parts.push(`${years} an${years > 1 ? "s" : ""}`);
  if (rest > 0 || years === 0) parts.push(`${rest} mois`);
  return parts.join(" ");
}

// ---------- Paramètres d'URL de la liste ----------

export const SORT_COLUMNS = {
  matricule: "matricule",
  nom: "last_name",
  poste: "job_title_name",
  unite: "org_unit_name",
  site: "primary_site_name",
  contrat: "contract_type",
  fin_contrat: "contract_end",
} as const;
export type SortKey = keyof typeof SORT_COLUMNS;
export type Presence = "actifs" | "sortis" | "tous";

export type EmployeeListSearch = {
  page: number;
  q: string;
  tri: SortKey;
  sens: "asc" | "desc";
  presence: Presence;
  site: string;
  unite: string;
  poste: string;
  categorie: string;
  statut: string;
  contrat: string;
  archives: boolean;
};

const asString = (v: unknown, max = 100) => (typeof v === "string" ? v.slice(0, max) : "");
const asUuid = (v: unknown) => (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : "");

/** Lecture défensive de l'URL : toute valeur inattendue retombe sur la valeur par défaut. */
export function parseListSearch(raw: Record<string, unknown>): EmployeeListSearch {
  const page = Number(raw["page"]);
  const tri = asString(raw["tri"]);
  const presence = asString(raw["presence"]);
  const statut = asString(raw["statut"]);
  const contrat = asString(raw["contrat"]);
  return {
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    q: asString(raw["q"]),
    tri: tri in SORT_COLUMNS ? (tri as SortKey) : "nom",
    sens: raw["sens"] === "desc" ? "desc" : "asc",
    presence: presence === "sortis" || presence === "tous" ? presence : "actifs",
    site: asUuid(raw["site"]),
    unite: asUuid(raw["unite"]),
    poste: asUuid(raw["poste"]),
    categorie: asUuid(raw["categorie"]),
    statut: (STATUS_VALUES as readonly string[]).includes(statut) ? statut : "",
    contrat: (CONTRACT_TYPES as readonly string[]).includes(contrat) ? contrat : "",
    archives: raw["archives"] === true || raw["archives"] === "true",
  };
}

/**
 * Terme de recherche sûr pour un filtre PostgREST `or(...)` : on retire les caractères qui
 * changeraient la syntaxe du filtre (virgule, parenthèses, guillemets) ou les jokers SQL.
 */
export function sanitizeSearchTerm(term: string): string {
  return term
    .replace(/[%_*\\,()"'`;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const searchTerms = (q: string) =>
  sanitizeSearchTerm(q)
    .split(" ")
    .filter((t) => t.length > 0)
    .slice(0, 5);

const SEARCH_COLUMNS = [
  "matricule",
  "last_name",
  "first_names",
  "email",
  "phone",
  "job_title_name",
  "org_unit_name",
] as const;

export const orFilterFor = (term: string) =>
  SEARCH_COLUMNS.map((c) => `${c}.ilike.%${term}%`).join(",");

export const LIST_COLUMNS =
  "employee_id, matricule, first_names, last_name, manager_id, birth_date, phone, email, archived_at, org_unit_id, org_unit_name, job_title_id, job_title_name, category_id, category_code, status, primary_site_id, primary_site_name, site_ids, contract_id, contract_type, contract_start, contract_end, contract_terminated_on, exit_date, is_active";

/**
 * Requête filtrée et triée de la liste (sans pagination). `unitIds` contient l'unité choisie et
 * ses descendants. Les résultats sont déjà limités par la sécurité de la base (RLS).
 */
export function employeeListQuery(
  search: EmployeeListSearch,
  unitIds: string[] | null,
  count: boolean,
) {
  let q = supabase
    .from("v_employee_current")
    .select(LIST_COLUMNS, count ? { count: "exact" } : undefined);

  if (!search.archives) q = q.is("archived_at", null);
  if (search.presence === "actifs") q = q.eq("is_active", true);
  if (search.presence === "sortis") q = q.eq("is_active", false);
  if (search.site) q = q.contains("site_ids", [search.site]);
  if (unitIds && unitIds.length > 0) q = q.in("org_unit_id", unitIds);
  if (search.poste) q = q.eq("job_title_id", search.poste);
  if (search.categorie) q = q.eq("category_id", search.categorie);
  if (search.statut) q = q.eq("status", search.statut as EmployeeStatus);
  if (search.contrat) q = q.eq("contract_type", search.contrat as ContractType);
  // Un `.or()` par mot : les mots se combinent par ET, chacun pouvant correspondre à n'importe quelle colonne.
  for (const term of searchTerms(search.q)) q = q.or(orFilterFor(term));

  const column = SORT_COLUMNS[search.tri];
  q = q.order(column, { ascending: search.sens === "asc", nullsFirst: false });
  if (column !== "last_name") q = q.order("last_name", { ascending: true });
  return q.order("first_names", { ascending: true }).order("employee_id", { ascending: true });
}

// ---------- Indicateurs calculés (âge, ancienneté, retraite) ----------

const CHUNK = 150;

export async function fetchMetrics(ids: string[]): Promise<Map<string, MetricsRow>> {
  const map = new Map<string, MetricsRow>();
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await supabase
      .from("v_employee_metrics")
      .select("employee_id, hire_date, age_years, seniority_months, retirement_date")
      .in("employee_id", ids.slice(i, i + CHUNK));
    if (error) throw error;
    for (const m of data ?? []) if (m.employee_id) map.set(m.employee_id, m as MetricsRow);
  }
  return map;
}

/** Employés en poste (hors archivés) avec leur date de naissance, pour les suivis de retraite. */
export async function listAllCurrent() {
  const rows = await listAll((from, to) =>
    supabase
      .from("v_employee_current")
      .select("employee_id, matricule, first_names, last_name, primary_site_id, org_unit_id, birth_date")
      .eq("is_active", true)
      .is("archived_at", null)
      .order("employee_id")
      .range(from, to),
  );
  return rows.flatMap((r) => (r.employee_id ? [{ ...r, employee_id: r.employee_id }] : []));
}

/** Dernière rémunération en vigueur par employé (lisible seulement avec « compensation:view »). */
export async function fetchLatestSalaries(
  ids: string[],
  today: string,
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await supabase
      .from("compensation")
      .select("employee_id, net_monthly_salary_fcfa, effective_date")
      .in("employee_id", ids.slice(i, i + CHUNK))
      .is("archived_at", null)
      .lte("effective_date", today)
      .order("effective_date", { ascending: false });
    if (error) throw error;
    for (const c of data ?? [])
      if (!map.has(c.employee_id)) map.set(c.employee_id, Number(c.net_monthly_salary_fcfa));
  }
  return map;
}

export const employeeListKey = (search: EmployeeListSearch) =>
  ["employees", "list", search] as const;

// ---------- Fiche ----------

export const employeeKey = (id: string) => ["employee", id] as const;

export const employeeQuery = (id: string) =>
  queryOptions({
    queryKey: [...employeeKey(id), "record"],
    queryFn: async () => {
      const [record, current, metrics] = await Promise.all([
        supabase.from("employees").select("*").eq("id", id).maybeSingle(),
        supabase
          .from("v_employee_current")
          .select(LIST_COLUMNS)
          .eq("employee_id", id)
          .maybeSingle(),
        supabase
          .from("v_employee_metrics")
          .select("employee_id, hire_date, age_years, seniority_months, retirement_date")
          .eq("employee_id", id)
          .maybeSingle(),
      ]);
      if (record.error) throw record.error;
      if (current.error) throw current.error;
      if (metrics.error) throw metrics.error;
      return {
        record: record.data,
        current: current.data as EmployeeRow | null,
        metrics: metrics.data as MetricsRow | null,
      };
    },
  });

/** Sélecteur de responsables : employés actifs et non archivés (lisibles selon le périmètre de l'utilisateur). */
export const managerOptionsQuery = queryOptions({
  queryKey: ["employees", "manager-options"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("v_employee_current")
      .select("employee_id, matricule, first_names, last_name")
      .eq("is_active", true)
      .is("archived_at", null)
      .order("last_name")
      .limit(1000);
    if (error) throw error;
    return data;
  },
  staleTime: 60_000,
});

// ---------- Journal d'un dossier ----------

export const EMPLOYEE_TABLE_LABELS: Record<string, string> = {
  employees: "Dossier",
  employee_sensitive: "Données sensibles",
  employee_sites: "Site",
  assignments: "Affectation",
  contracts: "Contrat",
  exits: "Sortie",
  compensation: "Rémunération",
  documents: "Document",
};

const EMPLOYEE_FIELD_LABELS: Record<string, string> = {
  matricule: "Matricule",
  last_name: "Nom",
  first_names: "Prénoms",
  birth_date: "Date de naissance",
  birth_place: "Lieu de naissance",
  address: "Adresse",
  marital_status: "Situation familiale",
  children_count: "Nombre d'enfants",
  phone: "Téléphone",
  email: "E-mail",
  manager_id: "Responsable",
  org_unit_id: "Unité",
  job_title_id: "Poste",
  category_id: "Catégorie",
  status: "Statut professionnel",
  start_date: "Date de début",
  end_date: "Date de fin",
  type: "Type",
  duration_months: "Durée (mois)",
  terminated_on: "Date de fin effective",
  net_monthly_salary_fcfa: "Salaire net mensuel",
  effective_date: "Date d'effet",
  exit_date: "Date de sortie",
  reason_id: "Motif",
  notes: "Notes",
  site_id: "Site",
  is_primary: "Site principal",
  file_name: "Fichier",
  document_type_id: "Type de document",
  document_date: "Date du document",
  expires_on: "Expiration",
  id_document_type: "Type de pièce d'identité",
  id_document_number: "Numéro de pièce d'identité",
  emergency_contact_name: "Nom du contact d'urgence",
  emergency_contact_relation: "Lien de parenté du contact d'urgence",
  emergency_contact_phone: "Téléphone du contact d'urgence",
};

/** Colonnes dont la valeur n'est qu'un identifiant technique : on signale le changement sans l'afficher. */
const ID_FIELDS = new Set([
  "manager_id",
  "org_unit_id",
  "job_title_id",
  "category_id",
  "site_id",
  "reason_id",
  "document_type_id",
]);
const SKIPPED_FIELDS = new Set([
  "updated_at",
  "updated_by",
  "created_at",
  "created_by",
  "id",
  "storage_path",
  "employee_id",
  "version",
  "replaces_document_id",
  "contract_id",
  "previous_contract_id",
]);

const rec = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

const showValue = (field: string, v: unknown): string => {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Oui" : "Non";
  if (field.endsWith("_date") || field.endsWith("_on") || field === "end_date") {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  }
  return String(v);
};

/**
 * Phrases lisibles pour une entrée du journal d'un dossier. Les données sensibles (pièce
 * d'identité, contact d'urgence) ne sont jamais recopiées : seul le nom du champ modifié apparaît.
 */
export function summarizeEmployeeChange(entry: {
  action: string;
  table_name: string;
  old_data: unknown;
  new_data: unknown;
  changed_fields: string[] | null;
}): string[] {
  const noun = EMPLOYEE_TABLE_LABELS[entry.table_name] ?? entry.table_name;
  const oldD = rec(entry.old_data);
  const newD = rec(entry.new_data);
  const sensitive = entry.table_name === "employee_sensitive";

  if (entry.action === "INSERT") return [`${noun} : création`];
  if (entry.action === "DELETE") return [`${noun} : suppression`];

  const lines: string[] = [];
  for (const field of entry.changed_fields ?? []) {
    if (SKIPPED_FIELDS.has(field)) continue;
    if (field === "archived_at") {
      lines.push(newD["archived_at"] ? `${noun} : archivé` : `${noun} : restauré`);
      continue;
    }
    const label = EMPLOYEE_FIELD_LABELS[field] ?? field;
    if (sensitive || ID_FIELDS.has(field)) lines.push(`${noun} : ${label} modifié`);
    else
      lines.push(
        `${noun} : ${label} ${showValue(field, oldD[field])} → ${showValue(field, newD[field])}`,
      );
  }
  return lines.length ? lines : [`${noun} : mise à jour`];
}

// ---------- URL propre ----------

export const DEFAULT_LIST_SEARCH: EmployeeListSearch = {
  page: 1,
  q: "",
  tri: "nom",
  sens: "asc",
  presence: "actifs",
  site: "",
  unite: "",
  poste: "",
  categorie: "",
  statut: "",
  contrat: "",
  archives: false,
};

/** Ne garde dans l'URL que les valeurs qui diffèrent des valeurs par défaut. */
export function compactSearch(s: EmployeeListSearch): Partial<EmployeeListSearch> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(DEFAULT_LIST_SEARCH) as (keyof EmployeeListSearch)[]) {
    if (s[key] !== DEFAULT_LIST_SEARCH[key]) out[key] = s[key];
  }
  return out as Partial<EmployeeListSearch>;
}

export const FICHE_TABS = [
  "identite",
  "poste",
  "contrats",
  "remuneration",
  "documents",
  "historique",
] as const;
export type FicheTab = (typeof FICHE_TABS)[number];
export const isFicheTab = (v: unknown): v is FicheTab =>
  typeof v === "string" && (FICHE_TABS as readonly string[]).includes(v);
