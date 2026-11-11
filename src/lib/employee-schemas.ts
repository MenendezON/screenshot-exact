import { z } from "zod";

import { isCountryCode } from "@/lib/countries";

/**
 * Validation des formulaires du module Employés. Tous les messages sont en français.
 * Les champs de formulaire sont des chaînes (vide = non renseigné) ; les fonctions `to…Payload`
 * convertissent vers les colonnes de la base.
 */

// Messages par défaut de zod, en français (filet de sécurité derrière les messages propres à chaque champ).
z.setErrorMap((issue, ctx) => {
  switch (issue.code) {
    case "invalid_type":
      return {
        message:
          issue.received === "undefined" ? "Ce champ est obligatoire." : "Valeur non valide.",
      };
    case "too_small":
      if (issue.type === "string") {
        return {
          message:
            issue.minimum === 1
              ? "Ce champ est obligatoire."
              : `Au moins ${issue.minimum} caractères.`,
        };
      }
      return { message: `La valeur doit être d'au moins ${issue.minimum}.` };
    case "too_big":
      if (issue.type === "string") return { message: `${issue.maximum} caractères au plus.` };
      return { message: `La valeur ne doit pas dépasser ${issue.maximum}.` };
    case "invalid_string":
      if (issue.validation === "email") return { message: "Adresse e-mail non valide." };
      return { message: "Format non valide." };
    case "invalid_enum_value":
      return { message: "Choisissez une valeur dans la liste." };
    default:
      return { message: ctx.defaultError };
  }
});

export const REQUIRED = "Ce champ est obligatoire.";

// ---------- Outils ----------

const pad = (n: number) => String(n).padStart(2, "0");
export const toIsoDate = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayIso = () => toIsoDate(new Date());

/** Vrai pour une date réelle au format AAAA-MM-JJ (refuse 2026-02-31). */
export function isIsoDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

/** Fin d'un contrat à durée déterminée : début + durée − 1 jour (même règle que la base). */
export function computeContractEnd(start: string, months: number): string | null {
  if (!isIsoDate(start) || !Number.isInteger(months) || months <= 0) return null;
  const [y, m, d] = start.split("-").map(Number) as [number, number, number];
  const total = m - 1 + months;
  const ty = y + Math.floor(total / 12);
  const tm = total % 12;
  // Dernier jour du mois cible : la base borne comme PostgreSQL (31 janvier + 1 mois = fin février).
  const lastDay = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  const end = new Date(Date.UTC(ty, tm, Math.min(d, lastDay)));
  end.setUTCDate(end.getUTCDate() - 1);
  return end.toISOString().slice(0, 10);
}

const text = (label: string, max: number) =>
  z.string().trim().max(max, `${label} : ${max} caractères au plus.`);

const requiredText = (label: string, max: number) =>
  z
    .string({ required_error: REQUIRED })
    .trim()
    .min(1, REQUIRED)
    .max(max, `${label} : ${max} caractères au plus.`);

const optionalDate = (label: string) =>
  z.string().refine((v) => v === "" || isIsoDate(v), `${label} : date non valide.`);

const requiredDate = (label: string) =>
  z
    .string({ required_error: REQUIRED })
    .min(1, REQUIRED)
    .refine(isIsoDate, `${label} : date non valide.`);

const phone = (label: string) =>
  z
    .string()
    .trim()
    .refine(
      (v) =>
        v === "" ||
        (/^\+?[0-9 .()-]+$/.test(v) &&
          v.replace(/\D/g, "").length >= 8 &&
          v.replace(/\D/g, "").length <= 15),
      `${label} : numéro non valide (8 à 15 chiffres, par exemple +221 77 123 45 67).`,
    );

const uuid = (message: string) => z.string({ required_error: message }).uuid(message);
export const optionalUuid = z
  .string()
  .refine((v) => v === "" || z.string().uuid().safeParse(v).success, "Choix non valide.");

export const emptyToNull = (v: string): string | null => (v.trim() === "" ? null : v.trim());

// ---------- Identité ----------

export const MARITAL_STATUS = ["celibataire", "marie", "divorce", "veuf"] as const;
export const MARITAL_LABELS: Record<(typeof MARITAL_STATUS)[number], string> = {
  celibataire: "Célibataire",
  marie: "Marié(e)",
  divorce: "Divorcé(e)",
  veuf: "Veuf / veuve",
};

