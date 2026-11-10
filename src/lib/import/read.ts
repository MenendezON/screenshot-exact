import { foldKey } from "./normalize";
import type { SourceRow } from "./analyze";
import { TEMPLATE_COLUMNS, TEMPLATE_SHEET } from "./template";

const BY_HEADER = new Map(TEMPLATE_COLUMNS.map((c) => [foldKey(c.header), c.field]));

/** Transforme une grille (première ligne = en-têtes) en lignes canoniques. Colonnes inconnues ignorées. */
export function gridToRows(grid: unknown[][]): { rows: SourceRow[]; missing: string[] } {
  const [head = [], ...body] = grid;
  const fields = head.map((h) => BY_HEADER.get(foldKey(String(h ?? ""))));
  const missing = TEMPLATE_COLUMNS.filter(
    (c) =>
      !fields.includes(c.field) &&
      ["matricule", "contract_type", "contract_start"].includes(c.field),
  ).map((c) => c.header);
  const rows: SourceRow[] = [];
  body.forEach((cells, i) => {
    if (cells.every((c) => c === null || c === undefined || String(c).trim() === "")) return;
    const row: SourceRow = { rowNumber: i + 2 };
    cells.forEach((v, j) => {
      const f = fields[j];
      if (f) (row as Record<string, unknown>)[f] = v;
    });
    rows.push(row);
  });
  return { rows, missing };
}

function parseCsv(text: string): string[][] {
  const t = text.replace(/^﻿/, "");
  const sep = (t.split("\n")[0] ?? "").includes(";") ? ";" : ",";
  const out: string[][] = [];
  let row: string[] = [],
    cur = "",
    q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]!;
    if (q) {
      if (ch === '"' && t[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) {
      row.push(cur);
      cur = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      row.push(cur);
      out.push(row);
      row = [];
      cur = "";
    } else cur += ch;
  }
  if (cur || row.length) {
    row.push(cur);
    out.push(row);
  }
  return out;
}

export async function readImportFile(file: File) {
  if (/\.csv$/i.test(file.name)) return gridToRows(parseCsv(await file.text()));
  const { default: readXlsx } = await import("read-excel-file/browser");
  const sheets = (await readXlsx(file)) as unknown as Array<{ sheet: string; data: unknown[][] }>;
  const found = sheets.find((s) => foldKey(s.sheet) === foldKey(TEMPLATE_SHEET));
  if (!found) throw new Error(`Feuille « ${TEMPLATE_SHEET} » introuvable dans le classeur.`);
  return gridToRows(found.data);
}
