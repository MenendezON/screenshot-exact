import { EMPLOYEE_TABLE_LABELS } from "@/lib/employees";
import {
  TABLE_LABELS as REFERENTIAL_TABLE_LABELS,
  FIELD_LABELS as REFERENTIAL_FIELD_LABELS,
} from "@/lib/referentials";
import { ROLE_LABELS, type AppRole } from "@/lib/roles";

export const AUDIT_TABLE_LABELS: Record<string, string> = {
  ...REFERENTIAL_TABLE_LABELS,
  ...EMPLOYEE_TABLE_LABELS,
  profiles: "Profil utilisateur",
  user_roles: "Rôle d'un utilisateur",
  user_scopes: "Périmètre d'un utilisateur",
  roles: "Rôle",
  permissions: "Permission",
  role_permissions: "Permission d'un rôle",
  notifications: "Notification",
  document_access_log: "Accès à un document",
  auth_users: "Compte (authentification)",
};

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  INSERT: "Création",
  UPDATE: "Modification",
  DELETE: "Suppression",
};

const FIELD_LABELS: Record<string, string> = {
  ...REFERENTIAL_FIELD_LABELS,
  full_name: "Nom",
  email: "E-mail",
  role: "Rôle",
  user_id: "Utilisateur",
  scope: "Périmètre",
  site_id: "Site",
  org_unit_id: "Unité",
  matricule: "Matricule",
  last_name: "Nom",
  first_names: "Prénoms",
  birth_date: "Date de naissance",
  phone: "Téléphone",
  status: "Statut professionnel",
  start_date: "Date de début",
  end_date: "Date de fin",
  duration_months: "Durée (mois)",
  terminated_on: "Date de fin effective",
  net_monthly_salary_fcfa: "Salaire net mensuel",
  effective_date: "Date d'effet",
  exit_date: "Date de sortie",
  notes: "Notes",
  file_name: "Fichier",
  document_date: "Date du document",
  expires_on: "Expiration",
  read_at: "Lecture",
  action: "Action",
  resource: "Ressource",
};

const TECHNICAL = new Set([
  "id",
  "created_at",
  "created_by",
  "updated_at",
  "updated_by",
  "storage_path",
]);
/** Tables dont le contenu ne doit jamais être recopié dans l'écran du journal. */
const MASKED_TABLES = new Set(["employee_sensitive", "employee_reviews"]);

export const tableLabel = (t: string) => AUDIT_TABLE_LABELS[t] ?? t;
export const fieldLabel = (f: string) => FIELD_LABELS[f] ?? f;

const rec = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

export function displayAuditValue(table: string, field: string, v: unknown): string {
  if (MASKED_TABLES.has(table)) return "valeur masquée";
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Oui" : "Non";
  if (field === "role" && typeof v === "string") return ROLE_LABELS[v as AppRole] ?? v;
  if (field === "scope" && typeof v === "string") {
    return (
      (
        {
          all: "Tout",
          site: "Ses sites",
          unit: "Ses unités",
          team: "Son équipe",
          self: "Lui-même",
        } as Record<string, string>
      )[v] ?? v
    );
  }
  if (typeof v === "string") {
    const date = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(v);
    if (date && (field.endsWith("_date") || field.endsWith("_on") || field.endsWith("_at"))) {
      return date[4]
        ? `${date[3]}/${date[2]}/${date[1]} ${date[4]}:${date[5]}`
        : `${date[3]}/${date[2]}/${date[1]}`;
    }
  }
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export type DiffLine = {
  field: string;
  label: string;
  before: string | null;
  after: string | null;
};

/**
 * Avant / après d'une entrée du journal. Modification : seuls les champs changés. Création :
 * les valeurs renseignées (après). Suppression : les valeurs supprimées (avant).
 */
export function auditDiff(entry: {
  action: string;
  table_name: string;
  old_data: unknown;
  new_data: unknown;
  changed_fields: string[] | null;
}): DiffLine[] {
  const o = rec(entry.old_data);
  const n = rec(entry.new_data);
  const show = (f: string, v: unknown) => displayAuditValue(entry.table_name, f, v);
  const keep = (f: string) => !TECHNICAL.has(f);

  if (entry.action === "UPDATE") {
    return (entry.changed_fields ?? []).filter(keep).map((f) => ({
      field: f,
      label: fieldLabel(f),
      before: show(f, o[f]),
      after: show(f, n[f]),
    }));
  }
  const source = entry.action === "DELETE" ? o : n;
  return Object.keys(source)
    .filter((f) => keep(f) && source[f] !== null && source[f] !== "")
    .filter((f) => !(f === "archived_at"))
    .map((f) => ({
      field: f,
      label: fieldLabel(f),
      before: entry.action === "DELETE" ? show(f, source[f]) : null,
      after: entry.action === "DELETE" ? null : show(f, source[f]),
    }));
}

export type AuditFilters = {
  user?: string | undefined;
  table?: string | undefined;
  action?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
};

/** Bornes ISO d'une période de jours civils (Africa/Dakar = UTC) : [début, fin exclue). */
export function periodBounds(from?: string, to?: string): { gte?: string; lt?: string } {
  const out: { gte?: string; lt?: string } = {};
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) out.gte = `${from}T00:00:00Z`;
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    const d = new Date(`${to}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    out.lt = d.toISOString();
  }
  return out;
}