export const employeeSchema = z
  .object({
    matricule: requiredText("Le matricule", 30).refine(
      (v) => /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(v),
      "Le matricule ne peut contenir que des lettres, chiffres, point, tiret et barre oblique.",
    ),
    lastName: requiredText("Le nom", 100),
    firstNames: requiredText("Les prénoms", 150),
    birthDate: optionalDate("Date de naissance"),
    birthPlace: text("Le lieu de naissance", 100),
    address: text("L'adresse", 300),
    maritalStatus: z
      .string()
      .refine(
        (v) => v === "" || (MARITAL_STATUS as readonly string[]).includes(v),
        "Choisissez une valeur dans la liste.",
      ),
    childrenCount: z
      .string()
      .trim()
      .refine(
        (v) => v === "" || /^\d+$/.test(v),
        "Le nombre d'enfants doit être un entier positif ou nul.",
      )
      .refine((v) => v === "" || Number(v) <= 30, "Le nombre d'enfants ne peut pas dépasser 30."),
    phone: phone("Téléphone"),
    email: z
      .string()
      .trim()
      .max(150, "L'adresse e-mail : 150 caractères au plus.")
      .refine(
        (v) => v === "" || z.string().email().safeParse(v).success,
        "Adresse e-mail non valide.",
      ),
    professionalEmail: z
      .string()
      .trim()
      .max(150, "L'adresse e-mail professionnelle : 150 caractères au plus.")
      .refine(
        (v) => v === "" || z.string().email().safeParse(v).success,
        "Adresse e-mail non valide.",
      ),
    nationalityCode: z
      .string()
      .refine((v) => v === "" || isCountryCode(v), "Choisissez un pays dans la liste."),
    managerId: optionalUuid,
  })
  .superRefine((v, ctx) => {
    if (!v.birthDate || !isIsoDate(v.birthDate)) return;
    const today = todayIso();
    const [by, bm, bd] = v.birthDate.split("-").map(Number) as [number, number, number];
    const [ty, tm, td] = today.split("-").map(Number) as [number, number, number];
    const age = ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
    if (v.birthDate > today) {
      ctx.addIssue({
        code: "custom",
        path: ["birthDate"],
        message: "La date de naissance ne peut pas être dans le futur.",
      });
    } else if (age < 14 || age > 100) {
      ctx.addIssue({
        code: "custom",
        path: ["birthDate"],
        message: "La date de naissance n'est pas plausible (âge entre 14 et 100 ans).",
      });
    }
  });
export type EmployeeForm = z.infer<typeof employeeSchema>;

export function toEmployeePayload(v: EmployeeForm) {
  return {
    matricule: v.matricule.trim().toUpperCase(),
    last_name: v.lastName.trim(),
    first_names: v.firstNames.trim(),
    birth_date: emptyToNull(v.birthDate),
    birth_place: emptyToNull(v.birthPlace),
    address: emptyToNull(v.address),
    marital_status:
      (emptyToNull(v.maritalStatus) as (typeof MARITAL_STATUS)[number] | null) ?? null,
    children_count: v.childrenCount === "" ? 0 : Number(v.childrenCount),
    phone: emptyToNull(v.phone),
    email: emptyToNull(v.email),
    professional_email: emptyToNull(v.professionalEmail),
    nationality_code: emptyToNull(v.nationalityCode),
    manager_id: emptyToNull(v.managerId),
  };
}

// ---------- Données sensibles ----------

/** Liens de parenté proposés pour le contact d'urgence. La valeur enregistrée est le libellé. */
export const KINSHIP_OPTIONS = [
  "Conjoint(e)",
  "Père",
  "Mère",
  "Enfant",
  "Frère",
  "Sœur",
  "Oncle / Tante",
  "Grand-parent",
  "Ami(e)",
  "Collègue",
  "Autre",
] as const;

export const ID_DOCUMENT_TYPES = ["cni", "passport", "consular_card"] as const;
export const ID_DOCUMENT_LABELS: Record<(typeof ID_DOCUMENT_TYPES)[number], string> = {
  cni: "Carte nationale d'identité",
  passport: "Passeport",
  consular_card: "Carte consulaire",
};

