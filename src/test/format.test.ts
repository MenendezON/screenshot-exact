import { describe, expect, it } from "vitest";

import { formatDate, formatDateTime, formatFCFA } from "@/lib/format";

describe("formatFCFA", () => {
  it("affiche un entier avec des espaces comme séparateur de milliers", () => {
    expect(formatFCFA(1250000)).toBe("1 250 000 FCFA");
  });

  it("arrondit à l'entier (pas de décimales en FCFA)", () => {
    expect(formatFCFA(99999.6)).toBe("100 000 FCFA");
  });
});

describe("formatDate", () => {
  it("affiche une date SQL au format jj/mm/aaaa", () => {
    expect(formatDate("2026-03-07")).toBe("07/03/2026");
  });

  it("affiche un horodatage avec l'heure de Dakar", () => {
    expect(formatDateTime("2026-11-09T23:44:00Z")).toBe("09/11/2026 23:44");
  });
});
