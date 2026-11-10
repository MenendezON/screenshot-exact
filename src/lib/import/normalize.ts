/** Règles de normalisation des cellules du classeur de suivi. Fonctions pures, sans accès à la base. */

const ERROR_CELL = /^#(N\/A|REF!|VALUE!|DIV\/0!|NAME\?|NULL!|NUM!)$/i;

/** Texte nettoyé : espaces superflus retirés, cellules vides et erreurs Excel (#N/A…) deviennent null. */
export function cleanText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/[  ]/g, " ").replace(/\s+/g, " ").trim();
  if (s === "" || ERROR_CELL.test(s)) return null;
  return s;
}

/** Clé de comparaison : sans accents, minuscules, espaces simples. */
export function foldKey(v: unknown): string {
  return (cleanText(v) ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export type Parsed<T> = { value: T | null; error?: string };

/** Oui / OUI / oui → true ; Non / NON → false ; vide → null ; autre valeur → erreur. */
export function parseYesNo(v: unknown): Parsed<boolean> {
  const k = foldKey(v);
  if (k === "") return { value: null };
  if (k === "oui" || k === "o" || k === "yes") return { value: true };
  if (k === "non" || k === "n" || k === "no") return { value: false };
  return { value: null, error: `Valeur « ${cleanText(v)} » inattendue : Oui ou Non attendu.` };
}

/** Code de catégorie : 40S2 → 4OS2 (zéro saisi à la place de la lettre O), 7ieme → 7EME, casse et espaces. */
export function normalizeCategory(v: unknown): string | null {
  const s = cleanText(v);
  if (s === null) return null;
  let code = s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "").toUpperCase();
  code = code.replace(/^(\d)0([SP])(\d)$/, "$1O$2$3");
  const ordinal = /^(\d+)(IEME|EME|E)$/.exec(code);
  if (ordinal) code = `${ordinal[1]}EME`;
  return code;
}

const FR_MONTHS = [
  "janvier",
  "fevrier",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "aout",
  "septembre",
  "octobre",
  "novembre",
  "decembre",
];

function validIso(y: number, m: number, d: number): string | null {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1) return null;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (d > last) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Date saisie comme texte, nombre (série Excel) ou Date. Formats : jj/mm/aaaa, jj-mm-aaaa, jj.mm.aaaa,
 * aaaa-mm-jj, « 5 mars 2024 ». L'année sur deux chiffres est refusée (ambiguë).
 */
export function parseDate(v: unknown): Parsed<string> {
  if (v === null || v === undefined) return { value: null };
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return { value: null, error: "Date illisible." };
    return { value: v.toISOString().slice(0, 10) };
  }
  if (typeof v === "number") {
    // Série Excel (1900) : 25569 = 1970-01-01.
    if (v < 1 || v > 80000)
      return { value: null, error: `Nombre « ${v} » hors des dates possibles.` };
    return { value: new Date(Math.round((v - 25569) * 86_400_000)).toISOString().slice(0, 10) };
  }
  const s = cleanText(v);
  if (s === null) return { value: null };
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(s);
  let iso: string | null = null;
  if (m) iso = validIso(+m[1]!, +m[2]!, +m[3]!);
  else if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s)))
    iso = validIso(+m[3]!, +m[2]!, +m[1]!);
  else if ((m = /^(\d{1,2})(?:er)?\s+([A-Za-zéûè]+)\.?\s+(\d{4})$/.exec(s))) {
    const mi = FR_MONTHS.indexOf(foldKey(m[2]));
    if (mi >= 0) iso = validIso(+m[3]!, mi + 1, +m[1]!);
  }
  return iso
    ? { value: iso }
    : { value: null, error: `Date « ${s} » invalide (jj/mm/aaaa attendu).` };
}

/** Montant entier en FCFA : « 450 000 », « 450000 FCFA », 450000. Vide → null ; texte non numérique → erreur. */
export function parseAmount(v: unknown): Parsed<number> {
  if (typeof v === "number")
    return Number.isFinite(v)
      ? { value: Math.round(v) }
      : { value: null, error: "Montant illisible." };
  const s = cleanText(v);
  if (s === null) return { value: null };
  const digits = s
    .replace(/FCFA|XOF|F\s*CFA/gi, "")
    .replace(/[\s.]/g, "")
    .replace(/,\d{1,2}$/, "");
  if (!/^\d+$/.test(digits)) return { value: null, error: `Montant « ${s} » illisible.` };
  return { value: Number(digits) };
}

export function parseInteger(v: unknown): Parsed<number> {
  if (typeof v === "number")
    return Number.isInteger(v)
      ? { value: v }
      : { value: null, error: `« ${v} » n'est pas un entier.` };
  const s = cleanText(v);
  if (s === null) return { value: null };
  return /^\d+$/.test(s)
    ? { value: Number(s) }
    : { value: null, error: `« ${s} » n'est pas un entier.` };
}

/**
 * Sites d'une cellule, séparés par un point-virgule ; le premier est le site principal.
 * (Format à confirmer avec le classeur : le séparateur est un paramètre.)
 */
export function splitSites(v: unknown, separator = ";"): string[] {
  const s = cleanText(v);
  if (s === null) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of s.split(separator)) {
    const name = cleanText(part);
    if (name && !seen.has(foldKey(name))) {
      seen.add(foldKey(name));
      out.push(name);
    }
  }
  return out;
}

// ---------- Correspondances valeur brute → valeur canonique ----------

export type MappingTable = Map<string, string>;

/** Table de correspondance indexée par clé de comparaison (casse, accents et espaces ignorés). */
export function buildMapping(entries: Array<{ raw: string; canonical: string }>): MappingTable {
  return new Map(entries.map((e) => [foldKey(e.raw), e.canonical]));
}

export type Mapped = { value: string | null; unmapped: boolean };

/** Valeur canonique, ou `unmapped` si la valeur brute n'est pas dans la table (l'import est alors bloqué). */
export function applyMapping(raw: unknown, table: MappingTable): Mapped {
  const text = cleanText(raw);
  if (text === null) return { value: null, unmapped: false };
  const hit = table.get(foldKey(text));
  return hit === undefined ? { value: null, unmapped: true } : { value: hit, unmapped: false };
}