export const sensitiveSchema = z
  .object({
    idDocumentType: z
      .string()
      .refine(
        (v) => v === "" || (ID_DOCUMENT_TYPES as readonly string[]).includes(v),
        "Choisissez une valeur dans la liste.",
      ),
    idDocumentNumber: text("Le numéro de pièce", 50),
    emergencyName: text("Le nom du contact", 150),
    emergencyRelation: text("Le lien de parenté", 100),
    emergencyPhone: phone("Téléphone du contact"),
  })
  .superRefine((v, ctx) => {
    if (v.idDocumentNumber && !v.idDocumentType) {
      ctx.addIssue({
        code: "custom",
        path: ["idDocumentType"],
        message: "Indiquez le type de pièce d'identité.",
      });
    }
    // Un contact d'urgence n'est utile que s'il est joignable et identifié : nom, lien et téléphone vont ensemble.
    if (v.emergencyName && !v.emergencyPhone) {
      ctx.addIssue({
        code: "custom",
        path: ["emergencyPhone"],
        message: "Indiquez le téléphone de ce contact.",
      });
    }
    if (v.emergencyName && !v.emergencyRelation) {
      ctx.addIssue({
        code: "custom",
        path: ["emergencyRelation"],
        message: "Indiquez le lien de parenté.",
      });
    }
    if (!v.emergencyName && (v.emergencyPhone || v.emergencyRelation)) {
      ctx.addIssue({
        code: "custom",
        path: ["emergencyName"],
        message: "Indiquez le nom du contact.",
      });
    }
    if (v.idDocumentType && !v.idDocumentNumber) {
      ctx.addIssue({
        code: "custom",
        path: ["idDocumentNumber"],
        message: "Indiquez le numéro de la pièce.",
      });
    }
  });
export type SensitiveForm = z.infer<typeof sensitiveSchema>;

export function toSensitivePayload(v: SensitiveForm) {
  return {
    id_document_type:
      (emptyToNull(v.idDocumentType) as (typeof ID_DOCUMENT_TYPES)[number] | null) ?? null,
    id_document_number: emptyToNull(v.idDocumentNumber),
    emergency_contact_name: emptyToNull(v.emergencyName),
    emergency_contact_relation: emptyToNull(v.emergencyRelation),
    emergency_contact_phone: emptyToNull(v.emergencyPhone),
  };
}

// ---------- Affectation ----------

export const STATUS_VALUES = [
  "cadre",
  "agent_maitrise",
  "employe",
  "ouvrier",
  "stagiaire",
] as const;

/** `previousStart` : la nouvelle affectation doit commencer strictement après la précédente. */
export const assignmentSchema = (previousStart: string | null) =>
  z
    .object({
      orgUnitId: uuid("Choisissez une unité."),
      jobTitleId: uuid("Choisissez un poste."),
      categoryId: optionalUuid,
      status: z
        .string()
        .refine(
          (v) => v === "" || (STATUS_VALUES as readonly string[]).includes(v),
          "Choisissez une valeur dans la liste.",
        ),
      startDate: requiredDate("Date de début"),
    })
    .superRefine((v, ctx) => {
      if (isIsoDate(v.startDate) && previousStart && v.startDate <= previousStart) {
        const [y, m, d] = previousStart.split("-");
        ctx.addIssue({
          code: "custom",
          path: ["startDate"],
          message: `La nouvelle affectation doit commencer après le ${d}/${m}/${y}.`,
        });
      }
    });
export type AssignmentForm = z.infer<ReturnType<typeof assignmentSchema>>;

// ---------- Contrat ----------

export const CONTRACT_TYPES = ["cdi", "cdd", "stage", "consultant"] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];
export const CONTRACT_LABELS: Record<ContractType, string> = {
  cdi: "CDI",
  cdd: "CDD",
  stage: "Stage",
  consultant: "Consultant",
};

