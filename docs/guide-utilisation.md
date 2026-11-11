# Guide d'utilisation — Gestion du personnel Fabrimétal

Ce guide est aussi disponible dans l'application, menu **Guide d'utilisation**, pour tous les utilisateurs connectés.

Destiné aux équipes RH, aux managers et à la paie. Ce que vous voyez dépend de votre rôle : un menu
absent signifie que votre rôle n'y donne pas accès.

## 1. Se connecter
1. Ouvrez l'application, saisissez votre e-mail et votre mot de passe.
2. Les rôles DRH, gestionnaire RH, paie et administrateur IT doivent aussi saisir le code à six
   chiffres de leur application d'authentification (première fois : scanner le QR code).
3. Mot de passe oublié : « Mot de passe oublié » sur l'écran de connexion, puis suivez le lien reçu.
4. Après une période d'inactivité (30 minutes par défaut), vous êtes déconnecté par sécurité.

Au clavier : la touche Tab parcourt les éléments ; le premier arrêt est « Aller au contenu ».

## 2. Employés
- **Liste** : recherche par nom ou matricule, filtres (site, unité, statut), export.
- **Créer** : bouton « Nouvel employé ». Le matricule est unique et obligatoire.
- **Fiche** : onglets Identité, Poste, Contrats et sortie, Rémunération, Documents, Appréciations, Historique (selon vos droits). L'onglet Identité contient l'e-mail personnel, l'**e-mail professionnel** (facultatif) et la **nationalité** (liste de pays, le Sénégal en premier).
- **Rémunération** : chaque ligne peut être rattachée à un **contrat** de l'employé (facultatif).
- **Changer d'affectation** : ajoutez une nouvelle affectation avec sa date de début ; la précédente est fermée la veille.
- **Supprimer** n'existe pas : on **archive**. Une fiche archivée reste dans l'historique et le journal.

