# Scripts SQL à appliquer à la main dans Supabase

Ces scripts réalisent, **sans passer par Lovable**, les demandes de `demande-lovable-schema.md` qui ne touchent pas au cœur du système de permissions. Ils ont été **exécutés et testés** sur un PostgreSQL 16 local (simulation de Supabase : voir `supabase/tests/local/README.md`) : 101 vérifications SQL au total, scripts appliqués deux fois de suite (idempotents).

| Script | Contenu | Demande |
|---|---|---|
| `01-colonnes.sql` | `employees.professional_email`, `employees.nationality_code`, `compensation.contract_id` (+ contrôle « même employé » + rattrapage), `documents.description`, colonnes `professional_email`, `nationality_code`, `last_change` ajoutées à `v_employee_current` | 1, 2, 4, 5, 10d |
| `02-appreciations.sql` | table `employee_reviews`, permission `reviews`, droits par rôle validés, RLS (personne ne voit ses propres appréciations), historique expurgé (ni commentaire ni titre) | 3 |
| `03-api.sql` | `api_clients`, `api_call_log`, durée de vie obligatoire (`api_key_max_days`), clé non modifiable, `purge_api_call_log()` | 10 |
| `04-matrice-permissions.sql` | écriture de `role_permissions` par `admin_it` seul + garde-fou anti-verrouillage | 8 |
| `05-documents.sql` | bucket privé, politiques de stockage, contraintes, versions, journal d'accès, expiration (`generate_document_notifications()`) | 7a–7f |
| `06-droit-import.sql` | action `import_export:import` pour `drh` et `gestionnaire_rh` | 9 (droit seulement) |

## Procédure (Supabase)

1. **Sauvegarde** : Supabase → *Database → Backups* (ou `pg_dump`). Faites d'abord l'essai sur un projet de test si vous en avez un.
2. Ouvrez *SQL Editor → New query*, collez le contenu du script **01**, cliquez *Run*. Attendez « Success ». Puis 02, 03, 04, 05, 06 **dans l'ordre**. Chaque script est dans une transaction : en cas d'erreur, rien n'est appliqué à moitié.
3. Vérifiez : *Table Editor* montre `employee_reviews`, `api_clients`, `api_call_log` ; *Storage* montre le bucket `employee-documents` en privé.
4. **Tâche quotidienne** (une seule fois, après le script 05) : ajoutez les alertes de documents à la tâche planifiée existante, ou créez-en une :
   ```sql
   select cron.schedule('document-notifications', '15 6 * * *', $$ select public.generate_document_notifications() $$);
   select cron.schedule('api-log-purge',          '30 3 * * *', $$ select public.purge_api_call_log(90) $$);
   ```
   (`pg_cron` est déjà activé par la migration `0006`.)
5. **Types TypeScript** : les nouvelles colonnes et tables n'existent pas dans `src/integrations/supabase/types.ts`. Régénérez-les avant d'écrire du code qui les utilise : demander à Lovable de synchroniser le schéma, ou `supabase gen types typescript --project-id <id> > src/integrations/supabase/types.ts`. Sans cela, l'application continue de fonctionner mais ne voit pas les nouveautés.

## Précautions

- **Dérive avec Lovable** : Lovable tient son propre journal de migrations (`drizzle/migrations`). Ces scripts ne s'y inscrivent pas. Ils sont idempotents : si Lovable les rejoue plus tard (collés tels quels dans une demande de migration), rien ne casse. Pour garder un historique unique, vous pouvez aussi coller chaque script à Lovable en lui demandant de l'exécuter **sans le modifier**.
- Le script 02 **remplace** la fonction `can_read_audit_table` (une ligne ajoutée pour `employee_reviews`) ; le script 05 **remplace** la contrainte de types de `notification_recipients` pour y ajouter `document_expiring`. Si Lovable modifie ces objets entre-temps, relisez la définition actuelle avant de rejouer.
- Les contrôles de dépôt de fichiers (script 05) s'appuient sur `storage.objects.metadata` (`size`, `mimetype`), tels que Supabase les remplit : un essai réel avec un PDF est à faire (voir `docs/recette.md`).
- Ce qui n'est **pas** ici et exige Lovable : voir la section « Ce qui nécessite obligatoirement Lovable » de `demande-lovable-schema.md`.