/** `maxMonths` : paramètre « durée maximale d'un contrat à durée déterminée » (null si illisible). */
export const contractSchema = (maxMonths: number | null) =>
  z
    .object({
      type: z.enum(CONTRACT_TYPES, {
        errorMap: () => ({ message: "Choisissez un type de contrat." }),
      }),
      startDate: requiredDate("Date de début"),
      durationMonths: z.string().trim(),
    })
    .superRefine((v, ctx) => {
      if (v.type === "cdi") {
        if (v.durationMonths !== "") {
          ctx.addIssue({
            code: "custom",
            path: ["durationMonths"],
            message: "Un CDI n'a pas de durée : laissez ce champ vide.",
          });
        }
        return;
      }
      if (v.durationMonths === "") {
        ctx.addIssue({
          code: "custom",
          path: ["durationMonths"],
          message: "La durée en mois est obligatoire pour ce type de contrat.",
        });
        return;
      }
      if (!/^\d+$/.test(v.durationMonths) || Number(v.durationMonths) < 1) {
        ctx.addIssue({
          code: "custom",
          path: ["durationMonths"],
          message: "La durée doit être un nombre entier de mois, d'au moins 1.",
        });
      } else if (maxMonths !== null && Number(v.durationMonths) > maxMonths) {
        ctx.addIssue({
          code: "custom",
          path: ["durationMonths"],
          message: `Durée maximale dépassée : ${maxMonths} mois au plus.`,
        });
      }
    });
export type ContractForm = z.infer<ReturnType<typeof contractSchema>>;

// ---------- Rémunération ----------

export const compensationSchema = z.object({
  amount: z
    .string({ required_error: REQUIRED })
    .trim()
    .min(1, REQUIRED)
    .transform((v) => v.replace(/[\s\u202f\u00a0]/g, ""))
    .refine((v) => /^\d+$/.test(v), "Saisissez un montant entier en FCFA, sans décimales.")
    .refine((v) => Number(v) > 0, "Le montant doit être supérieur à 0.")
    .refine(
      (v) => Number(v) <= 100_000_000,
      "Le montant semble trop élevé (100 000 000 FCFA au plus).",
    ),
  effectiveDate: requiredDate("Date d'effet"),
  contractId: optionalUuid,
});
export type CompensationForm = z.input<typeof compensationSchema>;

// ---------- Sortie ----------

/** `lastContractStart` : une sortie ne peut précéder le début du dernier contrat. */
export const exitSchema = (lastContractStart: string | null) =>
  z
    .object({
      exitDate: requiredDate("Date de sortie"),
      reasonId: uuid("Choisissez un motif de sortie."),
      notes: text("Les notes", 1000),
    })
    .superRefine((v, ctx) => {
      if (isIsoDate(v.exitDate) && lastContractStart && v.exitDate < lastContractStart) {
        ctx.addIssue({
          code: "custom",
          path: ["exitDate"],
          message: "La date de sortie ne peut pas précéder le début du dernier contrat.",
        });
      }
    });
export type ExitForm = z.infer<ReturnType<typeof exitSchema>>;

// ---------- Document ----------

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const DOCUMENT_MIME_TYPES: Record<string, string> = {
  "application/pdf": "PDF",
  "image/jpeg": "JPEG",
  "image/png": "PNG",
};

/** Contrôle du fichier choisi ; renvoie un message en français ou null. */
export function validateDocumentFile(
  file: { name: string; size: number; type: string } | null | undefined,
): string | null {
  if (!file) return "Choisissez un fichier.";
  if (file.size === 0) return "Le fichier est vide.";
  if (file.size > MAX_DOCUMENT_BYTES) return "Le fichier dépasse 10 Mo.";
  if (!DOCUMENT_MIME_TYPES[file.type]) return "Format non accepté : PDF, JPEG ou PNG.";
  return null;
}

/** Nom de fichier sûr pour le chemin de stockage (sans accents, séparateurs ni caractères spéciaux). */
export function safeFileName(name: string): string {
  const cleaned = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^[._]+/, "")
    .slice(-100);
  return cleaned || "document";
}

export const documentSchema = z
  .object({
    documentTypeId: uuid("Choisissez un type de document."),
    documentDate: optionalDate("Date du document"),
    expiresOn: optionalDate("Date d'expiration"),
    description: z.string().trim().max(500, "La description : 500 caractères au plus."),
  })
  .superRefine((v, ctx) => {
    if (
      v.documentDate &&
      v.expiresOn &&
      isIsoDate(v.documentDate) &&
      isIsoDate(v.expiresOn) &&
      v.expiresOn < v.documentDate
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["expiresOn"],
        message: "L'expiration ne peut pas précéder la date du document.",
      });
    }
  });
export type DocumentForm = z.infer<typeof documentSchema>;
