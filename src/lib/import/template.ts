import { triggerDownload } from "@/lib/employee-export";
import type { SourceRow } from "./analyze";

type Field = Exclude<keyof SourceRow, "rowNumber">;

/** Colonnes du modèle : en-tête affiché, champ canonique, aide, exemple. */
export const TEMPLATE_COLUMNS: Array<{
  header: string;
  field: Field;
  help: string;
  example: string[];
}> = [
  {
    header: "Matricule",
    field: "matricule",
    help: "Obligatoire. Une ligne = un contrat ; répéter le matricule pour chaque contrat.",
    example: ["F0001", "F0001"],
  },
  { header: "Nom", field: "last_name", help: "Nom de famille.", example: ["Diop", "Diop"] },
  { header: "Prénoms", field: "first_names", help: "Prénoms.", example: ["Awa", "Awa"] },
  {
    header: "Genre",
    field: "gender",
    help: "Femme ou Homme (F ou M accepté). Facultatif.",
    example: ["Femme", "Femme"],
  },
  {
    header: "Date de naissance",
    field: "birth_date",
    help: "JJ/MM/AAAA.",
    example: ["14/03/1990", "14/03/1990"],
  },
  {
    header: "Département",
    field: "department",
    help: "Nom du département (rapproché de l'organigramme).",
    example: ["Production", "Production"],
  },
  {
    header: "Poste",
    field: "job_title",
    help: "Intitulé du poste.",
    example: ["Soudeur", "Soudeur"],
  },
  { header: "Catégorie", field: "category", help: "Ex. 4OS2, 7EME.", example: ["4OS2", "4OS2"] },
  {
    header: "Statut",
    field: "status",
    help: "Ouvrier, Employé, Maîtrise, Cadre…",
    example: ["Ouvrier", "Ouvrier"],
  },
  {
    header: "Type de contrat",
    field: "contract_type",
    help: "CDI, CDD, Stage ou Consultant.",
    example: ["CDD", "CDI"],
  },
  {
    header: "Date de début",
    field: "contract_start",
    help: "JJ/MM/AAAA. Obligatoire.",
    example: ["01/01/2024", "01/01/2025"],
  },
  {
    header: "Durée (mois)",
    field: "contract_duration_months",
    help: "Obligatoire pour CDD/Stage/Consultant, vide pour un CDI.",
    example: ["12", ""],
  },
  {
    header: "Date de fin",
    field: "contract_end",
    help: "Facultatif : recalculée à partir du début et de la durée.",
    example: ["31/12/2024", ""],
  },
  { header: "En poste", field: "in_post", help: "Oui ou Non.", example: ["Non", "Oui"] },
  {
    header: "Date de sortie",
    field: "exit_date",
    help: "JJ/MM/AAAA, si l'employé est sorti.",
    example: ["31/12/2024", ""],
  },
  {
    header: "Motif de sortie",
    field: "exit_reason",
    help: "Motif normalisé de la liste des motifs.",
    example: ["Fin de CDD", ""],
  },
  {
    header: "Salaire net mensuel",
    field: "salary",
    help: "En FCFA, sans symbole.",
    example: ["300000", "350000"],
  },
  {
    header: "Sites",
    field: "sites",
    help: "Plusieurs sites séparés par « ; » — le premier est le site principal.",
    example: ["Dakar;Sindia", "Dakar;Sindia"],
  },
];

export const TEMPLATE_SHEET = "Contrats";

export async function downloadImportTemplate(kind: "xlsx" | "csv") {
  if (kind === "csv") {
    const q = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const lines = [
      TEMPLATE_COLUMNS.map((c) => q(c.header)).join(";"),
      ...[0, 1].map((i) => TEMPLATE_COLUMNS.map((c) => q(c.example[i] ?? "")).join(";")),
    ];
    triggerDownload(
      new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }),
      "modele-import-contrats.csv",
    );
    return;
  }
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const head = TEMPLATE_COLUMNS.map((c) => ({
    value: c.header,
    type: String,
    fontWeight: "bold" as const,
  }));
  const ex = [0, 1].map((i) =>
    TEMPLATE_COLUMNS.map((c) => ({ value: c.example[i] ?? "", type: String })),
  );
  const help = [
    [
      { value: "Colonne", type: String, fontWeight: "bold" as const },
      { value: "Consigne", type: String, fontWeight: "bold" as const },
    ],
    ...TEMPLATE_COLUMNS.map((c) => [
      { value: c.header, type: String },
      { value: c.help, type: String },
    ]),
  ];
  const blob = await writeXlsxFile([
    {
      data: [head, ...ex],
      sheet: TEMPLATE_SHEET,
      columns: TEMPLATE_COLUMNS.map(() => ({ width: 20 })),
    },
    { data: help, sheet: "Instructions", columns: [{ width: 24 }, { width: 90 }] },
  ] as never).toBlob();
  triggerDownload(blob, "modele-import-contrats.xlsx");
}
