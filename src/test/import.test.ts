import { describe, expect, it } from "vitest";

import {
  analyzeImport,
  compareToWorkbook,
  issueCounts,
  issueReportRows,
  reconcile,
  type ImportContext,
  type SourceRow,
} from "@/lib/import/analyze";
import {
  applyMapping,
  buildMapping,
  cleanText,
  normalizeCategory,
  parseAmount,
  parseDate,
  parseYesNo,
  splitSites,
} from "@/lib/import/normalize";

describe("normalisations", () => {
  it("nettoie le texte et traite #N/A comme vide", () => {
    expect(cleanText("  Dakar   Plateau ")).toBe("Dakar Plateau");
    expect(cleanText("#N/A")).toBeNull();
    expect(cleanText("#n/a")).toBeNull();
    expect(cleanText("   ")).toBeNull();
    expect(cleanText(null)).toBeNull();
  });
  it("lit Oui/OUI/Non/NON", () => {
    expect(parseYesNo("Oui").value).toBe(true);
    expect(parseYesNo(" OUI ").value).toBe(true);
    expect(parseYesNo("Non").value).toBe(false);
    expect(parseYesNo("NON").value).toBe(false);
    expect(parseYesNo("#N/A").value).toBeNull();
    expect(parseYesNo("peut-être").error).toMatch(/Oui ou Non/);
  });
  it("corrige 40S2 en 4OS2 et 7ieme en 7EME", () => {
    expect(normalizeCategory("40S2")).toBe("4OS2");
    expect(normalizeCategory(" 4os2 ")).toBe("4OS2");
    expect(normalizeCategory("7ieme")).toBe("7EME");
    expect(normalizeCategory("7ème")).toBe("7EME");
    expect(normalizeCategory("7 EME")).toBe("7EME");
    expect(normalizeCategory("3OP1")).toBe("3OP1");
    expect(normalizeCategory("#N/A")).toBeNull();
  });
  it("lit les dates saisies en texte, en nombre ou en Date", () => {
    expect(parseDate("05/03/2024").value).toBe("2024-03-05");
    expect(parseDate("5-3-2024").value).toBe("2024-03-05");
    expect(parseDate("2024-03-05").value).toBe("2024-03-05");
    expect(parseDate("5 mars 2024").value).toBe("2024-03-05");
    expect(parseDate("1er août 2023").value).toBe("2023-08-01");
    expect(parseDate(45356).value).toBe("2024-03-05");
    expect(parseDate(new Date("2024-03-05T00:00:00Z")).value).toBe("2024-03-05");
    expect(parseDate("").value).toBeNull();
    expect(parseDate("#N/A").value).toBeNull();
  });
  it("refuse les dates impossibles ou ambiguës", () => {
    expect(parseDate("31/02/2024").error).toMatch(/invalide/);
    expect(parseDate("05/03/24").error).toMatch(/invalide/);
    expect(parseDate("bientôt").error).toMatch(/invalide/);
  });
  it("lit les montants", () => {
    expect(parseAmount("450 000").value).toBe(450000);
    expect(parseAmount("450 000 FCFA").value).toBe(450000);
    expect(parseAmount(450000.4).value).toBe(450000);
    expect(parseAmount("").value).toBeNull();
    expect(parseAmount("abc").error).toMatch(/illisible/);
  });
  it("sépare les sites, le premier est le principal", () => {
    expect(splitSites("Dakar; Sindia ;Dakar")).toEqual(["Dakar", "Sindia"]);
    expect(splitSites("#N/A")).toEqual([]);
  });
  it("applique une table de correspondance sans tenir compte de la casse ni des accents", () => {
    const t = buildMapping([{ raw: "Compta.", canonical: "Finance" }]);
    expect(applyMapping(" compta. ", t)).toEqual({ value: "Finance", unmapped: false });
    expect(applyMapping("Inconnu", t)).toEqual({ value: null, unmapped: true });
    expect(applyMapping("#N/A", t)).toEqual({ value: null, unmapped: false });
  });
});

const ctx: ImportContext = {
  today: "2026-11-10",
  fixedTermMaxMonths: 24,
  departments: buildMapping([{ raw: "PROD", canonical: "Production" }]),
  jobTitles: buildMapping([]),
  categories: buildMapping([]),
  exitReasons: buildMapping([{ raw: "fin cdd", canonical: "Expiration normale de contrat" }]),
  statusMapping: buildMapping([
    { raw: "Ouvrier", canonical: "ouvrier" },
    { raw: "Cadre", canonical: "cadre" },
  ]),
  categoryStatus: new Map([
    ["4OS2", "ouvrier"],
    ["7EME", "cadre"],
  ]),
  known: {
    departments: new Set(["production"]),
    jobTitles: new Set(["soudeur"]),
    categories: new Set(["4os2", "7eme"]),
    exitReasons: new Set(["demission"]),
    sites: new Set(["dakar", "sindia"]),
  },
};

