# NEXIS Projets — Gestion de projet

Module de gestion de projet de la suite NEXIS, avec une interface inspirée d'Odoo (violet `#714B67`, turquoise `#017E84`, thèmes clair et sombre).

- **Client** : React (Vite)
- **Serveur** : Node.js (Express 5)
- **Données** : un projet Supabase dédié, distinct de celui de NEXIS Identity
- **Authentification** : SSO depuis NEXIS Identity, sans page de connexion

---

## Sommaire

1. [Fonctionnalités](#1-fonctionnalités)
2. [Options et paramètres](#2-options-et-paramètres)
3. [Droits et rôles](#3-droits-et-rôles)
4. [Architecture](#4-architecture)
5. [Installation](#5-installation)
6. [Variables d'environnement](#6-variables-denvironnement)
7. [Base de données](#7-base-de-données)
8. [Référence de l'API](#8-référence-de-lapi)
9. [Tests](#9-tests)
10. [Limites connues](#10-limites-connues)
11. [Historique des étapes](#11-historique-des-étapes)

---

## 1. Fonctionnalités

### 1.1 Projets
- Liste des projets sous forme de **cartes** avec recherche et **barre d'avancement**.
- Création dans une fenêtre « Créer un projet » : nom, description, statut, priorité, échéance.
- Statuts d'un projet : **Planifié, Actif, En pause, Terminé**.
- Modification en ligne du titre, du statut, de la priorité et de l'échéance depuis l'en-tête du projet.
- Suppression d'un projet (réservée aux rôles qui ont `projects.delete`). Les tâches et les fichiers joints sont supprimés avec lui ; les lignes du journal d'activité sont conservées.
- Écran **Paramètres du projet** (engrenage à côté du titre) : voir [§2](#2-options-et-paramètres).

### 1.2 Sections d'un projet
Trois onglets sous l'en-tête :

| Onglet | Contenu |
|---|---|
| **Tâches** | Toutes les vues de tâches décrites ci-dessous |
| **Jalons** | Liste et gestion des tâches marquées comme jalons (★) |
| **Tableau de bord** | Indicateurs du projet |

### 1.3 Vues des tâches
Cinq vues, sélectionnables dans le commutateur en haut à droite. Elles partagent la même recherche et les mêmes filtres.

| Vue | Ce qu'elle apporte |
|---|---|
| **Kanban** | Colonnes par statut, glisser-déposer pour changer de statut. Les cartes affichent priorité, échéance, assigné, étiquettes et compteurs (💬 commentaires, 📎 pièces jointes, ☑ sous-tâches). |
| **Liste** | Tableau avec groupes repliables, actions au survol d'une ligne. |
| **Planning (Gantt)** | Barres de temps groupées par responsable, navigation par mois (précédent, suivant, aujourd'hui), couleurs selon priorité et statut, flèches de dépendance (voir §1.5). |
| **Calendrier** | Grille mensuelle (7 colonnes), tâches placées à leur échéance, couleur par responsable, panneau latéral pour filtrer par responsable, navigation par mois. |
| **Rapports** | Graphiques par étape et par responsable : barres, courbes ou secteurs, avec empilement et tri croissant ou décroissant. |

Dans toutes les vues, le bouton **ℹ** ouvre une **barre latérale de détails** (`TaskSidebar`) pour consulter une tâche sans ouvrir le formulaire complet. Un clic sur le titre ouvre le formulaire.

### 1.4 Recherche, filtres et regroupements
- Barre de recherche à **facettes** : texte libre, filtres, « Regrouper par ».
- **Favoris** : les recherches enregistrées sont stockées dans le navigateur (pas côté serveur).
- Filtre par **étiquette** (« Toutes les étiquettes »), compteur de tâches visibles.
- Chaque vue respecte la recherche en cours.

### 1.5 Formulaire de tâche

**En-tête**
- Barre de statut en **chevrons** (Nouveau, En cours, En revue, Terminé) correspondant aux statuts `À faire, En cours, En revue, Terminée`.
- Chaque étape visitée affiche sa **durée** (« 25 min », « 17 h », « 3 j »). Les passages répétés dans une même étape s'additionnent, l'étape en cours continue de compter, et une infobulle donne la date d'entrée et le total.

**Champs**
- Titre, description, statut, **priorité** (Basse, Moyenne, Haute, Urgente), **échéance**, **assigné**, **étiquettes**, case **jalon**.
- L'assigné est choisi parmi les membres actifs de l'organisation (liste fournie par NEXIS Identity).
- Les étiquettes sont du texte libre ; leur couleur est déduite du nom, donc stable partout.

**Onglets**
- **Description**
- **Sous-tâches** : un seul niveau, avec cases à cocher et compteur sur la carte.
- **Pièces jointes** : 10 Mo par fichier, 10 fichiers par tâche, stockage privé, téléchargement uniquement (pas d'aperçu).
- **Activités** : à planifier, de type À faire, Appel, E-mail, Réunion ou Note.
- **Feuilles de temps** : lignes avec date, employé, description et durée en minutes, édition en ligne, total et reste calculés (8 heures allouées par défaut).
- **Dépendances** : tâches bloquantes. Une tâche ne peut commencer que si ses dépendances sont terminées.

**Discussion**
- Commentaires sous la tâche, avec compteur sur la carte.

### 1.6 Dépendances et flèches du Gantt
- Une flèche part de la tâche bloquante et arrive sur la tâche qui l'attend ; elle passe derrière les barres.
- Au survol d'une barre, ses flèches sont mises en évidence et les autres s'estompent.
- Une flèche **rouge en pointillés** signale un conflit : la tâche bloquante n'est pas terminée et son échéance tombe après celle de la tâche qui l'attend. Une légende l'explique sous le planning.
- Une flèche n'est affichée que si les deux tâches sont visibles (dans le mois, groupe déplié, non filtrées).
- Le serveur vérifie que les deux tâches appartiennent au même projet à la création d'une dépendance.

### 1.7 Jalons
- Toute tâche peut être marquée comme jalon (indicateur ★) ou retirée de cette liste.
- L'onglet **Jalons** liste ceux du projet.

### 1.8 Mes tâches
- Toutes les tâches qui vous sont assignées, tous projets confondus.
- Alerte de retard (échéance passée et tâche non terminée).
- Filtres : statut, priorité, échéance, étiquette, recherche. Le changement de statut est possible depuis cet écran.

### 1.9 Tableau de bord
- Chiffres clés de l'organisation : tâches par statut, retards, etc.
- Charge par membre, avec les noms affichés.
- Flux d'**activité** récent.

### 1.10 Journal d'activité
- Chaque création, modification (avec le détail), suppression, commentaire, pièce jointe ajoutée, etc. produit une ligne.
- Consultable avec pagination (`limit`, `before`).
- Si l'écriture du journal échoue, l'action de l'utilisateur n'est pas bloquée (l'erreur est écrite dans les logs du serveur).

### 1.11 Interface
- Thème **clair et sombre** selon le système ; l'attribut `data-theme` de la racine permet de forcer l'un ou l'autre.
- Barre du haut avec navigation, nom de l'organisation et retour vers NEXIS.
- Adaptée au **mobile** (en-tête qui se replie, cibles tactiles plus grandes).
- Focus clavier visible et animations réduites pour les personnes qui le demandent.

---

## 2. Options et paramètres

### 2.1 Paramètres d'un projet
Stockés dans la colonne `settings` (jsonb) de la table `projects`.

| Option | Effet |
|---|---|
| Dépendances | Active l'onglet Dépendances et les flèches du Gantt |
| Jalons | Active la gestion des jalons |
| Tâches récurrentes | Option de configuration |
| Feuilles de temps | Active l'onglet Feuilles de temps |
| Documents | Option de configuration |
| Visibilité | **Privé**, **Interne** ou **Public** |

L'écran comporte les onglets **Description** et **Paramètres**.

> Pour les options « Tâches récurrentes » et « Documents », l'écran de configuration existe, mais je n'ai pas pu vérifier ici qu'elles pilotent un comportement dans les autres écrans. À confirmer dans le code client.

### 2.2 Valeurs de référence

| Élément | Valeurs |
|---|---|
| Statut de projet | `planned` Planifié · `active` Actif · `on_hold` En pause · `done` Terminé |
| Statut de tâche | `todo` À faire · `in_progress` En cours · `review` En revue · `done` Terminée |
| Priorité | `low` Basse · `medium` Moyenne · `high` Haute · `urgent` Urgente |
| Types d'activité | À faire · Appel · E-mail · Réunion · Note |

### 2.3 Limites configurables
| Élément | Valeur |
|---|---|
| Taille d'un fichier joint | 10 Mo |
| Fichiers par tâche | 10 |
| Temps alloué par défaut (feuilles de temps) | 8 heures |
| Cache des permissions côté serveur | 30 secondes |

---

## 3. Droits et rôles

Les droits viennent de NEXIS Identity (`GET {NEXIS_IDENTITY_URL}/api/me`). Un administrateur de la plateforme a tous les droits.

| Action | Droit requis |
|---|---|
| Voir projets, tâches, « Mes tâches », tableau de bord, activité | `projects.read` |
| Créer un projet | `projects.create` |
| Modifier un projet | `projects.update` |
| Supprimer un projet | `projects.delete` |
| Créer, modifier, supprimer une tâche | `projects.update` |
| Commenter | `projects.update` |
| Supprimer un commentaire ou une pièce jointe | le sien : `projects.update` · n'importe lequel : `projects.delete` |
| Envoyer une pièce jointe | `projects.update` |
| Activités, feuilles de temps, dépendances | lire `projects.read` · écrire `projects.update` |
| Affecter une tâche | en plus, `users.read` dans Identity |

| Rôle | Voir | Créer un projet | Modifier projets et tâches | Supprimer un projet |
|---|---|---|---|---|
| organization_admin | oui | oui | oui | oui |
| manager | oui | oui | oui | non |
| user | oui | non | oui | non |
| viewer | oui | non | non | non |

Notes :
- L'interface ne masque pas les boutons selon les droits : un refus s'affiche comme message d'erreur (403 « Accès refusé »).
- Les données d'une organisation sont invisibles aux membres des autres organisations.
- L'assigné d'une tâche doit être un membre actif de l'organisation (vérifié côté serveur).

---

## 4. Architecture

```
NEXIS Identity ──(jeton dans le fragment d'URL)──► Client React (Vite)
       ▲                                                 │ Authorization: Bearer …
       │ GET /api/me (permissions, membres)              ▼
       └──────────────────────────────────────── Serveur Express
                                                         │ service_role
                                                         ▼
                                          Supabase « données du module »
                                          (RLS activée sans policy, bucket privé)
```

### Connexion (SSO)
1. L'administrateur renseigne l'URL du module `projects` dans NEXIS Identity (`/dashboard/modules`).
2. L'utilisateur clique sur « Projets » : NEXIS ouvre le module avec le jeton dans le fragment (`/#access_token=…`).
3. Le client range le jeton dans `sessionStorage`, nettoie l'URL, puis l'envoie à chaque requête.
4. Le serveur vérifie le JWT du projet Supabase d'Identity, puis lit les permissions (cache de 30 s).
5. Jeton absent ou expiré : le client renvoie vers `NEXIS/dashboard/ouvrir/projects`, qui renouvelle la session et rouvre le module.

### Deux projets Supabase
- **Identity** : comptes, organisations, rôles. Ce module ne l'écrit jamais.
- **Données du module** : accessible uniquement par le serveur (clé `service_role`).

### Structure du dépôt (fichiers connus)
```
nexis-projets/
├─ client/src/            index.css, labels.js, composants React
├─ server/src/            routes/ (projects, tasks, dependencies, projectDependencies, statusHistory…), history.js
├─ server/test/           api.test.js
├─ supabase/migrations/   scripts SQL à exécuter dans l'ordre
├─ README.md
└─ DEPLOIEMENT.md
```

---

## 5. Installation

Prérequis : Node 22 recommandé (éviter < 20), un projet Supabase dédié, un NEXIS Identity en fonctionnement.

```bash
npm install
cp server/.env.example server/.env
cp client/.env.example client/.env
# renseigner les variables (voir §6), exécuter les migrations (voir §7)
npm run dev        # API sur :4000, client sur :5173
```

Ouvrir ensuite le module **depuis NEXIS** (il n'y a pas de page de connexion).

Production :
```bash
npm start -w server          # serveur
npm run build                # client → client/dist (à publier en HTTPS)
```
Voir `DEPLOIEMENT.md` pour la liste de contrôle complète (hébergement, HTTPS, activation du module par organisation, parcours de test sur la vraie base).

---

## 6. Variables d'environnement

### Serveur
| Variable | Rôle |
|---|---|
| `IDENTITY_SUPABASE_URL` | Identique à `NEXT_PUBLIC_SUPABASE_URL` de NEXIS, sans slash final |
| `IDENTITY_JWT_SECRET` | Seulement si Identity signe en HS256 |
| `NEXIS_IDENTITY_URL` | URL publique de NEXIS, accessible depuis le serveur (pas `localhost` en production) |
| `DATA_SUPABASE_URL` | URL du projet Supabase du module |
| `DATA_SUPABASE_SERVICE_ROLE_KEY` | Clé `service_role` du module (secret, serveur uniquement) |
| `CLIENT_ORIGIN` | Origine exacte du client, plusieurs possibles séparées par des virgules |
| `PORT` | Port d'écoute (souvent fourni par l'hébergeur) |

Le serveur s'arrête au démarrage si l'une des quatre premières variables manque.

### Client (figées à la compilation)
| Variable | Rôle |
|---|---|
| `VITE_NEXIS_URL` | URL publique de NEXIS |
| `VITE_API_URL` | URL publique du serveur (vide uniquement en développement) |

---

## 7. Base de données

À exécuter **dans l'ordre** dans le SQL Editor du projet Supabase du module (dossier `supabase/migrations/`) :

| # | Fichier | Contenu |
|---|---|---|
| 1 | `20261008020000_projects_init.sql` | `projects`, `tasks` |
| 2 | `20261008030000_activity_log.sql` | Journal d'activité |
| 3 | `20261008040000_task_comments.sql` | Commentaires |
| 4 | `20261008050000_task_labels_subtasks.sql` | Étiquettes et sous-tâches (colonnes ajoutées à `tasks`) |
| 5 | `20261008060000_task_attachments.sql` | Pièces jointes et bucket privé `task-attachments` |
| 6 | `20261008070000_task_activities.sql` | Activités planifiées |
| 7 | `20261008080000_project_settings.sql` | Colonne `settings` de `projects` |
| 8 | `20261008090000_task_timesheets.sql` | Feuilles de temps |
| 9 | `20261008100000_task_dependencies.sql` | Dépendances |
| 10 | `20261008110000_task_milestones.sql` | Champ `is_milestone` |
| 11 | `20261008120000_task_status_history.sql` | Historique des statuts |

Points d'attention :
- La migration 4 doit passer **avant** de déployer le serveur correspondant, sinon la liste des tâches répond « Erreur base de données ».
- La migration 11 reconstruit l'historique à partir du journal d'activité : **à exécuter une seule fois**, car la rejouer dupliquerait l'historique. Pour les tâches créées directement dans un autre statut que « À faire » puis modifiées plusieurs fois, le début de l'historique peut être approximatif ; les nouvelles modifications sont exactes.
- Sans la migration 11, les flèches de dépendance fonctionnent, les durées par étape restent masquées, et l'enregistrement des changements de statut échoue sans bloquer l'application.
- La RLS est activée sans policy sur toutes les tables : seul le serveur y accède.

---

## 8. Référence de l'API

Préfixe : `/api/organizations/:orgId`. Toutes les routes demandent `Authorization: Bearer <jeton>` (sauf `/health`).

### Général
| Méthode | Route | Description |
|---|---|---|
| GET | `/health` | Contrôle de santé (public) |
| GET | `/api/me` | Utilisateur et permissions |
| GET | `/members` | Membres affectables (relais d'Identity) |
| GET | `/my-tasks` | Tâches assignées à l'utilisateur |
| GET | `/dashboard` | Indicateurs |
| GET | `/activity?limit=&before=` | Journal d'activité |

### Projets
| Méthode | Route |
|---|---|
| GET, POST | `/projects` |
| GET, PATCH, DELETE | `/projects/:id` (inclut `settings`) |
| GET | `/projects/:projectId/dependencies` (toutes les dépendances du projet, lecture seule) |

### Tâches
| Méthode | Route |
|---|---|
| GET, POST | `/projects/:projectId/tasks` |
| PATCH, DELETE | `/projects/:projectId/tasks/:id` (inclut `is_milestone`) |
| GET | `…/tasks/:taskId/status-history` (lecture seule) |
| GET, POST | `…/tasks/:taskId/comments` |
| DELETE | `…/comments/:commentId` |
| GET, POST | `…/tasks/:taskId/attachments` (POST : corps = octets du fichier, `?name=&type=`) |
| GET, DELETE | `…/attachments/:attachmentId` |
| GET, POST | `…/tasks/:taskId/activities` |
| PATCH, DELETE | `…/activities/:activityId` |
| GET, POST | `…/tasks/:taskId/timesheets` (durée en minutes, date, description) |
| PATCH, DELETE | `…/timesheets/:timesheetId` |
| GET, POST | `…/tasks/:taskId/dependencies` (`task_id` dépend de `depends_on_id`) |
| DELETE | `…/dependencies/:dependencyId` |

### Codes d'erreur courants
| Code | Signification |
|---|---|
| 400 | Données invalides (titre, statut, priorité, date, assigné…) |
| 401 | Jeton absent, illisible, expiré ou mal signé |
| 403 | Droit manquant, ou organisation non autorisée |
| 404 | Identifiant inconnu ou d'une autre organisation |
| 413 | Fichier de plus de 10 Mo |

---

## 9. Tests

```bash
npm test
```

45 tests, sans service externe : un faux NEXIS Identity est lancé par le test, et chaque cas est refusé ou invalidé avant l'accès à la base. Ils couvrent l'authentification, les droits par rôle, l'isolation entre organisations et la validation des champs.

Les parcours qui lisent ou écrivent en base (création, filtres, tableau de bord, journal, pièces jointes) ne sont pas automatisés : ils se vérifient avec la section 6 de `DEPLOIEMENT.md`.

---

## 10. Limites connues

- Pas de limitation de débit (rate limiting) sur le serveur.
- Pièces jointes : les fichiers transitent par le serveur Node, donc une limite de taille de requête plus basse chez l'hébergeur ferait échouer l'envoi avant 10 Mo. Pas d'antivirus, pas d'aperçu.
- Si la suppression d'un fichier dans le stockage échoue, la ligne en base est déjà supprimée : le fichier reste orphelin (erreur `[storage] suppression impossible` dans les logs).
- Le journal d'activité n'est jamais purgé.
- Les étiquettes sont du texte libre par tâche : renommer une étiquette demande de la modifier sur chaque tâche.
- Les sous-tâches (un niveau) comptent comme des tâches à part entière dans le tableau de bord et « Mes tâches ».
- Tableau de bord, « Mes tâches » et recherche calculent sur toutes les données de l'organisation à chaque appel : correct pour une équipe, à optimiser pour de gros volumes.
- Les favoris de recherche sont propres au navigateur.
- Le serveur n'a pas été testé contre une vraie base Supabase dans les dernières itérations ; faire le parcours de `DEPLOIEMENT.md` avant d'ouvrir à l'équipe.

---

## 11. Historique des étapes

| Étape | Contenu |
|---|---|
| 1 | Thème Odoo, menu du haut, écran Projets en cartes, recherche, fenêtre de création |
| 2 | Écran Tâches : bouton Nouveau, recherche à facettes, regroupements, favoris, liste et kanban |
| 3 | Formulaire de tâche : chevrons d'étapes, onglets, discussion, activités planifiées |
| 4 | Planning (Gantt) par responsable, navigation mensuelle |
| 5 | Rapports : barres, courbes, secteurs, empilement, tri |
| 6 | Paramètres du projet et visibilité |
| 7 | Feuilles de temps |
| 8 | Calendrier avec filtre par responsable |
| 9 | Dépendances et jalons |
| 10 | Modernisation du design, barre latérale de détails (`TaskSidebar`) |
| v6 | Flèches de dépendance sur le Gantt, durées par étape, historique des statuts |
| v7 | Passe de design : écrans Projets et kanban, thème sombre |
| v8 | Revue de l'en-tête du projet (titre, onglets, filtres, commutateur de vues) |
