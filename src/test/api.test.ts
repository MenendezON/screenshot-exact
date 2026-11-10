import { describe, expect, it } from "vitest";

import {
  clientStatus,
  extractKey,
  generateApiKey,
  hashKey,
  hasLevel,
  makeRateLimiter,
  projectEmployee,
  sameHash,
  type EmployeeSource,
} from "@/lib/api/keys";

const emp: EmployeeSource = {
  matricule: "F0001",
  last_name: "Diop",
  first_names: "Awa",
  status: "ouvrier",
  job_title_name: "Soudeur",
  category_code: "4OS2",
  org_unit_name: "Production",
  primary_site_name: "Dakar",
  is_active: true,
  contract_type: "cdd",
  contract_start: "2026-01-01",
  contract_end: "2026-12-31",
  contract_terminated_on: null,
  exit_date: null,
  phone: "770000000",
  email: "awa@example.org",
  birth_date: "1990-03-14",
};

describe("niveaux d'API", () => {
  it("est cumulatif", () => {
    expect(hasLevel("remuneration", "identite")).toBe(true);
    expect(hasLevel("identite", "contrats")).toBe(false);
  });
  it("niveau 1 : ni contrat, ni coordonnées, ni salaire", () => {
    const o = projectEmployee(emp, "identite", 400000);
    expect(Object.keys(o)).toEqual([
      "matricule",
      "nom",
      "prenoms",
      "en_poste",
      "statut",
      "poste",
      "categorie",
      "unite",
      "site_principal",
    ]);
  });
  it("niveau 2 ajoute les contrats, niveau 3 les coordonnées, niveau 4 le salaire", () => {
    expect(projectEmployee(emp, "contrats")).toMatchObject({
      contrat_type: "cdd",
      contrat_fin: "2026-12-31",
    });
    expect(projectEmployee(emp, "contrats")).not.toHaveProperty("telephone");
    expect(projectEmployee(emp, "contact")).toMatchObject({
      telephone: "770000000",
      date_naissance: "1990-03-14",
    });
    expect(projectEmployee(emp, "contact")).not.toHaveProperty("salaire_net_mensuel_fcfa");
    expect(projectEmployee(emp, "remuneration", 400000)).toMatchObject({
      salaire_net_mensuel_fcfa: 400000,
    });
  });
  it("la fin effective (sortie) prime sur la fin prévue", () => {
    expect(
      projectEmployee({ ...emp, contract_terminated_on: "2026-06-30" }, "contrats"),
    ).toMatchObject({ contrat_fin: "2026-06-30" });
  });
});

describe("clés d'API", () => {
  it("génère une clé unique dont seule l'empreinte correspond", async () => {
    const a = await generateApiKey();
    const b = await generateApiKey();
    expect(a.key).toMatch(/^fms_[a-f0-9]{8}_[A-Za-z0-9_-]{32,}$/);
    expect(a.key).not.toBe(b.key);
    expect(a.hash).toBe(await hashKey(a.key));
    expect(a.hash).not.toContain(a.key);
    expect(a.key.startsWith(`fms_${a.prefix}_`)).toBe(true);
  });
  it("lit la clé dans Authorization ou X-API-Key et refuse le reste", async () => {
    const { key, prefix } = await generateApiKey();
    expect(extractKey(new Headers({ authorization: `Bearer ${key}` }))).toEqual({ key, prefix });
    expect(extractKey(new Headers({ "x-api-key": key }))?.prefix).toBe(prefix);
    expect(extractKey(new Headers({ authorization: "Bearer abc" }))).toBeNull();
    expect(extractKey(new Headers())).toBeNull();
  });
  it("compare les empreintes", () => {
    expect(sameHash("abc", "abc")).toBe(true);
    expect(sameHash("abc", "abd")).toBe(false);
    expect(sameHash("abc", "ab")).toBe(false);
  });
  it("état : active, expirée, révoquée", () => {
    const now = new Date("2026-11-10T12:00:00Z");
    expect(clientStatus({ expires_at: null, revoked_at: null }, now)).toBe("active");
    expect(clientStatus({ expires_at: "2026-11-01T00:00:00Z", revoked_at: null }, now)).toBe(
      "expired",
    );
    expect(clientStatus({ expires_at: null, revoked_at: "2026-11-02T00:00:00Z" }, now)).toBe(
      "revoked",
    );
  });
  it("limite le débit par fenêtre", () => {
    const ok = makeRateLimiter(2, 1000);
    expect([ok("a", 0), ok("a", 1), ok("a", 2), ok("b", 3), ok("a", 1001)]).toEqual([
      true,
      true,
      false,
      true,
      true,
    ]);
  });
});

import { employeeColumns, toApiCsv } from "@/lib/api/keys";

describe("export CSV", () => {
  it("écrit l'en-tête, échappe les guillemets et neutralise les formules", () => {
    const csv = toApiCsv(
      [{ a: 'x"y', b: "=1+1", c: null, d: true, e: 5 }],
      ["a", "b", "c", "d", "e"],
    );
    expect(csv).toBe('﻿a,b,c,d,e\r\n"x""y",\'=1+1,,true,5\r\n');
  });
  it("les colonnes suivent le niveau de la clé", () => {
    expect(employeeColumns("identite")).not.toContain("telephone");
    expect(employeeColumns("remuneration")).toContain("salaire_net_mensuel_fcfa");
    expect(employeeColumns("contrats")).toContain("contrat_type");
  });
});

import { addDaysIso, validateExpiry } from "@/lib/api/keys";

describe("durée de vie des clés", () => {
  const today = "2026-11-10";
  it("exige une date future et au plus 365 jours", () => {
    expect(validateExpiry(null, today)).toMatch(/obligatoire/);
    expect(validateExpiry("2026-11-10", today)).toMatch(/futur/);
    expect(validateExpiry("2026-11-11", today)).toBeNull();
    expect(validateExpiry(addDaysIso(today, 365), today)).toBeNull();
    expect(validateExpiry(addDaysIso(today, 366), today)).toMatch(/365 jours/);
  });
  it("respecte un maximum paramétré", () => {
    expect(validateExpiry(addDaysIso(today, 91), today, 90)).toMatch(/90 jours/);
  });
});
