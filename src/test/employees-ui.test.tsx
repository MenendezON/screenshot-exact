import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const EMP = "11111111-2222-3333-4444-555555555555";
const SITE = "aaaaaaaa-0000-0000-0000-000000000001";
const UNIT = "bbbbbbbb-0000-0000-0000-000000000001";
const TITLE = "cccccccc-0000-0000-0000-000000000001";

const PERMS: [string, string][] = [
  ...["view", "create", "edit", "archive", "export"].map(
    (a) => ["employees", a] as [string, string],
  ),
  ...["view", "create", "export"].map((a) => ["import_export", a] as [string, string]),
  ["sensitive_data", "view"],
  ["sensitive_data", "edit"],
  ["assignments", "view"],
  ["assignments", "create"],
  ["contracts", "view"],
  ["contracts", "create"],
  ["compensation", "view"],
  ["compensation", "create"],
  ["compensation", "edit"],
  ["documents", "view"],
  ["documents", "create"],
  ["documents", "archive"],
  ["audit", "view"],
  ["referentials", "view"],
];

const employeeRow = {
  id: EMP,
  matricule: "FM-0001",
  first_names: "Awa",
  last_name: "Diop",
  birth_date: "1990-05-12",
  birth_place: "Dakar",
  address: "Pikine",
  marital_status: "marie",
  children_count: 2,
  phone: "+221771234567",
  email: "awa@example.sn",
  manager_id: null,
  archived_at: null,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};
const currentRow = {
  employee_id: EMP,
  matricule: "FM-0001",
  first_names: "Awa",
  last_name: "Diop",
  manager_id: null,
  birth_date: "1990-05-12",
  phone: null,
  email: null,
  archived_at: null,
  org_unit_id: UNIT,
  org_unit_name: "Usinage",
  job_title_id: TITLE,
  job_title_name: "Soudeur",
  category_id: null,
  category_code: "B2",
  status: "ouvrier",
  primary_site_id: SITE,
  primary_site_name: "Dakar",
  site_ids: [SITE],
  contract_id: "k1",
  contract_type: "cdd",
  contract_start: "2026-01-01",
  contract_end: "2026-12-31",
  contract_terminated_on: null,
  exit_date: null,
  is_active: true,
};

const tables: Record<string, unknown[]> = {
  v_employee_current: [currentRow],
  employees: [employeeRow],
  v_employee_metrics: [
    {
      employee_id: EMP,
      hire_date: "2024-03-05",
      age_years: 36,
      seniority_months: 32,
      retirement_date: "2050-05-12",
    },
  ],
  org_units: [
    {
      id: UNIT,
      name: "Usinage",
      type: "departement",
      parent_id: null,
      sort_order: 0,
      archived_at: null,
    },
  ],
  sites: [{ id: SITE, name: "Dakar", archived_at: null }],
  job_titles: [{ id: TITLE, name: "Soudeur", archived_at: null }],
  categories: [
    { id: "cat1", code: "B2", default_status: "ouvrier", sort_order: 1, archived_at: null },
  ],
  exit_reasons: [
    { id: "r1", name: "Démission", is_confidential: false, sort_order: 1, archived_at: null },
  ],
  document_types: [
    {
      id: "dt1",
      name: "Contrat signé",
      confidentiality: "standard",
      retention_months: null,
      sort_order: 1,
      archived_at: null,
    },
  ],
  settings: [
    {
      id: "s1",
      key: "fixed_term_max_months",
      label: "Durée max",
      description: null,
      value: 24,
      unit: "mois",
      updated_at: "2026-01-01T00:00:00Z",
    },
  ],
  assignments: [
    {
      id: "a1",
      employee_id: EMP,
      org_unit_id: UNIT,
      job_title_id: TITLE,
      category_id: "cat1",
      status: "ouvrier",
      start_date: "2025-01-01",
      end_date: null,
      archived_at: null,
    },
  ],
  contracts: [
    {
      id: "k1",
      employee_id: EMP,
      type: "cdd",
      start_date: "2026-01-01",
      duration_months: 12,
      end_date: "2026-12-31",
      terminated_on: null,
      archived_at: null,
    },
  ],
  compensation: [
    {
      id: "p2",
      employee_id: EMP,
      net_monthly_salary_fcfa: 480000,
      effective_date: "2026-01-01",
      archived_at: null,
    },
    {
      id: "p1",
      employee_id: EMP,
      net_monthly_salary_fcfa: 450000,
      effective_date: "2025-01-01",
      archived_at: null,
    },
  ],
  documents: [
    {
      id: "d1",
      employee_id: EMP,
      document_type_id: "dt1",
      storage_path: `${EMP}/x-contrat.pdf`,
      file_name: "contrat.pdf",
      mime_type: "application/pdf",
      size_bytes: 2048,
      document_date: "2026-01-02",
      expires_on: "2020-01-01",
      created_at: "2026-01-02T00:00:00Z",
      archived_at: null,
    },
  ],
  employee_sites: [
    { id: "es1", employee_id: EMP, site_id: SITE, is_primary: true, archived_at: null },
  ],
  employee_sensitive: [
    {
      id: "x1",
      employee_id: EMP,
      id_document_type: "cni",
      id_document_number: "1234567890",
      emergency_contact_name: "Moussa Diop",
      emergency_contact_relation: "Frère",
      emergency_contact_phone: null,
    },
  ],
  v_exit_details: [],
  v_contract_alerts: [
    {
      days_remaining: 20,
      to_notify: true,
      to_regularize: false,
      reference_date: "2026-11-30",
      contract_type: "cdd",
    },
  ],
  audit_log: [
    {
      id: "l1",
      created_at: "2026-02-01T10:00:00Z",
      created_by: "u1",
      table_name: "employees",
      action: "UPDATE",
      old_data: { last_name: "Dop" },
      new_data: { last_name: "Diop" },
      changed_fields: ["last_name"],
    },
  ],
  profiles: [{ id: "u1", full_name: "Nelson M.", email: "n@example.sn" }],
};

