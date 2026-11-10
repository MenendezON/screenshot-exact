import { describe, expect, it } from "vitest";

import {
  chainIds,
  expiryState,
  groupVersions,
  isPreviewable,
  matchesSignature,
  nextVersion,
  sniffFile,
  STORAGE_PATH_PATTERN,
  storagePathFor,
} from "@/lib/documents";
import { describeNotification } from "@/lib/contracts";
import { validateDocumentFile } from "@/lib/employee-schemas";
import type { DocumentRecord } from "@/lib/employees";

const doc = (id: string, over: Partial<DocumentRecord> = {}): DocumentRecord =>
  ({
    id,
    employee_id: "e",
    document_type_id: "t",
    contract_id: null,
    storage_path: `e/${id}`,
    file_name: `${id}.pdf`,
    mime_type: "application/pdf",
    size_bytes: 100,
    document_date: null,
    expires_on: null,
    version: 1,
    replaces_document_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    created_by: null,
    updated_by: null,
    archived_at: null,
    ...over,
  }) as DocumentRecord;

describe("chemin de stockage", () => {
  it("suit le format {employee_id}/{uuid} sans nom de fichier", () => {
    const e = crypto.randomUUID();
    const path = storagePathFor(e);
    expect(path.startsWith(`${e}/`)).toBe(true);
    expect(STORAGE_PATH_PATTERN.test(path)).toBe(true);
    expect(STORAGE_PATH_PATTERN.test(`${e}/contrat.pdf`)).toBe(false);
    expect(STORAGE_PATH_PATTERN.test(`../${e}`)).toBe(false);
  });
});

describe("formats acceptés", () => {
  const ok = { name: "a", size: 100 };
  it("accepte PDF, JPEG et PNG, refuse Word et le reste", () => {
    expect(validateDocumentFile({ ...ok, type: "application/pdf" })).toBeNull();
    expect(validateDocumentFile({ ...ok, type: "image/jpeg" })).toBeNull();
    expect(validateDocumentFile({ ...ok, type: "image/png" })).toBeNull();
    expect(
      validateDocumentFile({
        ...ok,
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    ).toMatch(/PDF, JPEG ou PNG/);
    expect(validateDocumentFile({ ...ok, type: "image/gif" })).toMatch(/Format non accepté/);
  });
  it("limite à 10 Mo", () => {
    expect(
      validateDocumentFile({ name: "a", size: 10 * 1024 * 1024, type: "image/png" }),
    ).toBeNull();
    expect(
      validateDocumentFile({ name: "a", size: 10 * 1024 * 1024 + 1, type: "image/png" }),
    ).toMatch(/10 Mo/);
  });
  it("vérifie les premiers octets du fichier", async () => {
    const pdf = new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], {
      type: "application/pdf",
    });
    const fake = new Blob([new Uint8Array([0x4d, 0x5a, 0x90, 0x00])], { type: "application/pdf" });
    expect(await sniffFile(pdf)).toBeNull();
    expect(await sniffFile(fake)).toMatch(/ne correspond pas/);
    expect(matchesSignature("image/png", new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(true);
    expect(matchesSignature("image/png", new Uint8Array([0xff, 0xd8, 0xff]))).toBe(false);
    expect(matchesSignature("text/html", new Uint8Array([0x3c]))).toBe(false);
  });
  it("n'offre l'aperçu que pour PDF et images", () => {
    expect(isPreviewable("application/pdf")).toBe(true);
    expect(isPreviewable("image/png")).toBe(true);
    expect(isPreviewable("text/plain")).toBe(false);
    expect(isPreviewable(null)).toBe(false);
  });
});

describe("expiration", () => {
  it("signale « bientôt » dans les 30 jours puis « expiré »", () => {
    expect(expiryState(null, "2026-11-10")).toBeNull();
    expect(expiryState("2027-03-01", "2026-11-10")).toBeNull();
    expect(expiryState("2026-12-10", "2026-11-10")).toBe("soon"); // 30 jours pile
    expect(expiryState("2026-12-11", "2026-11-10")).toBeNull();
    expect(expiryState("2026-11-10", "2026-11-10")).toBe("soon");
    expect(expiryState("2026-11-09", "2026-11-10")).toBe("expired");
  });
  it("respecte un délai configuré", () => {
    expect(expiryState("2026-12-30", "2026-11-10", 60)).toBe("soon");
  });
});

describe("versions", () => {
  it("regroupe une chaîne de remplacements sous la version courante", () => {
    const v1 = doc("v1", { created_at: "2026-01-01T00:00:00Z" });
    const v2 = doc("v2", {
      version: 2,
      replaces_document_id: "v1",
      created_at: "2026-02-01T00:00:00Z",
    });
    const v3 = doc("v3", {
      version: 3,
      replaces_document_id: "v2",
      created_at: "2026-03-01T00:00:00Z",
    });
    const other = doc("o", { created_at: "2026-02-15T00:00:00Z" });
    const groups = groupVersions([v1, v2, v3, other]);
    expect(groups.map((g) => g.current.id)).toEqual(["v3", "o"]);
    expect(groups[0]!.older.map((d) => d.id)).toEqual(["v2", "v1"]);
    expect(chainIds(groups[0]!)).toEqual(["v3", "v2", "v1"]);
    expect(nextVersion(v3)).toBe(4);
  });
  it("supporte une version précédente archivée (absente de la liste) et une boucle corrompue", () => {
    const v2 = doc("v2", { version: 2, replaces_document_id: "gone" });
    expect(groupVersions([v2])).toHaveLength(1);
    const a = doc("a", { replaces_document_id: "b" });
    const b = doc("b", { replaces_document_id: "a" });
    expect(() => groupVersions([a, b])).not.toThrow();
  });
});

describe("notification d'expiration", () => {
  it("décrit le document et l'échéance", () => {
    expect(
      describeNotification({
        kind: "document_expiring",
        payload: { employee_name: "A B", document_type: "Titre de séjour", days_remaining: 30 },
      }),
    ).toEqual({
      title: "Document bientôt expiré",
      detail: "A B — Titre de séjour — expire dans 30 jours",
    });
  });
});