const row = (n: number, over: Partial<SourceRow> = {}): SourceRow => ({
  rowNumber: n,
  matricule: "F001",
  last_name: "Diop",
  first_names: "Awa",
  department: "PROD",
  job_title: "Soudeur",
  category: "40S2",
  status: "Ouvrier",
  contract_type: "CDD",
  contract_start: "01/01/2025",
  contract_duration_months: 12,
  in_post: "Oui",
  salary: "300 000",
  sites: "Dakar;Sindia",
  ...over,
});

describe("analyse de l'import", () => {
  it("regroupe N contrats par employé avec une affectation initiale", () => {
    const plan = analyzeImport(
      [
        row(2),
        row(3, {
          contract_start: "01/01/2026",
          contract_type: "CDI",
          contract_duration_months: null,
          salary: "350 000",
        }),
        row(4, { matricule: "F002", first_names: "Moussa" }),
      ],
      ctx,
    );
    expect(plan.blocking).toBe(false);
    expect(plan.employees).toHaveLength(2);
    const e = plan.employees[0]!;
    expect(e.matricule).toBe("F001");
    expect(e.contracts.map((c) => [c.type, c.start])).toEqual([
      ["cdd", "2025-01-01"],
      ["cdi", "2026-01-01"],
    ]);
    expect(e.contracts[0]!.end).toBe("2025-12-31");
    expect(e.assignmentStart).toBe("2025-01-01");
    expect(e.category).toBe("4OS2");
    expect(e.department).toBe("Production");
    expect(e.sites).toEqual(["Dakar", "Sindia"]);
  });
  it("bloque les matricules manquants", () => {
    const plan = analyzeImport([row(2, { matricule: "#N/A" }), row(3, { matricule: "" })], ctx);
    expect(plan.blocking).toBe(true);
    expect(issueCounts(plan).missing_matricule).toBe(2);
    expect(plan.employees).toHaveLength(0);
  });
  it("bloque les valeurs sans correspondance", () => {
    const plan = analyzeImport(
      [row(2, { department: "Atelier ?" }), row(3, { matricule: "F9", exit_reason: "Fugue" })],
      ctx,
    );
    expect(issueCounts(plan).unmapped_value).toBe(2);
    expect(plan.blocking).toBe(true);
  });
  it("applique la correspondance des motifs de sortie", () => {
    const plan = analyzeImport(
      [row(2, { exit_reason: "Fin CDD", exit_date: "31/12/2025", in_post: "Non" })],
      ctx,
    );
    expect(plan.employees[0]!.exitReason).toBe("Expiration normale de contrat");
    expect(plan.blocking).toBe(false);
  });
  it("signale les dates invalides", () => {
    const plan = analyzeImport([row(2, { contract_start: "31/02/2025" })], ctx);
    expect(issueCounts(plan).invalid_date).toBe(1);
    expect(plan.blocking).toBe(true);
  });
  it("refuse une durée au-dessus du maximum", () => {
    const plan = analyzeImport([row(2, { contract_duration_months: 36 })], ctx);
    expect(plan.issues.find((i) => i.code === "duration_exceeds_max")?.severity).toBe("blocking");
  });
  it("déduit la durée d'une date de fin et signale l'écart", () => {
    const plan = analyzeImport(
      [row(2, { contract_duration_months: null, contract_end: "31/12/2025" })],
      ctx,
    );
    expect(plan.employees[0]!.contracts[0]).toMatchObject({
      durationMonths: 12,
      end: "2025-12-31",
    });
    const off = analyzeImport(
      [row(2, { contract_duration_months: 12, contract_end: "30/11/2025" })],
      ctx,
    );
    expect(issueCounts(off).end_date_mismatch).toBe(1);
  });
  it("détecte les contrats qui se chevauchent", () => {
    const plan = analyzeImport([row(2), row(3, { contract_start: "01/06/2025" })], ctx);
    expect(issueCounts(plan).overlap).toBe(1);
    expect(plan.blocking).toBe(true);
    // Le CDI sans fin chevauche tout contrat suivant.
    const cdi = analyzeImport(
      [
        row(2, { contract_type: "CDI", contract_duration_months: null }),
        row(3, { contract_start: "01/01/2030" }),
      ],
      ctx,
    );
    expect(issueCounts(cdi).overlap).toBe(1);
  });
  it("accepte des contrats successifs sans chevauchement", () => {
    const plan = analyzeImport([row(2), row(3, { contract_start: "01/01/2026" })], ctx);
    expect(issueCounts(plan).overlap).toBeUndefined();
  });
  it("traite les doublons : identiques ignorés, divergents bloquants", () => {
    const same = analyzeImport([row(2), row(3)], ctx);
    expect(issueCounts(same).duplicate_row).toBe(1);
    expect(same.employees[0]!.contracts).toHaveLength(1);
    expect(same.blocking).toBe(false);
    const diff = analyzeImport([row(2), row(3, { salary: "999 000" })], ctx);
    expect(issueCounts(diff).conflicting_duplicate).toBe(1);
    expect(diff.blocking).toBe(true);
  });
  it("avertit pour un CDD expiré encore en poste", () => {
    const plan = analyzeImport([row(2)], ctx); // fin 2025-12-31, en poste, aujourd'hui 2026-11-10
    expect(issueCounts(plan).expired_fixed_term_in_post).toBe(1);
    expect(plan.blocking).toBe(false);
  });
  it("avertit pour un CDI avec date de fin et l'ignore", () => {
    const plan = analyzeImport(
      [
        row(2, {
          contract_type: "CDI",
          contract_duration_months: null,
          contract_end: "31/12/2030",
        }),
      ],
      ctx,
    );
    expect(issueCounts(plan).cdi_with_end_date).toBe(1);
    expect(plan.employees[0]!.contracts[0]!.end).toBeNull();
  });
  it("avertit pour une catégorie incohérente avec le statut", () => {
    const plan = analyzeImport([row(2, { status: "Cadre" })], ctx);
    expect(issueCounts(plan).category_status_mismatch).toBe(1);
  });
  it("avertit pour un salaire manquant ou nul sans créer de rémunération", () => {
    const plan = analyzeImport(
      [row(2, { salary: "" }), row(3, { matricule: "F2", salary: 0 })],
      ctx,
    );
    expect(issueCounts(plan).missing_salary).toBe(1);
    expect(issueCounts(plan).zero_salary).toBe(1);
    expect(plan.employees.every((e) => e.contracts.every((c) => c.salary === null))).toBe(true);
  });
  it("bloque un site inconnu et un type de contrat inconnu", () => {
    const plan = analyzeImport(
      [row(2, { sites: "Mars" }), row(3, { matricule: "F3", contract_type: "intérim" })],
      ctx,
    );
    expect(issueCounts(plan).unknown_site).toBe(1);
    expect(issueCounts(plan).unknown_contract_type).toBe(1);
  });
  it("produit un rapport exportable et des totaux de recette", () => {
    const plan = analyzeImport(
      [
        row(2),
        row(3, {
          contract_start: "01/01/2026",
          contract_type: "CDI",
          contract_duration_months: null,
        }),
      ],
      ctx,
    );
    const report = issueReportRows(plan);
    expect(report[0]).toHaveLength(5);
    const rec = reconcile(plan);
    expect(rec).toMatchObject({
      employees: 1,
      contracts: 2,
      activeHeadcount: 1,
      contractsByType: { cdd: 1, cdi: 1, stage: 0, consultant: 0 },
    });
    const checks = compareToWorkbook(rec, { activeHeadcount: 1, contractsByType: { cdi: 2 } });
    expect(checks.map((c) => c.ok)).toEqual([true, false]);
  });
  it("est rejouable : les clés d'idempotence sont stables", () => {
    const a = analyzeImport([row(2), row(3, { contract_start: "01/01/2026" })], ctx);
    const b = analyzeImport([row(3, { contract_start: "01/01/2026" }), row(2)], ctx);
    expect(a.employees[0]!.contracts.map((c) => c.key)).toEqual(
      b.employees[0]!.contracts.map((c) => c.key),
    );
    expect(a.employees[0]!.contracts[0]!.key).toBe("F001|2025-01-01");
  });
});

import { gridToRows } from "@/lib/import/read";
import { TEMPLATE_COLUMNS } from "@/lib/import/template";

describe("modèle de fichier", () => {
  it("relit son propre modèle sans anomalie de structure", () => {
    const grid = [
      TEMPLATE_COLUMNS.map((c) => c.header),
      TEMPLATE_COLUMNS.map((c) => c.example[0] ?? ""),
    ];
    const { rows, missing } = gridToRows(grid);
    expect(missing).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ rowNumber: 2, matricule: "F0001", contract_type: "CDD" });
  });
  it("signale les colonnes obligatoires absentes", () => {
    expect(gridToRows([["Nom"], ["Diop"]]).missing).toEqual([
      "Matricule",
      "Type de contrat",
      "Date de début",
    ]);
  });
});