vi.mock("@/integrations/supabase/client", () => {
  const builder = (table: string) => {
    const rows = () => (tables[table] ?? []) as unknown[];
    const b: unknown = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then")
            return (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
              Promise.resolve({ data: rows(), count: rows().length, error: null }).then(res, rej);
          if (prop === "maybeSingle" || prop === "single")
            return () => Promise.resolve({ data: rows()[0] ?? null, error: null });
          return () => b;
        },
      },
    );
    return b;
  };
  return {
    supabase: {
      from: (t: string) => builder(t),
      rpc: (name: string) =>
        Promise.resolve({
          data:
            name === "get_my_role"
              ? "drh"
              : name === "get_my_permissions"
                ? PERMS.map(([resource, action]) => ({ resource, action, scope: "all" }))
                : name === "my_mfa_required"
                  ? true
                  : null,
          error: null,
        }),
      storage: {
        from: () => ({
          createSignedUrl: async () => ({ data: null, error: new Error("x") }),
          upload: async () => ({ error: null }),
          remove: async () => ({}),
        }),
      },
      auth: {
        getUser: async () => ({ data: { user: { id: "u1", email: "n@example.sn" } }, error: null }),
        getSession: async () => ({ data: { session: { user: { id: "u1" } } }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        signOut: async () => ({}),
        mfa: {
          getAuthenticatorAssuranceLevel: async () => ({
            data: { currentLevel: "aal2", nextLevel: "aal2" },
            error: null,
          }),
        },
      },
    },
  };
});

// Importé après le mock : l'arbre de routes charge le client Supabase.
import { routeTree } from "@/routeTree.gen";

// La coque racine rend un document <html> complet, impossible à monter dans le conteneur de test.
(routeTree.options as { shellComponent?: unknown }).shellComponent = ({
  children,
}: {
  children: React.ReactNode;
}) => <>{children}</>;

async function renderAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

// Radix Select s'appuie sur des API de pointeur absentes de jsdom.
Element.prototype.hasPointerCapture = () => false;
Element.prototype.releasePointerCapture = () => {};
Element.prototype.scrollIntoView = () => {};

