# Recette RH — checklist par module

À dérouler sur l'environnement de recette avec le jeu de démonstration (`supabase/seed.sql`) puis
avec les données réelles importées. Cocher, dater, noter l'anomalie éventuelle.
Comptes nécessaires : un par rôle (drh, gestionnaire_rh, manager, paie, admin_it, lecture).

Légende : **[Auto]** couvert par un test automatique ; **[Manuel]** à vérifier à la main.

## 0. Pré-requis techniques
- [ ] `bun run test` : tous les tests passent. [Auto]
- [ ] `psql … -f supabase/tests/permissions.test.sql` : aucun `[ÉCHEC]`. [Manuel : nécessite une base]
- [ ] `psql … -f supabase/tests/rules.test.sql` : aucun `[ÉCHEC]`. [Manuel : nécessite une base]
- [ ] Sauvegarde faite avant la recette (README → Sauvegarde et restauration).

## 1. Connexion, MFA, session
- [ ] Connexion avec e-mail et mot de passe ; mot de passe oublié → e-mail reçu → nouveau mot de passe.
- [ ] drh / gestionnaire_rh / paie / admin_it : l'accès aux données est refusé tant que l'authentification à deux facteurs n'est pas validée.
- [ ] Déconnexion automatique après la durée d'inactivité du paramètre `session_idle_minutes`. [Auto : logique]
- [ ] Un compte sans rôle actif voit « Accès non attribué ».

