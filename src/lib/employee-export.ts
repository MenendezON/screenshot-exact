import { CONTRACT_LABELS, type ContractType } from "@/lib/employee-schemas";
import { formatSeniority, type EmployeeRow, type MetricsRow } from "@/lib/employees";
import { STATUS_LABELS } from "@/lib/referentials";

export const EXPORT_ROW_LIMIT = 10_000;

export type ExportContext = {
  metrics: Map<string, MetricsRow>;
  /** Présent seulement si l'utilisateur a le droit d'exporter les rémunérations. */
  salaries: Map<string, number> | null;
};

export type ExportCell = string | number | null;
export type ExportColumn = {
  header: string;
  width: number;
  value: (row: EmployeeRow, ctx: ExportContext) => ExportCell;
};

const fr = (iso: string | null | undefined) => {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};

const BASE_COLUMNS: ExportColumn[] = [
  { header: "Matricule", width: 14, value: (r) => r.matricule },
  { header: "Nom", width: 22, value: (r) => r.last_name },
  { header: "Prénoms", width: 24, value: (r) => r.first_names },
  { header: "Poste", width: 28, value: (r) => r.job_title_name },
  { header: "Unité", width: 26, value: (r) => r.org_unit_name },
  { header: "Site principal", width: 18, value: (r) => r.primary_site_name },
  { header: "Catégorie", width: 12, value: (r) => r.category_code },
  {
    header: "Statut professionnel",
    width: 20,
    value: (r) => (r.status ? STATUS_LABELS[r.status] : null),
  },
  {
    header: "Type de contrat",
    width: 14,
    value: (r) => (r.contract_type ? CONTRACT_LABELS[r.contract_type as ContractType] : null),
  },
  { header: "Début du contrat", width: 16, value: (r) => fr(r.contract_start) },
  {
    header: "Fin du contrat",
    width: 16,
    value: (r) => fr(r.contract_terminated_on ?? r.contract_end),
  },
  {
    header: "Date d'entrée",
    width: 16,
    value: (r, c) => fr(c.metrics.get(r.employee_id ?? "")?.hire_date),
  },
  {
    header: "Ancienneté",
    width: 16,
    value: (r, c) => formatSeniority(c.metrics.get(r.employee_id ?? "")?.seniority_months),
  },
  {
    header: "Âge",
    width: 8,
    value: (r, c) => c.metrics.get(r.employee_id ?? "")?.age_years ?? null,
  },
  {
    header: "Date de retraite",
    width: 16,
    value: (r, c) => fr(c.metrics.get(r.employee_id ?? "")?.retirement_date),
  },
  {
    header: "Genre",
    width: 8,
    value: (r) => (r.gender === "F" ? "Femme" : r.gender === "M" ? "Homme" : null),
  },
  { header: "Téléphone", width: 18, value: (r) => r.phone },
  { header: "E-mail", width: 28, value: (r) => r.email },
  {
    header: "Situation",
    width: 12,
    value: (r) => (r.archived_at ? "Archivé" : r.is_active ? "Actif" : "Sorti"),
  },
  { header: "Date de sortie", width: 16, value: (r) => fr(r.exit_date) },
];

const SALARY_COLUMN: ExportColumn = {
  header: "Salaire net mensuel (FCFA)",
  width: 24,
  value: (r, c) => c.salaries?.get(r.employee_id ?? "") ?? null,
};

/**
 * Colonnes exportées selon les permissions : la rémunération n'est incluse que pour les rôles
 * autorisés à l'exporter. Les pièces d'identité et contacts d'urgence ne sont jamais exportés.
 */
export function exportColumns(canExportSalary: boolean): ExportColumn[] {
  return canExportSalary ? [...BASE_COLUMNS, SALARY_COLUMN] : BASE_COLUMNS;
}

export function buildExportRows(
  rows: EmployeeRow[],
  columns: ExportColumn[],
  ctx: ExportContext,
): ExportCell[][] {
  return rows.map((row) => columns.map((c) => c.value(row, ctx)));
}

/**
 * Neutralise l'injection de formules : un tableur interprète une cellule qui commence par
 * = + - @ (ou tabulation / retour chariot) comme une formule. On la préfixe d'une apostrophe.
 */
export function neutralizeFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function csvCell(value: ExportCell): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "number" ? String(value) : neutralizeFormula(value);
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV pour Excel en français : séparateur « ; », fins de ligne CRLF et BOM UTF-8 pour les accents. */
export function toCsv(headers: string[], rows: ExportCell[][]): string {
  const lines = [headers, ...rows].map((r) => r.map(csvCell).join(";"));
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function exportFileName(extension: "csv" | "xlsx", today = new Date()): string {
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return `employes-${iso}.${extension}`;
}

export function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadCsv(columns: ExportColumn[], rows: ExportCell[][]) {
  const blob = new Blob(
    [
      toCsv(
        columns.map((c) => c.header),
        rows,
      ),
    ],
    { type: "text/csv;charset=utf-8" },
  );
  triggerDownload(blob, exportFileName("csv"));
}

export async function downloadXlsx(columns: ExportColumn[], rows: ExportCell[][]) {
  // Chargé à la demande : la bibliothèque n'alourdit pas le reste de l'application.
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const header = columns.map((c) => ({
    value: c.header,
    type: String,
    fontWeight: "bold" as const,
  }));
  const data = [
    header,
    ...rows.map((r) =>
      r.map((cell) =>
        typeof cell === "number"
          ? { value: cell, type: Number }
          : // Toujours typé « String » : une valeur textuelle n'est jamais interprétée comme formule.
            { value: cell ?? "", type: String },
      ),
    ),
  ];
  const blob = await writeXlsxFile(data, {
    columns: columns.map((c) => ({ width: c.width })),
  }).toBlob();
  triggerDownload(blob, exportFileName("xlsx"));
}
