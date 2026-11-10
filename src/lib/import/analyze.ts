import { addDays, daysBetween } from "@/lib/contracts";
import { computeContractEnd, CONTRACT_TYPES, type ContractType } from "@/lib/employee-schemas";
import {
  applyMapping,
  cleanText,
  foldKey,
  normalizeCategory,
  parseAmount,
  parseDate,
  parseInteger,
  parseYesNo,
  splitSites,
  type MappingTable,
} from "./normalize";

/** Champs canoniques d'une ligne source (une ligne = un contrat). Les en-têtes du classeur y sont rattachés. */
export type SourceRow = {
  rowNumber: number;
  matricule?: unknown;
  last_name?: unknown;
  first_names?: unknown;
  birth_date?: unknown;
  department?: unknown;
  job_title?: unknown;
  category?: unknown;
  status?: unknown;
  contract_type?: unknown;
  contract_start?: unknown;
  contract_duration_months?: unknown;
  contract_end?: unknown;
  in_post?: unknown;
  exit_date?: unknown;
  exit_reason?: unknown;
  salary?: unknown;
  sites?: unknown;
};

export type Severity = "blocking" | "warning";
export type IssueCode =
  | "missing_matricule"
  | "duplicate_row"
  | "conflicting_duplicate"
  | "invalid_value"
  | "invalid_date"
  | "unknown_contract_type"
  | "missing_start"
  | "missing_duration"
  | "duration_exceeds_max"
  | "end_date_mismatch"
  | "overlap"
  | "expired_fixed_term_in_post"
  | "cdi_with_end_date"
  | "category_status_mismatch"
  | "missing_salary"
  | "zero_salary"
  | "unmapped_value"
  | "identity_conflict"
  | "unknown_site";

export type Issue = {
  rowNumber: number;
  matricule: string | null;
  code: IssueCode;
  severity: Severity;
  message: string;
};

export const ISSUE_LABELS: Record<IssueCode, string> = {
  missing_matricule: "Matricule manquant",
  duplicate_row: "Ligne en double (ignorée)",
  conflicting_duplicate: "Doublon aux valeurs différentes",
  invalid_value: "Valeur invalide",
  invalid_date: "Date invalide",
  unknown_contract_type: "Type de contrat inconnu",
  missing_start: "Date de début manquante",
  missing_duration: "Durée manquante",
  duration_exceeds_max: "Durée au-dessus du maximum",
  end_date_mismatch: "Fin incohérente avec la durée",
  overlap: "Contrats qui se chevauchent",
  expired_fixed_term_in_post: "CDD expiré encore en poste",
  cdi_with_end_date: "CDI avec date de fin",
  category_status_mismatch: "Catégorie incohérente avec le statut",
  missing_salary: "Salaire manquant",
  zero_salary: "Salaire égal à 0",
  unmapped_value: "Valeur sans correspondance",
  identity_conflict: "Identité différente selon les lignes",
  unknown_site: "Site inconnu",
};

export type ImportContext = {
  today: string;
  fixedTermMaxMonths: number | null;
  departments: MappingTable;
  jobTitles: MappingTable;
  categories: MappingTable;
  exitReasons: MappingTable;
  /** Noms (clés de comparaison) déjà présents dans les référentiels : acceptés sans table de correspondance. */
  known: {
    departments: Set<string>;
    jobTitles: Set<string>;
    categories: Set<string>;
    exitReasons: Set<string>;
    sites: Set<string>;
  };
  /** Statut professionnel par défaut de chaque catégorie (code canonique). */
  categoryStatus: Map<string, string>;
  statusMapping: MappingTable;
};

export type PlannedContract = {
  rowNumber: number;
  type: ContractType;
  start: string;
  durationMonths: number | null;
  end: string | null;
  salary: number | null;
  /** Clé d'idempotence : matricule et date de début de contrat. */
  key: string;
};

export type PlannedEmployee = {
  matricule: string;
  lastName: string | null;
  firstNames: string | null;
  birthDate: string | null;
  department: string | null;
  jobTitle: string | null;
  category: string | null;
  status: string | null;
  sites: string[];
  inPost: boolean | null;
  exitDate: string | null;
  exitReason: string | null;
  contracts: PlannedContract[];
  /** Affectation initiale : valeurs de la première ligne, à la date de début du premier contrat. */
  assignmentStart: string | null;
};

