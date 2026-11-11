#!/bin/sh
# Rejoue TOUT sur une base PostgreSQL locale jetable : simulation des schémas Supabase (stubs.sql),
# migrations Drizzle/Lovable, jeu de démonstration, scripts docs/sql-manuel (appliqués DEUX fois pour vérifier
# l'idempotence), puis tous les tests SQL. Attention : ce n'est PAS un vrai Supabase (voir README.md).
# Usage : PGHOST=... PGPORT=... PGUSER=postgres sh supabase/tests/local/run-all.sh
set -u
cd "$(dirname "$0")/../../.."
DB=${TEST_DB:-fms_test}
psql -d postgres -qc "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB" || exit 2
P="psql -d $DB -q -v ON_ERROR_STOP=1"
$P -f supabase/tests/local/stubs.sql || exit 2
for f in drizzle/migrations/*.sql; do
  case "$f" in *0006_enable_pg_cron*) continue;; esac   # pg_cron n'existe pas en local
  $P -f "$f" 2>&1 | grep -v NOTICE | head -3
done
$P -f supabase/seed.sql 2>&1 | grep -v NOTICE | head -3
for pass in 1 2; do
  for f in docs/sql-manuel/0*.sql; do
    $P -f "$f" 2>&1 | grep -v NOTICE | sed "s|^|[$f passe $pass] |" | head -3
  done
done
fail=0
for t in permissions rules notifications manuel-01-02 manuel-03-04 manuel-05; do
  res=$(psql -d $DB -q -f supabase/tests/$t.test.sql 2>&1 | grep -m1 "RÉSULTATS")
  echo "$t : ${res:-PAS DE RÉSULTAT}"
  case "$res" in *" 0 échec"*) ;; *) fail=1;; esac
done
exit $fail
