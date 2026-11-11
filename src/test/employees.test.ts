import { describe, expect, it } from "vitest";

import {
  assignmentSchema,
  compensationSchema,
  computeContractEnd,
  contractSchema,
  documentSchema,
  employeeSchema,
  exitSchema,
  isIsoDate,
  KINSHIP_OPTIONS,
  safeFileName,
  sensitiveSchema,
  toEmployeePayload,
  validateDocumentFile,
} from "@/lib/employee-schemas";
import {
  exportColumns,
  buildExportRows,
  neutralizeFormula,
  toCsv,
  exportFileName,
} from "@/lib/employee-export";
import {
  compactSearch,
  DEFAULT_LIST_SEARCH,
  formatSeniority,
  orFilterFor,
  parseListSearch,
  sanitizeSearchTerm,
  searchTerms,
  summarizeEmployeeChange,
  type EmployeeRow,
} from "@/lib/employees";
import { mfaCodeError } from "@/lib/mfa";
import { buildOrgChart } from "@/lib/org-chart";
import type { OrgUnit } from "@/lib/referentials";

const messages = (result: {
  success: boolean;
  error?: { issues: { path: (string | number)[]; message: string }[] };
}) =>
  // Le formulaire affiche la première erreur de chaque champ : on garde donc la première.
  (result.error?.issues ?? []).reduce<Record<string, string>>((acc, i) => {
    const key = i.path.join(".");
    if (!(key in acc)) acc[key] = i.message;
    return acc;
  }, {});

const validEmployee = {
  matricule: "FM-0042",
  lastName: "Diop",
  firstNames: "Awa",
  birthDate: "1990-05-12",
  birthPlace: "",
  address: "",
  maritalStatus: "",
  childrenCount: "2",
  phone: "+221 77 123 45 67",
  email: "awa@example.sn",
  gender: "F",
  professionalEmail: "",
  nationalityCode: "",
  managerId: "",
};

