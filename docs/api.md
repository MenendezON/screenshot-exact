# API de lecture — Gestion du personnel

API REST **en lecture seule** pour les applications internes (paie, pointage…). Gérée par l'administrateur IT dans l'application : menu **API et clés**.

Adresse de base : `https://<adresse-de-l-application>/api/v1`

## Authentification

Une clé par application, au format `fms_xxxxxxxx_…`, transmise à chaque appel :

```
Authorization: Bearer fms_xxxxxxxx_…
```
(ou en-tête `X-API-Key`). La clé n'est affichée qu'une fois, à sa création. Seule son empreinte (SHA-256) est conservée. Une clé peut être révoquée à tout moment, avoir une date d'expiration et être limitée à un site.

## Niveaux d'accès (cumulatifs)

| Niveau | Contenu | Usage type |
| --- | --- | --- |
| 1 — `identite` | matricule, nom, prénoms, en poste, statut, poste, catégorie, unité, site principal | Pointage |
| 2 — `contrats` | + type, début et fin du contrat en cours, date de sortie ; ressource `/contracts` | Pointage avancé |
| 3 — `contact` | + téléphone, e-mail, date de naissance | Annuaire |
| 4 — `remuneration` | + salaire net mensuel en vigueur (FCFA) | Paie |

Un niveau insuffisant pour une ressource renvoie `403`. Les champs d'un niveau supérieur ne sont jamais présents dans la réponse.

## Ressources

### `GET /employees`
Paramètres : `presence` = `actifs` (défaut) | `sortis` | `tous` ; `site` = nom du site principal ; `page` (1 par défaut) ; `per_page` (100 par défaut, 200 au plus).

```json
{ "data": [ { "matricule": "F0001", "nom": "Diop", "prenoms": "Awa", "en_poste": true, "statut": "ouvrier",
              "poste": "Soudeur", "categorie": "4OS2", "unite": "Production", "site_principal": "Dakar" } ],
  "page": 1, "per_page": 100, "total": 874 }
```

### `GET /employees/{matricule}`
Un employé, mêmes champs. `404` s'il n'existe pas (ou hors du site de la clé).

### `GET /contracts` *(niveau 2 minimum)*
Paramètres : `matricule`, `page`, `per_page`. Champs : `matricule`, `type`, `debut`, `fin_prevue`, `fin_effective`, `duree_mois`.

## Codes de réponse

`200` succès · `400` paramètre invalide · `401` clé absente, invalide, expirée ou révoquée · `403` niveau insuffisant · `404` introuvable · `429` plus de 120 requêtes par minute (en-tête `Retry-After`) · `500` erreur interne.

## Exemple

```sh
curl -H "Authorization: Bearer $FMS_API_KEY" "https://…/api/v1/employees?presence=actifs&per_page=200&page=1"
```
Parcourir les pages jusqu'à avoir lu `total` lignes.

## Bonnes pratiques

- Ne jamais mettre la clé dans un navigateur, une application mobile ou un dépôt de code ; l'appeler depuis un serveur.
- Une clé par application, avec le niveau le plus bas suffisant.
- En cas de doute ou de départ d'un prestataire : révoquer, puis créer une nouvelle clé.
- Chaque appel est journalisé (application, requête, statut, nombre de lignes) et visible dans l'écran « API et clés ».
