import { describe, expect, it } from "vitest";

import {
  addDays,
  canFollowUp,
  daysBetween,
  describeNotification,
  overlapMessage,
  remainingLabel,
  retirementRows,
  suggestedStart,
  toRegularize,
  unreadCount,
  upcomingEnds,
  type AlertRow,
  type ContractLike,
} from "@/lib/contracts";

const cdd = (over: Partial<ContractLike> = {}): ContractLike => ({
  id: "c1",
  type: "cdd",
  start_date: "2026-01-01",
  end_date: "2026-06-30",
  terminated_on: null,
  ...over,
});

describe("dates", () => {
  it("calcule les écarts et les décalages en jours civils", () => {
    expect(daysBetween("2026-01-01", "2026-03-01")).toBe(59);
    expect(addDays("2026-06-30", 1)).toBe("2026-07-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("formule le temps restant", () => {
    expect(remainingLabel(0)).toBe("aujourd'hui");
    expect(remainingLabel(1)).toBe("1 jour");
    expect(remainingLabel(45)).toBe("45 jours");
    expect(remainingLabel(-3)).toBe("échu depuis 3 jours");
    expect(remainingLabel(400)).toBe("1 an et 1 mois");
  });
});

describe("overlapMessage", () => {
  const existing = [cdd()];
  it("refuse un contrat qui commence pendant le précédent", () => {
    const msg = overlapMessage(existing, {
      type: "cdd",
      startDate: "2026-06-30",
      durationMonths: 6,
    });
    expect(msg).toContain("chevauche");
    expect(msg).toContain("01/07/2026"); // date de début suggérée
  });
  it("accepte le lendemain de la fin", () => {
    expect(
      overlapMessage(existing, { type: "cdd", startDate: "2026-07-01", durationMonths: 6 }),
    ).toBeNull();
  });
  it("tient compte d'une rupture anticipée", () => {
    const early = [cdd({ terminated_on: "2026-03-15" })];
    expect(
      overlapMessage(early, { type: "cdi", startDate: "2026-03-16", durationMonths: null }),
    ).toBeNull();
    expect(
      overlapMessage(early, { type: "cdi", startDate: "2026-03-15", durationMonths: null }),
    ).not.toBeNull();
  });
  it("refuse tout nouveau contrat après un CDI sans fin", () => {
    const cdi = [cdd({ type: "cdi", end_date: null })];
    expect(
      overlapMessage(cdi, { type: "cdd", startDate: "2030-01-01", durationMonths: 3 }),
    ).toContain("sans date de fin");
  });
  it("refuse un contrat qui en recouvre un autre postérieur", () => {
    const later = [cdd({ start_date: "2026-09-01", end_date: "2026-12-31" })];
    expect(
      overlapMessage(later, { type: "cdd", startDate: "2026-07-01", durationMonths: 3 }),
    ).not.toBeNull();
    expect(
      overlapMessage(later, { type: "cdd", startDate: "2026-06-01", durationMonths: 3 }),
    ).toBeNull();
    expect(
      overlapMessage(later, { type: "cdi", startDate: "2026-07-01", durationMonths: null }),
    ).not.toBeNull();
  });
});

describe("renouvellement et conversion", () => {
  it("propose le lendemain de la fin effective", () => {
    expect(suggestedStart(cdd(), "2026-08-01")).toBe("2026-07-01");
    expect(suggestedStart(cdd({ terminated_on: "2026-04-10" }), "2026-08-01")).toBe("2026-04-11");
  });
  it("ne se propose que depuis le dernier contrat à durée déterminée", () => {
    const old = cdd({ id: "a", start_date: "2025-01-01", end_date: "2025-12-31" });
    const last = cdd({ id: "b" });
    expect(canFollowUp(last, [old, last])).toBe(true);
    expect(canFollowUp(old, [old, last])).toBe(false);
    expect(canFollowUp(cdd({ type: "cdi", end_date: null }), [])).toBe(false);
  });
});

const alert = (over: Partial<AlertRow>): AlertRow => ({
  employee_id: "e",
  matricule: null,
  first_names: "A",
  last_name: "B",
  contract_id: "c",
  contract_type: "cdd",
  contract_start: null,
  contract_end: null,
  retirement_date: null,
  reference_date: null,
  days_remaining: 10,
  notice_days: 45,
  to_notify: true,
  to_regularize: false,
  primary_site_id: null,
  org_unit_id: null,
  ...over,
});

describe("écrans de suivi", () => {
  it("trie les fins de contrat par urgence et exclut les CDI et les contrats hors délai", () => {
    const out = upcomingEnds([
      alert({ employee_id: "a", days_remaining: 30 }),
      alert({ employee_id: "b", days_remaining: 5 }),
      alert({ employee_id: "c", contract_type: "cdi", days_remaining: 1 }),
      alert({ employee_id: "d", to_notify: false, days_remaining: 90 }),
    ]);
    expect(out.map((r) => r.employee_id)).toEqual(["b", "a"]);
  });
  it("liste les contrats à régulariser du plus ancien au plus récent", () => {
    const out = toRegularize([
      alert({ employee_id: "a", to_regularize: true, contract_end: "2026-05-01" }),
      alert({ employee_id: "b", to_regularize: true, contract_end: "2026-02-01" }),
      alert({ employee_id: "c" }),
    ]);
    expect(out.map((r) => r.employee_id)).toEqual(["b", "a"]);
  });
  it("trie les retraites par temps restant et alerte à moins de 60 jours", () => {
    const people = ["a", "b", "c", "d"].map((id) => ({
      employee_id: id,
      matricule: null,
      first_names: id,
      last_name: id,
      primary_site_id: null,
      org_unit_id: null,
      birth_date: id === "d" ? null : "1970-01-01",
    }));
    const dates = new Map<string, string | null>([
      ["a", "2030-01-01"],
      ["b", "2026-12-01"],
      ["c", "2026-11-30"],
      ["d", "2026-11-12"],
    ]);
    const out = retirementRows(people, dates, "2026-11-10", 60);
    expect(out.map((r) => r.employee_id)).toEqual(["c", "b", "a"]); // d sans naissance : ignoré
    expect(out.map((r) => r.alert)).toEqual([true, true, false]);
  });
});

describe("notifications", () => {
  it("décrit les types connus et se rabat sur le contenu pour les autres", () => {
    expect(
      describeNotification({
        kind: "contract_ending",
        payload: { employee_name: "A B", days_remaining: 12 },
      }),
    ).toEqual({ title: "Fin de contrat à venir", detail: "A B — dans 12 jours" });
    expect(describeNotification({ kind: "x", payload: { title: "T", message: "M" } })).toEqual({
      title: "T",
      detail: "M",
    });
    expect(describeNotification({ kind: "x", payload: {} }).title).toBe("Notification");
  });
  it("compte les non lues", () => {
    const base = { kind: "k", payload: {}, created_at: "2026-01-01" };
    expect(
      unreadCount([
        { id: "1", read_at: null, ...base },
        { id: "2", read_at: "2026-01-02", ...base },
      ]),
    ).toBe(1);
  });
});