export type ImportPlan = {
  employees: PlannedEmployee[];
  issues: Issue[];
  blocking: boolean;
  rowCount: number;
};

export const contractKey = (matricule: string, start: string) => `${matricule}|${start}`;
const normMatricule = (v: unknown) => cleanText(v)?.replace(/\s+/g, "").toUpperCase() ?? null;

function resolve(raw: unknown, table: MappingTable, known: Set<string>) {
  const text = cleanText(raw);
  if (text === null)
    return { value: null as string | null, unmapped: false, raw: null as string | null };
  const mapped = applyMapping(text, table);
  if (!mapped.unmapped) return { ...mapped, raw: text };
  if (known.has(foldKey(text))) return { value: text, unmapped: false, raw: text };
  return { value: null, unmapped: true, raw: text };
}

type Parsed = {
  row: SourceRow;
  matricule: string;
  employee: Omit<PlannedEmployee, "contracts" | "assignmentStart">;
  contract: PlannedContract | null;
};

/** Valide et normalise les lignes, puis les regroupe par matricule : un employé, N contrats. */
export function analyzeImport(rows: SourceRow[], ctx: ImportContext): ImportPlan {
  const issues: Issue[] = [];
  const add = (
    row: SourceRow,
    matricule: string | null,
    code: IssueCode,
    severity: Severity,
    message: string,
  ) => issues.push({ rowNumber: row.rowNumber, matricule, code, severity, message });

  const parsed: Parsed[] = [];
  const seenKeys = new Map<string, { row: SourceRow; signature: string }>();

  for (const row of rows) {
    const matricule = normMatricule(row.matricule);
    if (!matricule) {
      add(
        row,
        null,
        "missing_matricule",
        "blocking",
        "Le matricule est manquant : la ligne ne peut pas être rattachée à un employé.",
      );
      continue;
    }
    const bad = (code: IssueCode, message: string, severity: Severity = "blocking") =>
      add(row, matricule, code, severity, message);

    const date = (label: string, v: unknown) => {
      const p = parseDate(v);
      if (p.error) bad("invalid_date", `${label} : ${p.error}`);
      return p.value;
    };
    const birth = date("Date de naissance", row.birth_date);
    const start = date("Début du contrat", row.contract_start);
    const rawEnd = date("Fin du contrat", row.contract_end);
    const exitDate = date("Date de sortie", row.exit_date);

    const inPost = parseYesNo(row.in_post);
    if (inPost.error) bad("invalid_value", `En poste : ${inPost.error}`);

    const typeText = foldKey(row.contract_type);
    const type = (CONTRACT_TYPES as readonly string[]).includes(typeText)
      ? (typeText as ContractType)
      : null;
    if (!type)
      bad(
        "unknown_contract_type",
        `Type de contrat « ${cleanText(row.contract_type) ?? "vide"} » inconnu (CDI, CDD, stage, consultant).`,
      );

    const dept = resolve(row.department, ctx.departments, ctx.known.departments);
    const job = resolve(row.job_title, ctx.jobTitles, ctx.known.jobTitles);
    const catRaw = normalizeCategory(row.category);
    const cat = resolve(catRaw, ctx.categories, ctx.known.categories);
    const reason = resolve(row.exit_reason, ctx.exitReasons, ctx.known.exitReasons);
    const status = resolve(row.status, ctx.statusMapping, new Set());
    for (const [label, r] of [
      ["Département", dept],
      ["Poste", job],
      ["Catégorie", cat],
      ["Motif de sortie", reason],
    ] as const) {
      if (r.unmapped) bad("unmapped_value", `${label} : « ${r.raw} » n'a pas de correspondance.`);
    }

    // Durée : fournie, ou déduite de la fin.
    let duration: number | null = null;
    const dur = parseInteger(row.contract_duration_months);
    if (dur.error) bad("invalid_value", `Durée : ${dur.error}`);
    duration = dur.value;
    let end: string | null = null;
    if (type === "cdi") {
      if (rawEnd)
        bad(
          "cdi_with_end_date",
          `CDI avec une date de fin (${rawEnd}) : elle est ignorée.`,
          "warning",
        );
    } else if (type && start) {
      if (duration === null && rawEnd) {
        duration = Math.max(1, Math.round(daysBetween(start, addDays(rawEnd, 1)) / 30.4375));
      }
      if (duration === null)
        bad("missing_duration", "Durée manquante et aucune date de fin pour la déduire.");
      else {
        if (ctx.fixedTermMaxMonths !== null && duration > ctx.fixedTermMaxMonths)
          bad(
            "duration_exceeds_max",
            `Durée de ${duration} mois : le maximum est ${ctx.fixedTermMaxMonths} mois.`,
          );
        end = computeContractEnd(start, duration);
        if (rawEnd && end && rawEnd !== end)
          bad(
            "end_date_mismatch",
            `Fin saisie ${rawEnd}, mais début + ${duration} mois donne ${end} (la valeur calculée est retenue).`,
            "warning",
          );
      }
    }
    if (!start && type) bad("missing_start", "La date de début du contrat est manquante.");

    const salaryP = parseAmount(row.salary);
    if (salaryP.error) bad("invalid_value", `Salaire : ${salaryP.error}`);
    if (salaryP.value === null && !salaryP.error)
      bad("missing_salary", "Salaire manquant : aucune rémunération ne sera créée.", "warning");
    if (salaryP.value === 0)
      bad("zero_salary", "Salaire égal à 0 : aucune rémunération ne sera créée.", "warning");
    const salary = salaryP.value && salaryP.value > 0 ? salaryP.value : null;

    if (cat.value && status.value) {
      const expected = ctx.categoryStatus.get(cat.value);
      if (expected && expected !== status.value)
        bad(
          "category_status_mismatch",
          `Catégorie ${cat.value} (statut attendu : ${expected}) mais statut « ${status.value} ».`,
          "warning",
        );
    }

    for (const site of splitSites(row.sites)) {
      if (!ctx.known.sites.has(foldKey(site)))
        bad("unknown_site", `Site « ${site} » absent des référentiels.`);
    }

    // Expiré mais toujours en poste.
    if (type && type !== "cdi" && end && end < ctx.today && inPost.value === true && !exitDate)
      bad(
        "expired_fixed_term_in_post",
        `Contrat échu le ${end} mais l'employé est marqué en poste, sans sortie.`,
        "warning",
      );

    const contract =
      type && start
        ? {
            rowNumber: row.rowNumber,
            type,
            start,
            durationMonths: type === "cdi" ? null : duration,
            end,
            salary,
            key: contractKey(matricule, start),
          }
        : null;

    // Doublons : même matricule et même début de contrat.
    if (contract) {
      const signature = JSON.stringify([type, duration, salary, inPost.value, exitDate]);
      const prev = seenKeys.get(contract.key);
      if (prev) {
        if (prev.signature === signature)
          bad(
            "duplicate_row",
            `Doublon de la ligne ${prev.row.rowNumber} (même matricule et même début) : ignoré.`,
            "warning",
          );
        else
          bad(
            "conflicting_duplicate",
            `Même matricule et même début que la ligne ${prev.row.rowNumber} mais des valeurs différentes.`,
          );
        continue;
      }
      seenKeys.set(contract.key, { row, signature });
    }

    parsed.push({
      row,
      matricule,
      contract,
      employee: {
        matricule,
        lastName: cleanText(row.last_name),
        firstNames: cleanText(row.first_names),
        birthDate: birth,
        department: dept.value,
        jobTitle: job.value,
        category: cat.value,
        status: status.value,
        sites: splitSites(row.sites),
        inPost: inPost.value,
        exitDate,
        exitReason: reason.value,
      },
    });
  }

  // ---------- Regroupement par matricule ----------
  const byMatricule = new Map<string, Parsed[]>();
  for (const p of parsed)
    byMatricule.set(p.matricule, [...(byMatricule.get(p.matricule) ?? []), p]);

  const employees: PlannedEmployee[] = [];
  for (const [matricule, group] of byMatricule) {
    const contracts = group
      .flatMap((g) => (g.contract ? [g.contract] : []))
      .sort((a, b) => a.start.localeCompare(b.start));
    // Identité : première ligne ; on signale une divergence de nom ou de naissance.
    const first = group[0]!;
    for (const g of group.slice(1)) {
      const a = first.employee;
      const b = g.employee;
      if (
        (a.lastName && b.lastName && foldKey(a.lastName) !== foldKey(b.lastName)) ||
        (a.birthDate && b.birthDate && a.birthDate !== b.birthDate)
      )
        issues.push({
          rowNumber: g.row.rowNumber,
          matricule,
          code: "identity_conflict",
          severity: "warning",
          message:
            "Nom ou date de naissance différent de la première ligne de ce matricule (la première est retenue).",
        });
    }
    // Chevauchement entre contrats du même employé (fin effective : sortie, sinon fin calculée).
    for (let i = 1; i < contracts.length; i++) {
      const prev = contracts[i - 1]!;
      const cur = contracts[i]!;
      if (prev.type === "cdi" || (prev.end !== null && prev.end >= cur.start))
        issues.push({
          rowNumber: cur.rowNumber,
          matricule,
          code: "overlap",
          severity: "blocking",
          message: `Le contrat du ${cur.start} chevauche celui du ${prev.start}${prev.end ? ` (fin ${prev.end})` : " (CDI sans fin)"}.`,
        });
    }
    // Sortie : la plus tardive renseignée sur les lignes du matricule.
    const exits = group
      .map((g) => g.employee.exitDate)
      .filter((d): d is string => !!d)
      .sort();
    const last = group[group.length - 1]!.employee;
    employees.push({
      ...first.employee,
      // Poste actuel : dernière ligne (le contrat le plus récent).
      department: last.department ?? first.employee.department,
      jobTitle: last.jobTitle ?? first.employee.jobTitle,
      category: last.category ?? first.employee.category,
      status: last.status ?? first.employee.status,
      sites: last.sites.length ? last.sites : first.employee.sites,
      inPost: last.inPost,
      exitDate: exits.at(-1) ?? null,
      exitReason:
        group
          .map((g) => g.employee.exitReason)
          .filter(Boolean)
          .at(-1) ?? null,
      contracts,
      assignmentStart: contracts[0]?.start ?? null,
    });
  }

  issues.sort((a, b) => a.rowNumber - b.rowNumber);
  return {
    employees: employees.sort((a, b) => a.matricule.localeCompare(b.matricule, "fr")),
    issues,
    blocking: issues.some((i) => i.severity === "blocking"),
    rowCount: rows.length,
  };
}

