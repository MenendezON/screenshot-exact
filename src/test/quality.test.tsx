import { render } from "@testing-library/react";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";

import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { logError, recentErrors, userMessage } from "@/lib/log";

describe("accessibilité de base (axe-core)", () => {
  it("les états chargement / erreur / vide n'ont aucune violation", async () => {
    const { container } = render(
      <main>
        <h1>Page</h1>
        <LoadingState />
        <ErrorState error={new Error("Failed to fetch")} onRetry={() => {}} />
        <EmptyState title="Aucun contrat" hint="Ajoutez un contrat pour commencer." />
      </main>,
    );
    const res = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(res.violations.map((v) => v.id)).toEqual([]);
  });
  it("le lien d'évitement pointe vers la cible focalisable", async () => {
    const { container } = render(
      <div>
        <a href="#contenu">Aller au contenu</a>
        <main id="contenu" tabIndex={-1}>
          <h1>Titre</h1>
        </main>
      </div>,
    );
    const res = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(res.violations.map((v) => v.id)).toEqual([]);
  });
});

describe("journalisation", () => {
  it("garde l'erreur en mémoire et l'écrit dans la console", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logError("test", new Error("boom"));
    expect(recentErrors().at(-1)).toMatchObject({ scope: "test", message: "boom" });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
  it("traduit les erreurs techniques en messages français", () => {
    expect(userMessage(new Error("Failed to fetch"))).toMatch(/Connexion/);
    expect(userMessage(new Error("new row violates row-level security policy"))).toMatch(/droit/);
    expect(userMessage(new Error("Durée maximale dépassée : 24 mois au plus."))).toMatch(/Durée/);
    expect(userMessage(new Error("xyz"))).toBe("Une erreur est survenue. Réessayez.");
  });
});
