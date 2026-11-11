# Tests SQL en local (sans Supabase)

`run-all.sh` crée une base PostgreSQL jetable, y simule les parties de Supabase dont le schéma dépend (`auth.users`, `auth.uid()`, rôles `anon`/`authenticated`/`service_role`, `storage.*` : voir `stubs.sql`), applique les migrations, le jeu de démonstration, les scripts `docs/sql-manuel/` (deux fois), puis exécute tous les tests `supabase/tests/*.test.sql`.

```
# PostgreSQL 15+ avec l'extension btree_gist et pgcrypto, un super-utilisateur
PGHOST=localhost PGPORT=5432 PGUSER=postgres sh supabase/tests/local/run-all.sh
```

Chaque test se termine par une erreur volontaire « RÉSULTATS : N vérifications, 0 échec(s) » (la transaction est annulée). Code de sortie 0 si tous passent.

**Limite** : la simulation n'est pas un vrai Supabase. Le comportement réel de `storage.objects`, des JWT et de `pg_cron` doit être confirmé par la recette (`docs/recette.md`) sur le projet.
