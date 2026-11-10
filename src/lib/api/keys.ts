/** Niveaux d'accès de l'API, clés d'API (génération, empreinte, lecture de l'en-tête) : logique pure, sans accès base. */

export const API_LEVELS = ["identite", "contrats", "contact", "remuneration"] as const;
export type ApiLevel = (typeof API_LEVELS)[number];

export const LEVEL_INFO: Record<ApiLevel, { label: string; description: string; example: string }> =
  {
    identite: {
      label: "Niveau 1 — Identité et affectation",
      description:
        "Matricule, nom, prénoms, statut, poste, catégorie, unité, site principal, présence.",
      example: "Pointage (qui est en poste, et où)",
    },
    contrats: {
      label: "Niveau 2 — + Contrats",
      description: "Niveau 1 + contrat en cours, historique des contrats, date de sortie.",
      example: "Pointage avec règles par type de contrat",
    },
    contact: {
      label: "Niveau 3 — + Coordonnées",
      description: "Niveau 2 + téléphone, e-mail, date de naissance.",
      example: "Annuaire, messagerie",
    },
    remuneration: {
      label: "Niveau 4 — + Rémunération",
      description: "Niveau 3 + salaire net mensuel en vigueur (FCFA).",
      example: "Paie",
    },
  };

export const levelRank = (l: ApiLevel) => API_LEVELS.indexOf(l);
export const hasLevel = (granted: ApiLevel, needed: ApiLevel) =>
  levelRank(granted) >= levelRank(needed);

export type EmployeeSource = {
  matricule: string;
  last_name: string;
  first_names: string;
  status: string | null;
  job_title_name: string | null;
  category_code: string | null;
  org_unit_name: string | null;
  primary_site_name: string | null;
  is_active: boolean;
  contract_type: string | null;
  contract_start: string | null;
  contract_end: string | null;
  contract_terminated_on: string | null;
  exit_date: string | null;
  phone: string | null;
  email: string | null;
  birth_date: string | null;
};

/** Ne laisse sortir que les champs du niveau accordé. `salary` n'est lu que pour le niveau « remuneration ». */
export function projectEmployee(e: EmployeeSource, level: ApiLevel, salary?: number | null) {
  const out: Record<string, unknown> = {
    matricule: e.matricule,
    nom: e.last_name,
    prenoms: e.first_names,
    en_poste: e.is_active,
    statut: e.status,
    poste: e.job_title_name,
    categorie: e.category_code,
    unite: e.org_unit_name,
    site_principal: e.primary_site_name,
  };
  if (hasLevel(level, "contrats")) {
    out["contrat_type"] = e.contract_type;
    out["contrat_debut"] = e.contract_start;
    out["contrat_fin"] = e.contract_terminated_on ?? e.contract_end;
    out["date_sortie"] = e.exit_date;
  }
  if (hasLevel(level, "contact")) {
    out["telephone"] = e.phone;
    out["email"] = e.email;
    out["date_naissance"] = e.birth_date;
  }
  if (hasLevel(level, "remuneration")) out["salaire_net_mensuel_fcfa"] = salary ?? null;
  return out;
}

// ---------- Clés ----------
const KEY_RE = /^fms_([a-f0-9]{8})_([A-Za-z0-9_-]{32,})$/;

function randomString(bytes: number): string {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...b))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function hashKey(key: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/** Nouvelle clé : affichée une seule fois ; seuls `prefix` et `hash` sont conservés. */
export async function generateApiKey() {
  const prefix = [...crypto.getRandomValues(new Uint8Array(4))]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
  const key = `fms_${prefix}_${randomString(32)}`;
  return { key, prefix, hash: await hashKey(key) };
}

/** Extrait la clé de `Authorization: Bearer …` ou de `X-API-Key`. */
export function extractKey(headers: Headers): { key: string; prefix: string } | null {
  const bearer = /^Bearer\s+(\S+)$/i.exec(headers.get("authorization") ?? "")?.[1];
  const raw = bearer ?? headers.get("x-api-key") ?? "";
  const m = KEY_RE.exec(raw.trim());
  return m ? { key: raw.trim(), prefix: m[1]! } : null;
}

export type ApiClient = {
  id: string;
  name: string;
  level: ApiLevel;
  site_id: string | null;
  expires_at: string | null;
  revoked_at: string | null;
};

export function clientStatus(
  c: Pick<ApiClient, "expires_at" | "revoked_at">,
  now = new Date(),
): "active" | "expired" | "revoked" {
  if (c.revoked_at) return "revoked";
  if (c.expires_at && new Date(c.expires_at) <= now) return "expired";
  return "active";
}

/** Comparaison en temps constant de deux empreintes hexadécimales. */
export function sameHash(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Limite de débit en mémoire (par instance, au mieux) : `max` appels par fenêtre d'une minute. */
export function makeRateLimiter(max: number, windowMs = 60_000) {
  const hits = new Map<string, { start: number; n: number }>();
  return (id: string, now = Date.now()): boolean => {
    const h = hits.get(id);
    if (!h || now - h.start >= windowMs) {
      hits.set(id, { start: now, n: 1 });
      return true;
    }
    h.n += 1;
    return h.n <= max;
  };
}