describe("formulaire employé", () => {
  it("accepte un dossier valide et prépare le payload (matricule en majuscules, vides → null)", () => {
    const parsed = employeeSchema.safeParse({ ...validEmployee, matricule: "fm-0042" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      const p = toEmployeePayload(parsed.data);
      expect(p.matricule).toBe("FM-0042");
      expect(p.birth_place).toBeNull();
      expect(p.children_count).toBe(2);
      expect(p.manager_id).toBeNull();
    }
  });

  it("signale les champs obligatoires en français", () => {
    const m = messages(
      employeeSchema.safeParse({ ...validEmployee, matricule: "", lastName: " ", firstNames: "" }),
    );
    expect(m["matricule"]).toBe("Ce champ est obligatoire.");
    expect(m["lastName"]).toBe("Ce champ est obligatoire.");
    expect(m["firstNames"]).toBe("Ce champ est obligatoire.");
  });

  it("refuse un matricule avec des caractères interdits", () => {
    expect(
      messages(employeeSchema.safeParse({ ...validEmployee, matricule: "FM 42;" }))["matricule"],
    ).toMatch(/lettres, chiffres/);
  });

  it("contrôle la date de naissance : futur, âge invraisemblable, date inexistante", () => {
    expect(
      messages(employeeSchema.safeParse({ ...validEmployee, birthDate: "2999-01-01" }))[
        "birthDate"
      ],
    ).toMatch(/futur/);
    expect(
      messages(employeeSchema.safeParse({ ...validEmployee, birthDate: "1850-01-01" }))[
        "birthDate"
      ],
    ).toMatch(/plausible/);
    expect(
      messages(employeeSchema.safeParse({ ...validEmployee, birthDate: "2020-01-01" }))[
        "birthDate"
      ],
    ).toMatch(/plausible/);
    expect(
      messages(employeeSchema.safeParse({ ...validEmployee, birthDate: "1990-02-31" }))[
        "birthDate"
      ],
    ).toMatch(/non valide/);
  });

  it("contrôle téléphone, e-mail et nombre d'enfants", () => {
    const m = messages(
      employeeSchema.safeParse({
        ...validEmployee,
        phone: "abc",
        email: "pas-un-mail",
        childrenCount: "-1",
      }),
    );
    expect(m["phone"]).toMatch(/numéro non valide/);
    expect(m["email"]).toBe("Adresse e-mail non valide.");
    expect(m["childrenCount"]).toMatch(/entier positif/);
    expect(employeeSchema.safeParse({ ...validEmployee, phone: "", email: "" }).success).toBe(true);
  });

  it("exige le type quand un numéro de pièce est saisi, et inversement", () => {
    const base = {
      idDocumentType: "",
      idDocumentNumber: "",
      emergencyName: "",
      emergencyRelation: "",
      emergencyPhone: "",
    };
    expect(
      messages(sensitiveSchema.safeParse({ ...base, idDocumentNumber: "123" }))["idDocumentType"],
    ).toMatch(/type de pièce/);
    expect(
      messages(sensitiveSchema.safeParse({ ...base, idDocumentType: "cni" }))["idDocumentNumber"],
    ).toMatch(/numéro/);
    expect(sensitiveSchema.safeParse(base).success).toBe(true);
  });

  it("lie le nom, le lien de parenté et le téléphone du contact d'urgence", () => {
    const base = {
      idDocumentType: "",
      idDocumentNumber: "",
      emergencyName: "",
      emergencyRelation: "",
      emergencyPhone: "",
    };
    const nameOnly = messages(sensitiveSchema.safeParse({ ...base, emergencyName: "Moussa Diop" }));
    expect(nameOnly["emergencyPhone"]).toBe("Indiquez le téléphone de ce contact.");
    expect(nameOnly["emergencyRelation"]).toBe("Indiquez le lien de parenté.");
    const phoneOnly = messages(
      sensitiveSchema.safeParse({ ...base, emergencyPhone: "+221 77 123 45 67" }),
    );
    expect(phoneOnly["emergencyName"]).toBe("Indiquez le nom du contact.");
    expect(
      sensitiveSchema.safeParse({
        ...base,
        emergencyName: "Moussa Diop",
        emergencyRelation: "Frère",
        emergencyPhone: "+221 77 123 45 67",
      }).success,
    ).toBe(true);
  });

  it("propose une liste de liens de parenté qui inclut les cas courants", () => {
    expect(KINSHIP_OPTIONS).toEqual(
      expect.arrayContaining(["Conjoint(e)", "Père", "Mère", "Frère", "Sœur", "Autre"]),
    );
    expect(new Set(KINSHIP_OPTIONS).size).toBe(KINSHIP_OPTIONS.length);
  });
});

describe("dates et contrats", () => {
  it("valide les dates réelles seulement", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-02-31")).toBe(false);
    expect(isIsoDate("28/02/2026")).toBe(false);
  });

  it("calcule la fin d'un CDD comme la base (début + durée − 1 jour, fin de mois bornée)", () => {
    expect(computeContractEnd("2026-01-01", 6)).toBe("2026-06-30");
    expect(computeContractEnd("2026-03-15", 12)).toBe("2027-03-14");
    expect(computeContractEnd("2026-01-31", 1)).toBe("2026-02-27");
    expect(computeContractEnd("2026-01-01", 0)).toBeNull();
    expect(computeContractEnd("n'importe quoi", 3)).toBeNull();
  });

  it("applique les règles de durée selon le type de contrat", () => {
    const schema = contractSchema(24);
    const base = { startDate: "2026-01-01" };
    expect(schema.safeParse({ ...base, type: "cdi", durationMonths: "" }).success).toBe(true);
    expect(
      messages(schema.safeParse({ ...base, type: "cdi", durationMonths: "6" }))["durationMonths"],
    ).toMatch(/pas de durée/);
    expect(
      messages(schema.safeParse({ ...base, type: "cdd", durationMonths: "" }))["durationMonths"],
    ).toMatch(/obligatoire/);
    expect(
      messages(schema.safeParse({ ...base, type: "cdd", durationMonths: "30" }))["durationMonths"],
    ).toBe("Durée maximale dépassée : 24 mois au plus.");
    expect(
      messages(schema.safeParse({ ...base, type: "cdd", durationMonths: "1,5" }))["durationMonths"],
    ).toMatch(/nombre entier/);
    expect(schema.safeParse({ ...base, type: "cdd", durationMonths: "12" }).success).toBe(true);
    expect(
      contractSchema(null).safeParse({ ...base, type: "cdd", durationMonths: "99" }).success,
    ).toBe(true);
  });

  it("impose qu'une affectation commence après la précédente", () => {
    const schema = assignmentSchema("2026-03-01");
    const ids = {
      orgUnitId: crypto.randomUUID(),
      jobTitleId: crypto.randomUUID(),
      categoryId: "",
      status: "",
    };
    expect(messages(schema.safeParse({ ...ids, startDate: "2026-03-01" }))["startDate"]).toBe(
      "La nouvelle affectation doit commencer après le 01/03/2026.",
    );
    expect(schema.safeParse({ ...ids, startDate: "2026-03-02" }).success).toBe(true);
    expect(
      messages(schema.safeParse({ ...ids, orgUnitId: "", startDate: "2026-04-01" }))["orgUnitId"],
    ).toBe("Choisissez une unité.");
  });

  it("refuse une sortie antérieure au début du dernier contrat", () => {
    const schema = exitSchema("2026-02-01");
    const reasonId = crypto.randomUUID();
    expect(
      messages(schema.safeParse({ exitDate: "2026-01-15", reasonId, notes: "" }))["exitDate"],
    ).toMatch(/précéder le début/);
    expect(schema.safeParse({ exitDate: "2026-02-01", reasonId, notes: "" }).success).toBe(true);
    expect(
      messages(schema.safeParse({ exitDate: "2026-02-10", reasonId: "", notes: "" }))["reasonId"],
    ).toMatch(/motif/);
  });
});

