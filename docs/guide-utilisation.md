# Guide d'utilisation — Gestion du personnel Fabrimétal

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
- **Fiche** : onglets Identité, Affectation, Sites, Contrats, Documents, Rémunération (selon vos droits).
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
- Déposer une nouvelle version d'un document conserve les précédentes (historique).
- L'ouverture d'un document génère un lien valable environ une minute ; chaque ouverture est tracée.
- Les documents confidentiels sont invisibles pour les rôles non autorisés.
- Une alerte prévient 30 jours avant l'expiration d'un document (titre de séjour, diplôme à renouveler…).

## 6. Tableau de bord
Effectif actif, âge et ancienneté moyens/médians, répartitions, entrées et sorties par mois ou par
année. Filtrez par site ou unité. Les salaires n'apparaissent qu'avec la permission de rémunération.
Chaque graphique a son tableau de données et un export CSV/Excel. Un manager ne voit que son périmètre.

## 7. Administration (DRH, administrateur)
- **Utilisateurs** : inviter, attribuer un ou plusieurs rôles avec leur périmètre, désactiver, réinitialiser le mot de passe ou le MFA.
- **Permissions** : matrice rôles × permissions × portée (tout, site, unité, équipe, soi-même). Le système empêche de se retirer son propre accès d'administration.
- **Journal d'audit** : qui a fait quoi et quand, avec les valeurs avant/après (lecture seule).
- **Accès aux documents** : qui a ouvert quel document.
- **Paramètres** : âge de retraite, durée maximale d'un CDD, délais d'alerte, durée d'inactivité.

## 8. Import du classeur « SUIVIS DU PERSONNEL FMS »
Réservé au DRH et au gestionnaire RH. Principe : (1) charger le classeur, (2) corriger les
rapprochements de valeurs (départements, postes, catégories) — une valeur non rapprochée bloque
l'import, (3) lancer la **simulation** (rien n'est écrit) et exporter le rapport d'anomalies,
(4) corriger la source ou les rapprochements, (5) lancer l'**exécution** — tout ou rien. Relancer le
même fichier ne crée pas de doublons. Voir la note de livraison pour l'état d'avancement de cet écran.

## 9. Aide et incidents
- Message d'erreur en rouge avec « Réessayer » : vérifiez votre connexion puis réessayez.
- « Vous n'avez pas le droit… » : demandez l'accès à l'administrateur RH.
- Signalement : indiquez la page, l'heure et le message affiché ; les erreurs techniques sont consignées automatiquement.
