import { describe, expect, it } from "vitest";

import { countryName, countryOptions, isCountryCode } from "@/lib/countries";
import { compensationSchema, documentSchema, employeeSchema } from "@/lib/employee-schemas";
import { reviewSchema, toReviewPayload } from "@/lib/reviews";

const base = {
  kind: "performance",
  reviewDate: "2026-11-01",
  rating: "",
  title: "",
  comment: "Bon travail.",
  contractId: "",
};

describe("appréciations", () => {
  it("accepte une appréciation minimale et normalise les champs vides", () => {
    const parsed = reviewSchema.parse(base);
    expect(toReviewPayload(parsed)).toEqual({
      kind: "performance",
      review_date: "2026-11-01",
      rating: null,
      title: null,
      comment: "Bon travail.",
      contract_id: null,
    });
  });
  it("refuse un commentaire vide, une note hors 1 à 5 et un commentaire trop long", () => {
    expect(reviewSchema.safeParse({ ...base, comment: "  " }).success).toBe(false);
    expect(reviewSchema.safeParse({ ...base, rating: "6" }).success).toBe(false);
    expect(reviewSchema.safeParse({ ...base, rating: "0" }).success).toBe(false);
    expect(reviewSchema.safeParse({ ...base, comment: "x".repeat(4001) }).success).toBe(false);
    expect(reviewSchema.safeParse({ ...base, kind: "autre" }).success).toBe(false);
  });
  it("convertit la note en nombre", () => {
    expect(toReviewPayload(reviewSchema.parse({ ...base, rating: "4" })).rating).toBe(4);
  });
});

describe("pays", () => {
  it("met le Sénégal en tête et nomme les pays en français", () => {
    expect(countryOptions()[0]?.value).toBe("SN");
    expect(countryName("SN")).toBe("Sénégal");
    expect(isCountryCode("SN")).toBe(true);
    expect(isCountryCode("XX")).toBe(false);
    expect(isCountryCode("sn")).toBe(false);
  });
});

describe("fiche : nouveaux champs", () => {
  const emp = {
    matricule: "A1",
    lastName: "Diop",
    firstNames: "Awa",
    birthDate: "",
    birthPlace: "",
    address: "",
    maritalStatus: "",
    childrenCount: "0",
    phone: "",
    email: "",
    gender: "",
    professionalEmail: "",
    nationalityCode: "",
    managerId: "",
  };
  it("e-mail professionnel et nationalité sont facultatifs mais contrôlés", () => {
    expect(employeeSchema.safeParse(emp).success).toBe(true);
    expect(
      employeeSchema.safeParse({ ...emp, professionalEmail: "a@b.sn", nationalityCode: "SN" })
        .success,
    ).toBe(true);
    expect(employeeSchema.safeParse({ ...emp, professionalEmail: "pas-un-email" }).success).toBe(
      false,
    );
    expect(employeeSchema.safeParse({ ...emp, nationalityCode: "ZZ" }).success).toBe(false);
  });
  it("le contrat d'une rémunération doit être un identifiant ou vide", () => {
    const c = { amount: "450000", effectiveDate: "2026-01-01" };
    expect(compensationSchema.safeParse({ ...c, contractId: "" }).success).toBe(true);
    expect(compensationSchema.safeParse({ ...c, contractId: "abc" }).success).toBe(false);
  });
  it("la description d'un document est limitée à 500 caractères", () => {
    const d = {
      documentTypeId: "6f1c2a52-1b0e-4c43-9a43-0d9d8b2f9d11",
      documentDate: "",
      expiresOn: "",
    };
    expect(documentSchema.safeParse({ ...d, description: "ok" }).success).toBe(true);
    expect(documentSchema.safeParse({ ...d, description: "x".repeat(501) }).success).toBe(false);
  });
});

describe("genre", () => {
  it("normalise les saisies de l'import", async () => {
    const { parseGender } = await import("@/lib/import/normalize");
    expect(parseGender("Femme").value).toBe("F");
    expect(parseGender(" f ").value).toBe("F");
    expect(parseGender("Féminin").value).toBe("F");
    expect(parseGender("H").value).toBe("M");
    expect(parseGender("Masculin").value).toBe("M");
    expect(parseGender("").value).toBeNull();
    expect(parseGender("autre").error).toMatch(/Femme ou Homme/);
  });
  it("le formulaire n'accepte que F, M ou vide et l'enregistre", () => {
    const f = {
      matricule: "A1",
      lastName: "Diop",
      firstNames: "Awa",
      gender: "F",
      birthDate: "",
      birthPlace: "",
      address: "",
      maritalStatus: "",
      childrenCount: "0",
      phone: "",
      email: "",
      professionalEmail: "",
      nationalityCode: "",
      managerId: "",
    };
    expect(employeeSchema.safeParse(f).success).toBe(true);
    expect(employeeSchema.safeParse({ ...f, gender: "" }).success).toBe(true);
    expect(employeeSchema.safeParse({ ...f, gender: "X" }).success).toBe(false);
  });
});