describe("rémunération et documents", () => {
  it("accepte un montant avec séparateurs de milliers et le convertit en entier", () => {
    const parsed = compensationSchema.safeParse({
      amount: "450 000",
      effectiveDate: "2026-01-01",
      contractId: "",
    });
    expect(parsed.success && parsed.data.amount).toBe("450000");
  });

  it("refuse décimales, zéro et montants excessifs", () => {
    const check = (amount: string) =>
      messages(compensationSchema.safeParse({ amount, effectiveDate: "2026-01-01" }))["amount"];
    expect(check("450000,50")).toMatch(/entier/);
    expect(check("0")).toMatch(/supérieur à 0/);
    expect(check("999999999999")).toMatch(/trop élevé/);
    expect(check("")).toBe("Ce champ est obligatoire.");
  });

  it("contrôle le fichier déposé (taille, format, vide)", () => {
    expect(validateDocumentFile(null)).toMatch(/Choisissez/);
    expect(validateDocumentFile({ name: "a.pdf", size: 0, type: "application/pdf" })).toMatch(
      /vide/,
    );
    expect(
      validateDocumentFile({ name: "a.pdf", size: 11 * 1024 * 1024, type: "application/pdf" }),
    ).toMatch(/10 Mo/);
    expect(
      validateDocumentFile({ name: "a.exe", size: 100, type: "application/x-msdownload" }),
    ).toMatch(/Format non accepté/);
    expect(validateDocumentFile({ name: "a.pdf", size: 100, type: "application/pdf" })).toBeNull();
  });

  it("assainit le nom de fichier pour le chemin de stockage", () => {
    expect(safeFileName("Contrat été 2026 (signé).pdf")).toBe("Contrat_ete_2026_signe_.pdf");
    expect(safeFileName("../../etc/passwd")).not.toContain("/");
    expect(safeFileName("???")).toBe("document");
    expect(safeFileName("")).toBe("document");
  });

  it("refuse une expiration antérieure à la date du document", () => {
    const id = crypto.randomUUID();
    expect(
      messages(
        documentSchema.safeParse({
          documentTypeId: id,
          documentDate: "2026-05-01",
          expiresOn: "2026-04-01",
          description: "",
        }),
      )["expiresOn"],
    ).toMatch(/précéder/);
  });
});

describe("liste : URL, recherche et tri", () => {
  it("retombe sur les valeurs par défaut face à une URL manipulée", () => {
    const s = parseListSearch({
      page: "-3",
      tri: "DROP TABLE",
      sens: "x",
      presence: "??",
      site: "pas-un-uuid",
      statut: "roi",
      contrat: "cdz",
      q: 42,
    });
    expect(s).toEqual(DEFAULT_LIST_SEARCH);
  });

  it("lit des filtres valides et les compacte pour l'URL", () => {
    const id = "11111111-2222-3333-4444-555555555555";
    const s = parseListSearch({
      page: "3",
      tri: "poste",
      sens: "desc",
      site: id,
      statut: "cadre",
      archives: "true",
    });
    expect(s).toMatchObject({
      page: 3,
      tri: "poste",
      sens: "desc",
      site: id,
      statut: "cadre",
      archives: true,
    });
    expect(compactSearch(DEFAULT_LIST_SEARCH)).toEqual({});
    expect(compactSearch({ ...DEFAULT_LIST_SEARCH, page: 2 })).toEqual({ page: 2 });
  });

  it("neutralise les caractères qui casseraient le filtre PostgREST ou les jokers SQL", () => {
    expect(sanitizeSearchTerm('a,b)c(d"e%f_g*h\\i')).toBe("a b c d e f g h i");
    expect(searchTerms("  Awa   Diop ")).toEqual(["Awa", "Diop"]);
    expect(searchTerms("%%% ,,,")).toEqual([]);
    expect(orFilterFor("diop")).toContain("last_name.ilike.%diop%");
    expect(orFilterFor("diop").split(",")).toHaveLength(7);
    expect(searchTerms("a b c d e f g h")).toHaveLength(5);
  });

  it("formate l'ancienneté", () => {
    expect(formatSeniority(0)).toBe("0 mois");
    expect(formatSeniority(8)).toBe("8 mois");
    expect(formatSeniority(12)).toBe("1 an");
    expect(formatSeniority(40)).toBe("3 ans 4 mois");
    expect(formatSeniority(null)).toBe("—");
  });
});

