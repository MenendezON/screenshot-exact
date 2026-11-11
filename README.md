# Fabri RH — Gestion du personnel de Fabrimétal Sénégal

Application interne de gestion du personnel de Fabrimétal Sénégal : fiches employés, organigramme,
contrats et sorties, documents, tableau de bord, administration (utilisateurs, permissions, journal).

Pile : TanStack Start (React 19, TanStack Router/Query), Tailwind 4 + shadcn/ui, Supabase
(Postgres + RLS + Storage + Auth/MFA), Vitest, Recharts. Le projet est synchronisé avec Lovable.

## Installation

Prérequis : [Bun](https://bun.sh) (ou Node 20+ et npm), un projet Supabase.

```sh
git clone https://github.com/MenendezON/screenshot-exact.git
cd screenshot-exact
bun install
# .env est géré par Lovable (valeurs publiques uniquement) ; .env.example liste toutes les variables
# les secrets (clé service, secret du cron) se définissent dans Lovable → secrets, jamais dans Git
bun run dev            # http://localhost:3000 (port indiqué par Vite au démarrage)
```

## Variables d'environnement

Le fichier `.env` versionné ne contient que des valeurs publiques (géré par Lovable). Les secrets (`SUPABASE_SERVICE_ROLE_KEY`, `LOVABLE_CRON_SECRET`, `LOVABLE_DB_MIGRATION_URL`) ne doivent jamais être committés.

| Variable | Où | Rôle |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | navigateur | URL du projet Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | navigateur | clé publique (anon) |
| `VITE_SUPABASE_PROJECT_ID` | navigateur | identifiant du projet |
| `SUPABASE_URL` | serveur | idem, côté fonctions serveur |
| `SUPABASE_PUBLISHABLE_KEY` | serveur | clé publique, vérification des jetons |
| `SUPABASE_SERVICE_ROLE_KEY` | serveur **uniquement** | opérations privilégiées (invitation, réinitialisation MFA, URL signées). Contourne la RLS : ne jamais l'exposer au navigateur |
| `LOVABLE_CRON_SECRET` | serveur | secret des routes appelées par le planificateur (notifications quotidiennes) |
| `LOVABLE_DB_MIGRATION_URL` | poste de développeur | chaîne de connexion Postgres pour `drizzle-kit` |

## Base de données : migrations, jeu de démonstration, tests

Les migrations sont dans `drizzle/migrations/` (ordre numérique). **Elles sont appliquées par
Lovable** : ne pas les modifier à la main. Tout changement de schéma passe par une demande à Lovable
(voir `AGENTS.md`).

Hors Lovable (base locale ou nouvel environnement) :

```sh
# appliquer les migrations dans l'ordre
for f in drizzle/migrations/*.sql; do psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"; done

# jeu de démonstration fictif (40 employés DEMO001–DEMO040, idempotent)
psql "$DATABASE_URL" -f supabase/seed.sql
```

Tests SQL (exécutés dans une transaction annulée ; le script se termine toujours par une erreur
« RÉSULTATS » qui liste les vérifications `[OK]` / `[ÉCHEC]`) :

```sh
psql "$DATABASE_URL" -f supabase/tests/permissions.test.sql   # RLS par rôle
psql "$DATABASE_URL" -f supabase/tests/rules.test.sql          # règles de gestion
psql "$DATABASE_URL" -f supabase/tests/notifications.test.sql  # alertes quotidiennes
# après application des scripts docs/sql-manuel/ (voir son README) :
psql "$DATABASE_URL" -f supabase/tests/manuel-01-02.test.sql   # colonnes, appréciations
psql "$DATABASE_URL" -f supabase/tests/manuel-03-04.test.sql   # clés d'API, matrice
psql "$DATABASE_URL" -f supabase/tests/manuel-05.test.sql      # documents
```

Sans projet Supabase : `sh supabase/tests/local/run-all.sh` rejoue tout sur un PostgreSQL local
(voir `supabase/tests/local/README.md`).

Tests applicatifs et qualité :

```sh
bun run test            # Vitest : règles métier, permissions UI, import, tableau de bord, accessibilité (axe), performance
bunx tsc --noEmit       # vérification des types
bun run lint
bun run build           # build de production
```

## Sauvegarde et restauration

À faire avant toute migration ou import, et à planifier (au moins quotidien).

**Sauvegarde**
1. Base : `pg_dump "$DATABASE_URL" --format=custom --no-owner --file=fms-$(date +%F).dump`
   (chaîne de connexion directe du projet Supabase). Les plans payants ajoutent des sauvegardes
   quotidiennes et la restauration à un instant donné (PITR) dans le tableau de bord Supabase.
2. Documents : copier le bucket privé `employee-documents` (tableau de bord Supabase → Storage, ou
   `supabase storage cp -r ss:///employee-documents ./sauvegarde-docs`).
3. Conserver dump et documents ensemble, chiffrés, hors du projet Supabase.

**Restauration**
1. Créer (ou vider) un projet Supabase cible ; y appliquer les migrations (section précédente) pour
   obtenir rôles, fonctions et politiques.
2. `pg_restore --clean --if-exists --no-owner --dbname "$DATABASE_URL" fms-AAAA-MM-JJ.dump`
3. Recopier le bucket de documents ; vérifier qu'un document s'ouvre depuis une fiche employé.
4. Renseigner les variables d'environnement du nouvel environnement.
5. Vérifier : connexion + MFA d'un compte DRH, effectif actif du tableau de bord = effectif attendu,
   `docs/recette.md` (section Administration).

Faire un essai de restauration sur un projet de test avant d'en avoir besoin.

## Documentation

- `docs/guide-utilisation.md` — guide d'utilisation pour les équipes RH.
- `docs/api.md` — API de lecture pour les autres applications (clés, niveaux, ressources).
- `docs/recette.md` — checklist de recette RH par module.
- `AGENTS.md` — règles de collaboration avec Lovable.
