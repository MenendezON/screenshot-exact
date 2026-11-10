import type { ReactNode } from "react";

import { BrandName } from "@/components/brand";

const SITES = ["Sébikotane", "Sindia", "Dakar"];

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden flex-col justify-between bg-forge p-12 text-sidebar-foreground lg:flex">
        <BrandName inverted />
        <div className="max-w-md">
          <p className="eyebrow text-sidebar-muted">Gestion du personnel</p>
          <h1 className="mt-4 text-4xl font-extrabold leading-[1.05]">
            Chaque matricule, chaque contrat, au même endroit.
          </h1>
          <p className="mt-5 text-sidebar-muted">
            L'outil de suivi du personnel de Fabrimétal Sénégal, accessible depuis le bureau comme
            depuis l'atelier.
          </p>
        </div>
        <ul className="flex flex-wrap gap-2">
          {SITES.map((site) => (
            <li
              key={site}
              className="eyebrow rounded-sm border border-sidebar-border px-3 py-1.5 text-sidebar-foreground"
            >
              {site}
            </li>
          ))}
        </ul>
      </aside>
      <main className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-10 lg:hidden">
            <BrandName />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