let errors: unknown[][] = [];
beforeEach(() => {
  errors = [];
  vi.spyOn(console, "error").mockImplementation((...args) => void errors.push(args));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const reactErrors = () =>
  errors.filter(
    (e) =>
      /Warning|Error:|Cannot|Each child|act\(/.test(String(e[0])) &&
      !/not wrapped in act/.test(String(e[0])),
  );

vi.setConfig({ testTimeout: 30_000 });

describe("module Employés (rendu réel)", () => {
  it("affiche la liste avec filtres, tri, pagination et boutons selon les permissions", async () => {
    await renderAt("/employes");
    expect(
      await screen.findByText("Diop", { exact: false }, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Employés" })).toBeInTheDocument();
    expect(screen.getByLabelText("Rechercher un employé")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Exporter/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Nouvel employé/ })).toBeInTheDocument();
    expect(screen.getByText("Soudeur")).toBeInTheDocument();
    expect(screen.getByText(/1–1 sur 1/)).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Employé/ })).toHaveAttribute(
      "aria-sort",
      "ascending",
    );
    expect(reactErrors()).toEqual([]);
  });

  it("ouvre le formulaire de création et affiche les erreurs de validation en français", async () => {
    await renderAt("/employes");
    fireEvent.click(
      await screen.findByRole("button", { name: /Nouvel employé/ }, { timeout: 5000 }),
    );
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Créer le dossier" }));
    await waitFor(() =>
      expect(
        within(dialog).getAllByText("Ce champ est obligatoire.").length,
      ).toBeGreaterThanOrEqual(3),
    );
    fireEvent.change(within(dialog).getByLabelText("E-mail"), { target: { value: "oups" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Créer le dossier" }));
    expect(await within(dialog).findByText("Adresse e-mail non valide.")).toBeInTheDocument();
    expect(reactErrors()).toEqual([]);
  });

  it("rend la fiche et chacun de ses six onglets", async () => {
    await renderAt(`/employes/${EMP}`);
    expect(
      await screen.findByRole("heading", { name: "Awa Diop" }, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Identité",
      "Poste",
      "Contrats et sortie",
      "Rémunération",
      "Documents",
      "Historique",
    ]);
    expect(await screen.findByText("1234567890")).toBeInTheDocument();

    const expectations: [string, RegExp][] = [
      ["Poste", /Historique/],
      ["Contrats et sortie", /Échéance proche/],
      ["Rémunération", /480\s?000/],
      ["Documents", /contrat\.pdf/],
      ["Historique", /Nom Dop → Diop/],
    ];
    for (const [tab, text] of expectations) {
      fireEvent.mouseDown(screen.getByRole("tab", { name: tab }));
      fireEvent.click(screen.getByRole("tab", { name: tab }));
      expect(await screen.findByText(text, undefined, { timeout: 5000 })).toBeInTheDocument();
      if (tab === "Documents") expect(screen.getByText("Expiré")).toBeInTheDocument();
    }
    expect(reactErrors()).toEqual([]);
  });

  it("valide le formulaire de contrat en français", async () => {
    await renderAt(`/employes/${EMP}?onglet=contrats`);
    fireEvent.click(
      await screen.findByRole("button", { name: /Nouveau contrat/ }, { timeout: 5000 }),
    );
    const dialog = await screen.findByRole("dialog");
    fireEvent.keyDown(within(dialog).getByRole("combobox"), { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: "CDD" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Enregistrer" }));
    expect(
      await within(dialog).findByText("La durée en mois est obligatoire pour ce type de contrat."),
    ).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Durée (mois)"), { target: { value: "30" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Enregistrer" }));
    expect(
      await within(dialog).findByText("Durée maximale dépassée : 24 mois au plus."),
    ).toBeInTheDocument();
  });

  it("rend l'organigramme et son filtre par site", async () => {
    await renderAt("/organigramme");
    expect(
      await screen.findByRole("heading", { name: "Organigramme" }, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Usinage", undefined, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText(/1 collaborateur en poste/)).toBeInTheDocument();
    expect(screen.getByText("Awa", { exact: false })).toBeInTheDocument();
    expect(reactErrors()).toEqual([]);
  });

  it("garde une URL de fiche invalide sans planter", async () => {
    await renderAt("/employes/pas-un-uuid");
    expect(
      await screen.findByText(/Dossier introuvable/, undefined, { timeout: 5000 }),
    ).toBeInTheDocument();
  });
});