describe("export", () => {
  const row = {
    employee_id: "e1",
    matricule: "FM-1",
    last_name: '=HYPERLINK("http://x")',
    first_names: 'Awa; "la grande"',
    job_title_name: "Soudeur",
    org_unit_name: null,
    primary_site_name: "Dakar",
    category_code: "B2",
    status: "ouvrier",
    contract_type: "cdd",
    contract_start: "2026-01-01",
    contract_end: "2026-06-30",
    contract_terminated_on: null,
    phone: null,
    email: null,
    archived_at: null,
    is_active: true,
    exit_date: null,
  } as unknown as EmployeeRow;

  it("neutralise l'injection de formules et échappe séparateurs et guillemets", () => {
    expect(neutralizeFormula("=1+1")).toBe("'=1+1");
    expect(neutralizeFormula("@cmd")).toBe("'@cmd");
    expect(neutralizeFormula("-5")).toBe("'-5");
    expect(neutralizeFormula("Awa")).toBe("Awa");
    const csv = toCsv(["Nom", "Prénoms"], [[row.last_name, row.first_names]]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain('"Awa; ""la grande"""');
    expect(csv.split("\r\n")).toHaveLength(3);
  });

  it("n'inclut la rémunération que pour les rôles autorisés, et jamais les pièces d'identité", () => {
    const without = exportColumns(false).map((c) => c.header);
    const withSalary = exportColumns(true).map((c) => c.header);
    expect(without.some((h) => /salaire/i.test(h))).toBe(false);
    expect(withSalary).toContain("Salaire net mensuel (FCFA)");
    expect([...without, ...withSalary].some((h) => /pièce|urgence|identité/i.test(h))).toBe(false);
  });

  it("construit les lignes avec dates en français et valeurs manquantes vides", () => {
    const cols = exportColumns(true);
    const metrics = new Map([
      [
        "e1",
        {
          employee_id: "e1",
          hire_date: "2024-03-05",
          age_years: 36,
          seniority_months: 20,
          retirement_date: "2050-05-12",
        },
      ],
    ]);
    const [line] = buildExportRows([row], cols, { metrics, salaries: new Map([["e1", 450000]]) });
    const at = (h: string) => line?.[cols.findIndex((c) => c.header === h)];
    expect(at("Début du contrat")).toBe("01/01/2026");
    expect(at("Date d'entrée")).toBe("05/03/2024");
    expect(at("Ancienneté")).toBe("1 an 8 mois");
    expect(at("Âge")).toBe(36);
    expect(at("Unité")).toBeNull();
    expect(at("Salaire net mensuel (FCFA)")).toBe(450000);
    expect(at("Situation")).toBe("Actif");
  });

  it("nomme le fichier avec la date du jour", () => {
    expect(exportFileName("csv", new Date(2026, 10, 10))).toBe("employes-2026-11-10.csv");
    expect(exportFileName("xlsx", new Date(2026, 0, 5))).toBe("employes-2026-01-05.xlsx");
  });
});

describe("journal d'un dossier", () => {
  it("ne recopie jamais les données sensibles", () => {
    const lines = summarizeEmployeeChange({
      action: "UPDATE",
      table_name: "employee_sensitive",
      old_data: { id_document_number: "SECRET-1" },
      new_data: { id_document_number: "SECRET-2" },
      changed_fields: ["id_document_number", "updated_at"],
    });
    expect(lines).toEqual(["Données sensibles : Numéro de pièce d'identité modifié"]);
    expect(lines.join(" ")).not.toMatch(/SECRET/);
  });

  it("décrit changements de valeur, d'archivage et références", () => {
    expect(
      summarizeEmployeeChange({
        action: "UPDATE",
        table_name: "employees",
        old_data: { last_name: "Dop" },
        new_data: { last_name: "Diop" },
        changed_fields: ["last_name"],
      }),
    ).toEqual(["Dossier : Nom Dop → Diop"]);
    expect(
      summarizeEmployeeChange({
        action: "UPDATE",
        table_name: "employees",
        old_data: {},
        new_data: { archived_at: "2026-11-10" },
        changed_fields: ["archived_at"],
      }),
    ).toEqual(["Dossier : archivé"]);
    expect(
      summarizeEmployeeChange({
        action: "UPDATE",
        table_name: "assignments",
        old_data: { org_unit_id: "a" },
        new_data: { org_unit_id: "b" },
        changed_fields: ["org_unit_id"],
      }),
    ).toEqual(["Affectation : Unité modifié"]);
    expect(
      summarizeEmployeeChange({
        action: "UPDATE",
        table_name: "contracts",
        old_data: { start_date: "2026-01-01" },
        new_data: { start_date: "2026-02-01" },
        changed_fields: ["start_date"],
      }),
    ).toEqual(["Contrat : Date de début 01/01/2026 → 01/02/2026"]);
    expect(
      summarizeEmployeeChange({
        action: "INSERT",
        table_name: "documents",
        old_data: null,
        new_data: {},
        changed_fields: null,
      }),
    ).toEqual(["Document : création"]);
  });
});

describe("organigramme", () => {
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
  const emp = (
    id: string,
    unitId: string | null,
    sites: string[],
    extra: Partial<EmployeeRow> = {},
  ) =>
    ({
      employee_id: id,
      last_name: id,
      first_names: "X",
      matricule: id,
      org_unit_id: unitId,
      site_ids: sites,
      is_active: true,
      archived_at: null,
      manager_id: null,
      job_title_name: null,
      primary_site_name: null,
      ...extra,
    }) as EmployeeRow;

  const units = [
    unit("prod", null, "direction"),
    unit("usinage", "prod", "departement"),
    unit("rh", null, "direction"),
    unit("ancienne", null, "direction", { archived_at: "x" }),
  ];
  const rows = [
    emp("a", "usinage", ["dakar"]),
    emp("b", "usinage", ["sindia"], { manager_id: null }),
    emp("c", "rh", ["dakar"]),
    emp("d", null, ["dakar"]),
    emp("e", "ancienne", ["dakar"]),
    emp("f", "rh", ["dakar"], { is_active: false }),
  ];

  it("regroupe par unité, avec effectifs cumulés et collaborateurs sans unité active", () => {
    const chart = buildOrgChart(units, rows, "");
    const prod = chart.roots.find((r) => r.unit.id === "prod");
    expect(prod?.total).toBe(2);
    expect(prod?.children[0]?.members.map((m) => m.id)).toEqual(["a", "b"]);
    expect(chart.unassigned.map((m) => m.id).sort()).toEqual(["d", "e"]);
    expect(chart.total).toBe(5);
  });

  it("filtre par site et retire les branches vides", () => {
    const chart = buildOrgChart(units, rows, "sindia");
    expect(chart.total).toBe(1);
    expect(chart.roots.map((r) => r.unit.id)).toEqual(["prod"]);
    expect(chart.roots[0]?.children[0]?.members.map((m) => m.id)).toEqual(["b"]);
    expect(chart.unassigned).toEqual([]);
  });

  it("repère les responsables", () => {
    const chart = buildOrgChart(
      units,
      [emp("boss", "rh", ["dakar"]), emp("n1", "rh", ["dakar"], { manager_id: "boss" })],
      "",
    );
    const members = chart.roots.find((r) => r.unit.id === "rh")?.members ?? [];
    expect(members.find((m) => m.id === "boss")?.isManager).toBe(true);
    expect(members.find((m) => m.id === "n1")?.isManager).toBe(false);
  });
});

describe("double authentification", () => {
  it("valide le code à 6 chiffres", () => {
    expect(mfaCodeError("")).toMatch(/Saisissez/);
    expect(mfaCodeError("12345")).toMatch(/6 chiffres/);
    expect(mfaCodeError("12a456")).toMatch(/6 chiffres/);
    expect(mfaCodeError("123 456")).toBeNull();
    expect(mfaCodeError("123456")).toBeNull();
  });
});
