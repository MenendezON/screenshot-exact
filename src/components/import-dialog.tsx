import { useQuery } from "@tanstack/react-query";
import { Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  analyzeImport,
  ISSUE_LABELS,
  ISSUE_REPORT_HEADERS,
  issueCounts,
  issueReportRows,
  type ImportPlan,
} from "@/lib/import/analyze";
import { buildMapping, foldKey } from "@/lib/import/normalize";
import { readImportFile } from "@/lib/import/read";
import { downloadImportTemplate } from "@/lib/import/template";
import { logError, userMessage } from "@/lib/log";
import {
  categoriesQuery,
  exitReasonsQuery,
  jobTitlesQuery,
  orgUnitsQuery,
  sitesQuery,
  STATUS_LABELS,
  STATUS_OPTIONS,
} from "@/lib/referentials";
import { downloadTableXlsx } from "@/lib/table-export";

/** Bouton « Importer » : modèle de fichier + contrôle (simulation) local du fichier. Aucune écriture en base. */
export function ImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const sites = useQuery({ ...sitesQuery, enabled: open });
  const units = useQuery({ ...orgUnitsQuery, enabled: open });
  const titles = useQuery({ ...jobTitlesQuery, enabled: open });
  const cats = useQuery({ ...categoriesQuery, enabled: open });
  const reasons = useQuery({ ...exitReasonsQuery, enabled: open });
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ file: string; plan: ImportPlan } | null>(null);

  const ready = [sites, units, titles, cats, reasons].every((q) => q.data);

  async function onFile(file: File) {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const { rows, missing } = await readImportFile(file);
      if (missing.length)
        throw new Error(`Colonnes obligatoires absentes : ${missing.join(", ")}.`);
      if (rows.length === 0) throw new Error("Le fichier ne contient aucune ligne.");
      const ident = (names: string[]) => buildMapping(names.map((n) => ({ raw: n, canonical: n })));
      const dep = (units.data ?? [])
        .filter((u) => u.type === "departement" && !u.archived_at)
        .map((u) => u.name);
      const jt = (titles.data ?? []).filter((t) => !t.archived_at).map((t) => t.name);
      const ca = (cats.data ?? []).filter((c) => !c.archived_at).map((c) => c.code);
      const er = (reasons.data ?? []).filter((r) => !r.archived_at).map((r) => r.name);
      const si = (sites.data ?? []).filter((s) => !s.archived_at).map((s) => s.name);
      const fold = (a: string[]) => new Set(a.map(foldKey));
      const plan = analyzeImport(rows, {
        today: new Date().toISOString().slice(0, 10),
        fixedTermMaxMonths: 24,
        departments: ident(dep),
        jobTitles: ident(jt),
        categories: ident(ca),
        exitReasons: ident(er),
        statusMapping: buildMapping(
          STATUS_OPTIONS.map((s) => ({ raw: STATUS_LABELS[s], canonical: s })),
        ),
        categoryStatus: new Map(),
        known: {
          departments: fold(dep),
          jobTitles: fold(jt),
          categories: fold(ca),
          exitReasons: fold(er),
          sites: fold(si),
        },
      });
      setResult({ file: file.name, plan });
    } catch (e) {
      logError("import.lecture", e);
      setError(userMessage(e, "Impossible de lire ce fichier."));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  const counts = result ? Object.entries(issueCounts(result.plan)).filter(([, n]) => n > 0) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Importer des données</DialogTitle>
          <DialogDescription>
            Une ligne par contrat, feuille « Contrats ». Le fichier est d'abord contrôlé ici, sans
            rien enregistrer.
          </DialogDescription>
        </DialogHeader>

        <section className="space-y-2 rounded-lg border p-4">
          <h3 className="text-sm font-semibold">1. Télécharger le modèle</h3>
          <p className="text-sm text-muted-foreground">
            Colonnes, exemples et consignes (feuille « Instructions »).
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => downloadImportTemplate("xlsx")}>
              <FileSpreadsheet /> Modèle Excel
            </Button>
            <Button variant="outline" size="sm" onClick={() => downloadImportTemplate("csv")}>
              <Download /> Modèle CSV
            </Button>
          </div>
        </section>

        <section className="space-y-2 rounded-lg border p-4">
          <h3 className="text-sm font-semibold">2. Contrôler votre fichier</h3>
          <input
            ref={input}
            type="file"
            accept=".xlsx,.csv"
            className="sr-only"
            id="import-file"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
          <Button size="sm" disabled={busy || !ready} onClick={() => input.current?.click()}>
            {busy ? <Loader2 className="animate-spin" /> : <Upload />} Choisir un fichier (.xlsx,
            .csv)
          </Button>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {result && (
            <div role="status" className="space-y-2 text-sm">
              <p>
                <strong>{result.file}</strong> : {result.plan.rowCount} ligne(s),{" "}
                {result.plan.employees.length} employé(s).{" "}
                {result.plan.blocking ? (
                  <span className="font-medium text-destructive">
                    Anomalies bloquantes à corriger.
                  </span>
                ) : (
                  <span className="font-medium">Aucune anomalie bloquante.</span>
                )}
              </p>
              {counts.length > 0 && (
                <ul className="list-disc pl-5 text-muted-foreground">
                  {counts.map(([code, n]) => (
                    <li key={code}>
                      {ISSUE_LABELS[code as keyof typeof ISSUE_LABELS]} : {n}
                    </li>
                  ))}
                </ul>
              )}
              {result.plan.issues.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    downloadTableXlsx({
                      name: "rapport-anomalies-import",
                      headers: ISSUE_REPORT_HEADERS,
                      rows: issueReportRows(result.plan),
                    })
                  }
                >
                  <Download /> Rapport d'anomalies (.xlsx)
                </Button>
              )}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            L'enregistrement en base (exécution transactionnelle) sera activé une fois la fonction
            d'import fournie par Lovable.
          </p>
        </section>
      </DialogContent>
    </Dialog>
  );
}