// ---------- Rapport et recette ----------

export function issueCounts(plan: ImportPlan): Record<IssueCode, number> {
  const out = {} as Record<IssueCode, number>;
  for (const i of plan.issues) out[i.code] = (out[i.code] ?? 0) + 1;
  return out;
}

/** Lignes du rapport d'anomalies, prêtes pour l'export CSV/XLSX. */
export function issueReportRows(plan: ImportPlan): (string | number | null)[][] {
  return plan.issues.map((i) => [
    i.rowNumber,
    i.matricule,
    ISSUE_LABELS[i.code],
    i.severity === "blocking" ? "Bloquant" : "Avertissement",
    i.message,
  ]);
}
export const ISSUE_REPORT_HEADERS = ["Ligne", "Matricule", "Anomalie", "Gravité", "Détail"];

export type Reconciliation = {
  activeHeadcount: number;
  contractsByType: Record<ContractType, number>;
  employees: number;
  contracts: number;
};

/** Totaux du plan d'import, à comparer à ceux du classeur (recette). */
export function reconcile(plan: ImportPlan): Reconciliation {
  const byType: Record<ContractType, number> = { cdi: 0, cdd: 0, stage: 0, consultant: 0 };
  let contracts = 0;
  for (const e of plan.employees)
    for (const c of e.contracts) {
      byType[c.type]++;
      contracts++;
    }
  return {
    activeHeadcount: plan.employees.filter((e) => e.inPost === true && !e.exitDate).length,
    contractsByType: byType,
    employees: plan.employees.length,
    contracts,
  };
}

export type ReconciliationCheck = {
  label: string;
  imported: number;
  workbook: number;
  ok: boolean;
};

export function compareToWorkbook(
  rec: Reconciliation,
  totals: { activeHeadcount?: number; contractsByType?: Partial<Record<ContractType, number>> },
): ReconciliationCheck[] {
  const checks: ReconciliationCheck[] = [];
  const push = (label: string, imported: number, workbook: number | undefined) => {
    if (workbook !== undefined)
      checks.push({ label, imported, workbook, ok: imported === workbook });
  };
  push("Effectif actif", rec.activeHeadcount, totals.activeHeadcount);
  for (const t of CONTRACT_TYPES)
    push(`Contrats ${t.toUpperCase()}`, rec.contractsByType[t], totals.contractsByType?.[t]);
  return checks;
}