## 2. Employés
- [ ] Création d'un employé (matricule unique, champs obligatoires, messages d'erreur en français).
- [ ] Doublon de matricule refusé.
- [ ] Recherche, filtres, tri, export de la liste.
- [ ] Fiche : onglets Identité, Affectation (historique, nouvelle affectation ferme la précédente), Sites (un site principal), Rémunération.
- [ ] Données sensibles (pièce d'identité, rémunération) masquées pour les rôles sans permission.
- [ ] Un manager ne voit que son périmètre (équipe/unité/site). [Auto : RLS en SQL]
- [ ] Aucun bouton de suppression : seul l'archivage existe.

## 3. Organigramme et référentiels
- [ ] Arbre direction → département → service → équipe ; déplacement d'une unité ; interdit de créer un cycle.
- [ ] Archivage d'une unité avec sous-unités actives refusé.
- [ ] Postes, catégories, sites, motifs de sortie : création, modification, archivage.

## 4. Contrats
- [ ] Création CDD : la date de fin = début + durée − 1 jour. [Auto : SQL]
- [ ] Durée supérieure à `fixed_term_max_months` refusée avec message. [Auto : SQL]
- [ ] Contrat qui chevauche un autre : refusé. [Auto : SQL]
- [ ] CDI : pas de durée ni de date de fin.
- [ ] Renouvellement : nouveau contrat lié au précédent (`previous_contract_id`).
- [ ] Conversion CDD → CDI.
- [ ] Écran « Échéances » : liste des fins de contrat dans les délais d'alerte par type ; filtres site/unité ; export.
- [ ] Écran « Retraites » : départs à la retraite à venir selon `retirement_age`.
- [ ] Écran « À régulariser » : CDD échus encore en poste.
- [ ] Destinataires : drh et gestionnaire_rh reçoivent toutes les alertes ; direction reçoit les départs à la retraite uniquement.
- [ ] Notification (cloche) : un CDD finissant dans le délai apparaît ; il disparaît après renouvellement ou sortie. [Auto : SQL]

## 5. Sorties
- [ ] Enregistrement d'une sortie avec motif : la fin du contrat en cours et de l'affectation est posée à la date de sortie.
- [ ] Deux sorties sur le même contrat refusées.
- [ ] Motif confidentiel visible uniquement des rôles autorisés.
- [ ] Réembauche après sortie : l'employé redevient actif, l'ancienneté repart de la nouvelle entrée. [Auto : SQL]

## 6. Documents
- [ ] Dépôt PDF/JPG/PNG ≤ 10 Mo ; autre format ou taille supérieure refusé.
- [ ] Nouvelle version : l'ancienne reste consultable dans l'historique.
- [ ] Ouverture : lien signé valable ~60 s, une ligne est ajoutée à « Accès aux documents ».
- [ ] Document confidentiel invisible pour les rôles non autorisés (essayer avec manager et lecture).
- [ ] Alerte à 30 jours de l'expiration ; archivage d'un document.

## 7. Tableau de bord
- [ ] Effectif actif = nombre d'employés sans sortie (comparer à la liste filtrée « actifs »).
- [ ] Âge moyen/médian, ancienneté moyenne, répartitions (statut, contrat, site, département).
- [ ] Salaires : visibles uniquement avec la permission rémunération.
- [ ] Entrées/sorties par mois et par an ; filtres site/unité ; chaque graphique a son tableau et son export.
- [ ] Un manager voit des chiffres limités à son périmètre.

## 8. Administration
- [ ] Seul admin_it peut inviter, changer un rôle, désactiver, réinitialiser (drh et gestionnaire_rh : consultation seule, boutons absents ou refusés par la base).
- [ ] Utilisateurs : invitation, plusieurs rôles, périmètre, désactivation/réactivation, réinitialisation du mot de passe et du MFA.
- [ ] Permissions : seul admin_it modifie ; matrice rôles × permissions × portée ; impossible de se retirer l'administration (verrou).
- [ ] Journal d'audit : filtres date/utilisateur/table/action ; avant/après en lecture seule ; aucun bouton de modification.
- [ ] Accès aux documents : journal complet des ouvertures.

## 9. Import « SUIVIS DU PERSONNEL FMS » (étape 9)
- [ ] Bouton Importer visible pour drh et gestionnaire_rh uniquement (page Employés).
- [ ] Simulation : aucune écriture ; rapport d'anomalies exportable.
- [ ] Valeurs non rapprochées (départements, postes, catégories) : bloquent l'import tant que le rapprochement n'est pas fait.
- [ ] Exécution en une transaction ; relance sans doublon (clé matricule + date de début).
- [ ] Rapprochement avec le classeur : effectif actif, contrats par type, totaux identiques.
- [ ] Bouton Importer : modèle Excel/CSV téléchargeable ; le modèle rempli est reconnu sans erreur de structure ; une colonne obligatoire absente est signalée.
- [ ] Exécution en base : à recetter après la mise à jour de la base (fonction `run_import`).

## 9 bis. API et clés (admin_it)
- [ ] Seul admin_it voit « API et clés » ; un autre rôle qui ouvre l'adresse voit « Accès réservé » et les fonctions serveur refusent.
- [ ] Date d'expiration obligatoire ; au-delà de 365 jours (ou du paramètre `api_key_max_days`) refusée.
- [ ] Création d'une clé par niveau : elle s'affiche une seule fois ; la liste ne montre que `fms_xxxxxxxx_…`.
- [ ] Niveau 1 : `/employees` sans contrat/coordonnées/salaire ; `/contracts` → 403.
- [ ] Niveau 4 : le salaire apparaît ; niveau 3 : il n'apparaît pas.
- [ ] Clé limitée à un site : seuls les employés de ce site sont renvoyés.
- [ ] Clé révoquée ou expirée → 401 ; clé inventée → 401 ; 121 appels en une minute → 429.
- [ ] `updated_since` : modifier un employé puis appeler avec une date antérieure → il est renvoyé ; avec une date postérieure → absent. (503 tant que la colonne `last_change` n'existe pas.)
- [ ] Chaque appel apparaît dans le journal ; création et révocation dans le journal d'audit.
- [ ] Brancher la paie (niveau 4) et le pointage (niveau 1 ou 2) et comparer les effectifs reçus avec le tableau de bord.

## 9 ter. Appréciations (après mise à jour de la base)
- [ ] drh : voir, créer, modifier, archiver. gestionnaire_rh : voir, créer, modifier.
- [ ] manager : voit seulement les appréciations de son périmètre, sans bouton de création/modification.
- [ ] direction : voit tout, sans création/modification. paie et admin_it : aucun accès.
- [ ] Personne ne voit ses propres appréciations, manager et direction compris.
- [ ] Le journal d'audit n'affiche pas le texte du commentaire.

## 10. Accessibilité et performance
- [ ] Navigation complète au clavier (Tab, Maj+Tab, Entrée, Échap) ; lien « Aller au contenu » au premier Tab.
- [ ] Focus visible partout ; boîtes de dialogue refermées par Échap, focus rendu au déclencheur.
- [ ] Contrastes : vérifier avec l'extension axe DevTools ou Lighthouse sur chaque page principale (le test automatique ne mesure pas les contrastes).
- [ ] Performance : avec ~900 employés et plusieurs milliers de lignes d'historique, mesurer chaque page principale (Employés, Contrats/échéances, Tableau de bord, Journal) : Chrome → DevTools → Performance, ou Lighthouse en navigation « Temps de chargement ». Objectif < 2 s (cache chaud, réseau Dakar).
  Relever ici : Employés … s · Échéances … s · Tableau de bord … s · Journal … s
- [ ] Erreur réseau simulée (mode hors ligne) : message en français et bouton « Réessayer », pas d'écran blanc.
- [ ] Listes vides : message explicite, pas de tableau vide muet.

## Signature
Recette validée par : ____________  Date : ____________  Réserves : ____________
