#!/bin/sh
# Télécharge tous les employés en un CSV (pour KoboToolbox, Excel, etc.).
# Usage : FMS_URL=https://… FMS_API_KEY=fms_… ./export-csv.sh > employes.csv
set -eu
PER=1000; PAGE=1; TOTAL=1
while [ $(( (PAGE - 1) * PER )) -lt "$TOTAL" ]; do
  TMP=$(mktemp)
  curl -fsS -D "$TMP.h" -H "Authorization: Bearer $FMS_API_KEY" \
    "$FMS_URL/api/v1/employees?format=csv&presence=actifs&per_page=$PER&page=$PAGE" -o "$TMP"
  TOTAL=$(grep -i '^x-total-count:' "$TMP.h" | tr -dc '0-9')
  if [ "$PAGE" -eq 1 ]; then cat "$TMP"; else tail -n +2 "$TMP"; fi   # un seul en-tête
  rm -f "$TMP" "$TMP.h"; PAGE=$((PAGE + 1))
done