## 3. Contrats
- **Nouveau contrat** (onglet Contrats de la fiche) : type (CDI, CDD, stage, consultant), date de début, durée en mois pour les contrats à durée déterminée. La date de fin est calculée (début + durée − 1 jour).
- La durée ne peut pas dépasser le maximum légal paramétré (24 mois par défaut) ; deux contrats d'un même employé ne peuvent pas se chevaucher.
- **Renouveler** : crée le contrat suivant, lié au précédent. **Convertir en CDI** : clôt le CDD et ouvre un CDI.
- **Échéances** : contrats qui se terminent bientôt (délai d'alerte selon le type). **Retraites** : départs à la retraite à venir. **À régulariser** : CDD échus dont l'employé est toujours en poste — renouvelez ou enregistrez la sortie.
- **Cloche** (en haut à droite) : alertes du jour ; elles disparaissent quand la situation est régularisée.

## 4. Sorties
Dans la fiche : « Enregistrer une sortie », date et motif. Le contrat et l'affectation en cours sont
clos à cette date. Certains motifs sont confidentiels et ne s'affichent qu'aux rôles autorisés.
Si la personne revient, créez simplement un nouveau contrat : elle redevient active et son ancienneté
repart de la nouvelle date d'entrée.

## 5. Documents
- Formats PDF, JPG, PNG ; 10 Mo maximum.
- Une **description** facultative (500 caractères) peut accompagner chaque document ; ne mettez pas d'information sensible.
- Déposer une nouvelle version d'un document conserve les précédentes (historique).
- L'ouverture d'un document génère un lien valable environ une minute ; chaque ouverture est tracée.
- Les documents confidentiels sont invisibles pour les rôles non autorisés.
- Une alerte prévient 30 jours avant l'expiration d'un document (titre de séjour, diplôme à renouveler…).

## 6. Tableau de bord
Effectif actif, âge et ancienneté moyens/médians, répartitions, entrées et sorties par mois ou par
année. Filtrez par site ou unité. Les salaires n'apparaissent qu'avec la permission de rémunération.
Chaque graphique a son tableau de données et un export CSV/Excel. Un manager ne voit que son périmètre.

## 7. Administration
La gestion des comptes et des droits est réservée à l'**administrateur IT** (`admin_it`). Le DRH et le gestionnaire RH **consultent** les écrans Utilisateurs et Permissions ; pour créer un compte, changer un rôle, désactiver un accès ou réinitialiser un mot de passe ou un MFA, ils contactent l'administrateur IT.
- **Utilisateurs** : inviter, attribuer un ou plusieurs rôles avec leur périmètre, désactiver, réinitialiser le mot de passe ou le MFA.
- **Permissions** : matrice rôles × permissions × portée (tout, site, unité, équipe, soi-même). Le système empêche de se retirer son propre accès d'administration.
- **API et clés** (administrateur IT uniquement) : voir le chapitre 10.
- **Journal d'audit** : qui a fait quoi et quand, avec les valeurs avant/après (lecture seule).
- **Accès aux documents** : qui a ouvert quel document.
- **Paramètres** : âge de retraite, durée maximale d'un CDD, délais d'alerte, durée d'inactivité, et « Notifications par e-mail » (interrupteur). L'onglet **Alertes** indique quels rôles reçoivent chaque type d'alerte dans la cloche (administrateur IT et DRH).

## 8. Import du classeur « SUIVIS DU PERSONNEL FMS »
Réservé au DRH et au gestionnaire RH. Principe : (1) charger le classeur, (2) corriger les
rapprochements de valeurs (départements, postes, catégories) — une valeur non rapprochée bloque
l'import, (3) lancer la **simulation** (rien n'est écrit) et exporter le rapport d'anomalies,
(4) corriger la source ou les rapprochements, (5) lancer l'**exécution** — tout ou rien. Relancer le
même fichier ne crée pas de doublons. Le bouton **Importer** de la page Employés propose le **modèle de fichier** (Excel ou CSV, avec une feuille d'instructions) et un **contrôle** du fichier sans rien enregistrer. L'enregistrement définitif sera disponible après la mise à jour de la base.

## 9. Appréciations
Onglet **Appréciations** de la fiche (visible si votre rôle y a droit). Une appréciation a une nature (contrat, performance, autre), une date, une note de 1 à 5 facultative, un titre facultatif et un commentaire. Le texte n'apparaît jamais dans l'historique. Les appréciations (de contrat, de performance) sont confidentielles. Le **DRH** les crée, les modifie et les archive ; le **gestionnaire RH** les crée et les modifie ; le **manager** (son périmètre) et la **direction** peuvent seulement les **consulter** ; la paie et l'administrateur IT n'y ont pas accès. Un employé ne voit jamais ses propres appréciations.

## 10. Donner accès aux données à d'autres applications (administrateur IT)
Menu **API et clés**. Chaque application (paie, pointage…) reçoit sa propre clé, en lecture seule.
1. **Nouvelle clé** : nom de l'application, niveau d'accès (1 identité, 2 contrats, 3 coordonnées, 4 rémunération), site éventuel, date d'expiration.
2. La **durée de vie est obligatoire** : 365 jours au plus (paramètre « Durée de vie maximale d'une clé d'API »). Pour renouveler, créer une nouvelle clé puis révoquer l'ancienne.
3. La clé s'affiche **une seule fois** : la copier et la transmettre de façon sécurisée. Si elle est perdue, la révoquer et en créer une autre.
4. Choisir le niveau le plus bas suffisant : niveau 4 pour la paie seulement. Pour un rapport Power BI partagé, niveau 1 ou 2.
5. **Révoquer** coupe l'accès immédiatement. Le tableau des 100 derniers appels montre qui a lu quoi.
Détails techniques pour les développeurs : `docs/api.md`.

## 11. Aide et incidents
- Message d'erreur en rouge avec « Réessayer » : vérifiez votre connexion puis réessayez.
- « Vous n'avez pas le droit… » : demandez l'accès à l'administrateur RH.
- Signalement : indiquez la page, l'heure et le message affiché ; les erreurs techniques sont consignées automatiquement.
