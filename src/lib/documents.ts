import type { DocumentRecord } from "@/lib/employees";

export const DOCUMENT_BUCKET = "employee-documents";
/** Durée de validité d'une URL signée, en secondes (imposée côté serveur). */
export const SIGNED_URL_SECONDS = 60;
export const DEFAULT_EXPIRY_NOTICE_DAYS = 30;

/** Chemin de stockage : {employee_id}/{uuid}. Le nom d'origine reste dans la base, jamais dans le chemin. */
export const storagePathFor = (employeeId: string, fileId: string = crypto.randomUUID()) =>
  `${employeeId}/${fileId}`;

export const STORAGE_PATH_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function formatSize(bytes: number | null | undefined): string {
  if (!bytes) return "";
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} Ko`
    : `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`;
}

// ---------- Contrôle du contenu ----------

const SIGNATURES: Record<string, number[]> = {
  "application/pdf": [0x25, 0x50, 0x44, 0x46], // %PDF
  "image/jpeg": [0xff, 0xd8, 0xff],
  "image/png": [0x89, 0x50, 0x4e, 0x47],
};

/** Vrai si les premiers octets correspondent au format annoncé (le type MIME du navigateur se falsifie). */
export function matchesSignature(mime: string, head: Uint8Array): boolean {
  const sig = SIGNATURES[mime];
  if (!sig) return false;
  return sig.every((byte, i) => head[i] === byte);
}

function readHead(file: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file.slice(0, 8));
  });
}

export async function sniffFile(file: Blob & { type: string }): Promise<string | null> {
  const head = await readHead(file);
  return matchesSignature(file.type, head)
    ? null
    : "Le contenu du fichier ne correspond pas à son format. Choisissez un vrai PDF, JPEG ou PNG.";
}

export const isPreviewable = (mime: string | null | undefined) =>
  mime === "application/pdf" || mime === "image/jpeg" || mime === "image/png";

// ---------- Expiration ----------

export type ExpiryState = "expired" | "soon" | null;

export function expiryState(
  expiresOn: string | null | undefined,
  today: string,
  noticeDays: number = DEFAULT_EXPIRY_NOTICE_DAYS,
): ExpiryState {
  if (!expiresOn) return null;
  if (expiresOn < today) return "expired";
  const limit = new Date(`${today}T00:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() + noticeDays);
  return expiresOn <= limit.toISOString().slice(0, 10) ? "soon" : null;
}

// ---------- Versions ----------

export type VersionGroup = { current: DocumentRecord; older: DocumentRecord[] };

/**
 * Regroupe les documents en chaînes de versions (via `replaces_document_id`). La version courante
 * est la dernière de la chaîne ; les précédentes restent consultables, de la plus récente à la plus ancienne.
 * Les groupes sont triés par date de dépôt de la version courante, la plus récente d'abord.
 */
export function groupVersions(docs: DocumentRecord[]): VersionGroup[] {
  const byId = new Map(docs.map((d) => [d.id, d]));
  const replaced = new Set<string>();
  for (const d of docs)
    if (d.replaces_document_id && byId.has(d.replaces_document_id))
      replaced.add(d.replaces_document_id);

  const groups: VersionGroup[] = [];
  for (const current of docs) {
    if (replaced.has(current.id)) continue;
    const older: DocumentRecord[] = [];
    const seen = new Set<string>([current.id]);
    let cursor = current.replaces_document_id ? byId.get(current.replaces_document_id) : undefined;
    while (cursor && !seen.has(cursor.id)) {
      older.push(cursor);
      seen.add(cursor.id);
      cursor = cursor.replaces_document_id ? byId.get(cursor.replaces_document_id) : undefined;
    }
    groups.push({ current, older });
  }
  return groups.sort((a, b) => b.current.created_at.localeCompare(a.current.created_at));
}

/** Numéro de la prochaine version quand on remplace `doc`. */
export const nextVersion = (doc: Pick<DocumentRecord, "version">) => doc.version + 1;

/** Identifiants de toute la chaîne (pour archiver un document avec ses versions). */
export const chainIds = (g: VersionGroup) => [g.current.id, ...g.older.map((d) => d.id)];
