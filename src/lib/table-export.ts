import { toCsv, triggerDownload, type ExportCell } from "@/lib/employee-export";

export type ExportTable = { name: string; headers: string[]; rows: ExportCell[][] };

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

export function tableFileName(name: string, ext: "csv" | "xlsx", today = new Date()): string {
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return `${slug(name) || "export"}-${iso}.${ext}`;
}

export function downloadTableCsv(t: ExportTable) {
  triggerDownload(
    new Blob([toCsv(t.headers, t.rows)], { type: "text/csv;charset=utf-8" }),
    tableFileName(t.name, "csv"),
  );
}

export async function downloadTableXlsx(t: ExportTable) {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const header = t.headers.map((h) => ({ value: h, type: String, fontWeight: "bold" as const }));
  const data = [
    header,
    ...t.rows.map((r) =>
      r.map((cell) =>
        typeof cell === "number"
          ? { value: cell, type: Number }
          : { value: cell ?? "", type: String },
      ),
    ),
  ];
  const blob = await writeXlsxFile(data, {
    columns: t.headers.map(() => ({ width: 22 })),
  }).toBlob();
  triggerDownload(blob, tableFileName(t.name, "xlsx"));
}
