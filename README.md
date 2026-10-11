# NEXIS — Gestion de projet (V1)

React (Vite) + Node.js (Express) + un projet Supabase dédié aux données.
**Pas de page de connexion** : l'utilisateur arrive depuis le tableau de bord NEXIS Identity.

## Connexion (SSO depuis NEXIS Identity)
1. Dans NEXIS Identity, `/dashboard/modules` : renseigner l'URL du module `projects`
   (dev : `http://localhost:5173`, prod : `https://…`).
2. L'utilisateur clique sur « Projets » dans la barre latérale de NEXIS. Le tableau de bord
   ouvre le module avec le jeton dans le fragment d'URL (`/#access_token=…`).
3. Le client le range dans `sessionStorage` et nettoie l'URL. Chaque requête envoie
   `Authorization: Bearer …` au serveur Node.
4. Le serveur vérifie le JWT (projet Supabase d'Identity), puis lit les permissions via
   `GET {NEXIS_IDENTITY_URL}/api/me` (cache 30 s). Admin plateforme : tous les droits.
5. Jeton expiré ou absent : le client renvoie vers `NEXIS/dashboard/ouvrir/projects`, qui
   renouvelle la session (ou demande la connexion) puis rouvre le module.

## Deux projets Supabase
- **Identity** : comptes, organisations, rôles (inchangé, ce module ne l'écrit jamais).
- **Données du module** : `projects`, `tasks`, `activity_log`, `task_comments`, `task_attachments`, `task_activities`, `task_timesheets`, `task_dependencies`, `task_status_history` + un bucket de stockage privé `task-attachments`. Exécuter dans son SQL Editor, dans l'ordre :
  `20261008020000_projects_init.sql`, `20261008030000_activity_log.sql`,
  `20261008040000_task_comments.sql`, `20261008050000_task_labels_subtasks.sql`,
  `20261008060000_task_attachments.sql`, `20261008070000_task_activities.sql`,
  `20261008080000_project_settings.sql`, `20261008090000_task_timesheets.sql`,
  `20261008100000_task_dependencies.sql`, `20261008110000_task_milestones.sql`, `20261008120000_task_status_history.sql` (reprend l'historique depuis le journal d'activité ; à exécuter une seule fois), `20261011090000_project_members.sql` (visibilité Interne/Privé et membres par projet : lire ses notes avant de l'exécuter, une seule fois) (dossier `supabase/migrations/`).
  Seul le serveur (service_role) y accède ; RLS activée sans policy, bucket privé.

## Démarrage
1. `npm install`
2. `server/.env.example` → `server/.env`, `client/.env.example` → `client/.env`
3. `npm run dev` → API :4000, client :5173, puis ouvrir le module depuis NEXIS.

## Tests
`npm test` : 77 tests (authentification, droits par rôle, isolation entre organisations, validation,
visibilité des projets et membres). Ils n'ont besoin d'aucun service : un faux NEXIS Identity est lancé
par le test et la base est remplacée par une base en mémoire (`server/test/fakeDb.js`, branchée avec
`--experimental-test-module-mocks`, déjà dans `npm test`). `visibility.test.js` vérifie qu'un non-membre ne voit
un projet privé ni dans la liste, ni par son identifiant, ni par ses tâches, commentaires, pièces jointes, activités,
feuilles de temps, dépendances, historique, ni par la recherche, le tableau de bord, « Mes tâches » et le journal.
La base en mémoire imite le client Supabase : elle ne remplace pas le test sur la vraie base (`DEPLOIEMENT.md`, section 6).

## Visibilité des projets et membres
- Chaque projet est **interne** (tous les utilisateurs de l'organisation ayant `projects.read`) ou **privé** (réglage `projects.visibility`).
  « Public » (comptes portail) n'est pas encore pris en charge : le serveur le refuse.
- Un projet **privé** est vu par : ses **membres** (table `project_members`), les détenteurs de `projects.delete`
  dans l'organisation et les administrateurs plateforme. Pour un autre utilisateur, il n'existe pas (404, jamais 403).
  Le droit « voir tous les projets privés » est la constante `FULL_ACCESS_PERMISSION` de `server/src/access.js`.
- Le créateur d'un projet en devient membre. Celui qui passe un projet en privé en devient membre aussi.
  On ne retire pas le dernier membre d'un projet privé. Une tâche d'un projet privé ne s'assigne qu'à un membre.
- Une seule garde (`projectGuard`, `server/src/access.js`) couvre tout ce qui est sous `/projects/:projectId` ;
  les routes qui portent sur toute l'organisation (liste, recherche, tableau de bord, « Mes tâches », journal) filtrent via `getScope`.
- Journal : `activity_log.restricted` marque les entrées d'un projet privé ; il suit la visibilité du projet et survit à sa suppression.

## Mise en production
Voir `DEPLOIEMENT.md`.

## Routes
- `GET /health` · `GET /api/me`
- `GET /api/organizations/:orgId/my-tasks` (tâches qui vous sont assignées)
- `GET /api/organizations/:orgId/dashboard` · `GET /api/organizations/:orgId/activity?limit=&before=`
- `GET|POST /api/organizations/:orgId/projects` · `GET|PATCH|DELETE …/:id` (inclut `settings` : jsonb avec options du projet)
- `GET|POST …/projects/:projectId/tasks` · `PATCH|DELETE …/tasks/:id` (inclut `is_milestone` : boolean)
- `GET|POST …/tasks/:taskId/comments` · `DELETE …/comments/:commentId`
- `GET|POST …/tasks/:taskId/attachments` · `GET|DELETE …/attachments/:attachmentId` (POST : corps = octets du fichier, `?name=&type=`, 10 Mo max, 10 fichiers par tâche)
- `GET|POST …/tasks/:taskId/activities` · `PATCH|DELETE …/activities/:activityId`
- `GET|POST …/tasks/:taskId/timesheets` · `PATCH|DELETE …/timesheets/:timesheetId` (durée en minutes, date, description)
- `GET|POST …/tasks/:taskId/dependencies` · `DELETE …/dependencies/:dependencyId` (task_id dépend de depends_on_id)
- `GET …/projects/:projectId/dependencies` (toutes les dépendances du projet, pour les flèches du Gantt ; lecture seule)
- `GET …/tasks/:taskId/status-history` (entrées de la tâche dans chaque statut, pour les durées de la barre de statut ; lecture seule)
- `GET /api/organizations/:orgId/members` (membres affectables, relais de NEXIS Identity)
- `GET …/projects/:projectId/members` (membres du projet, `me`, personnes assignées sans accès) · `POST …/members` (`{ userId }`, la personne doit être membre actif de l'organisation : exige `users.read` dans Identity) · `DELETE …/members/:userId`
- `PATCH …/projects/:id` accepte `visibility` (`internal` ou `private`) ; la clé `visibility` de `settings` est ignorée.

## Droits
- Projets : lire `projects.read`, créer `projects.create`, modifier `projects.update`, supprimer `projects.delete`.
- Tâches : lire `projects.read` ; créer, modifier, supprimer `projects.update`.
- Commentaires : lire `projects.read`, commenter `projects.update` ; supprimer le sien (`projects.update`) ou n'importe lequel (`projects.delete`).
- Pièces jointes : lister et télécharger `projects.read`, envoyer `projects.update` ; supprimer le sien (`projects.update`) ou n'importe lequel (`projects.delete`).
- Activités : lire `projects.read`, créer/modifier/supprimer `projects.update`.
- Membres d'un projet : lire `projects.read` ; ajouter / retirer `projects.update` (ajouter exige aussi `users.read`). Voir un projet privé : être membre, ou avoir `projects.delete`, ou être administrateur plateforme.
- Feuilles de temps : lire `projects.read`, créer/modifier/supprimer `projects.update`.
- « Mes tâches », tableau de bord, activité : lire `projects.read`.
- Affecter une tâche : en plus, pouvoir lister les membres dans NEXIS Identity (`users.read`).
  L'assigné doit être membre actif de l'organisation (vérifié côté serveur).

## Maquette Odoo — étapes d'implémentation
- **Étape 1** : thème Odoo (violet #714B67 / turquoise #017E84, clair + sombre selon le système), menu du haut, écran Projets en cartes avec recherche et fenêtre « Créer un projet ». Aucun changement serveur ni base.
- **Étape 2** : écran Tâches — bouton Nouveau (fenêtre), barre de recherche à facettes (filtres, regrouper par, favoris enregistrés dans le navigateur, par projet), vue liste en tableau avec groupes, kanban filtré par la même recherche. Aucun changement serveur ni base.
- **Étape 3** : formulaire de tâche — chevrons d'étapes (Nouveau, En cours, En revue, Terminé), onglets (Description, Sous-tâches, Pièces jointes, Activités), section discussion, bouton « Planifier une activité » avec types (À faire, Appel, E-mail, Réunion, Note). Migration SQL `20261008070000_task_activities.sql` et routes serveur `/api/organizations/:orgId/projects/:projectId/tasks/:taskId/activities`.
- **Étape 4** : Planning (Gantt) — vue chronologique des tâches avec barres de temps groupées par responsable, navigation par mois (précédent/suivant/aujourd'hui), couleurs par priorité et statut. Aucun changement serveur ni base.
- **Étape 5** : Rapports (graphiques) — visualisation des tâches par étape et responsable avec 3 types de graphiques (barres, courbes, secteurs), options d'empilement et de tri (croissant/décroissant). Aucun changement serveur ni base.
- **Étape 6** : Paramètres du projet — écran de configuration avec options activables/désactivables (dépendances, jalons, tâches récurrentes, feuilles de temps, documents), visibilité (privé/interne/public), onglets Description/Paramètres. Migration SQL `20261008080000_project_settings.sql` et champ `settings` jsonb dans la table `projects`.
- **Étape 7** : Feuilles de temps — onglet dans le formulaire de tâche avec tableau (date, employé, description, durée en minutes), édition inline, ajout/suppression de lignes, calcul automatique du total et du reste (8 heures allouées par défaut). Migration SQL `20261008090000_task_timesheets.sql` et routes serveur `/api/organizations/:orgId/projects/:projectId/tasks/:taskId/timesheets`.
- **Étape 8** : Calendrier — vue mensuelle des tâches avec grille 7 colonnes (jours de la semaine), navigation par mois (Aujourd'hui, précédent, suivant), filtre par responsable (panneau latéral avec checkboxes), affichage des tâches par échéance avec couleurs par responsable, clic pour ouvrir le détail. Aucun changement serveur ni base.
- **Étape 9** : Dépendances et Jalons — onglet Dépendances dans le formulaire de tâche pour définir les tâches bloquantes (une tâche ne peut commencer que si ses dépendances sont terminées), bouton Jalons dans l'écran Tâches pour lister et gérer les jalons du projet (tâches marquées comme importantes avec indicateur ★), possibilité de marquer/retir le statut jalon sur une tâche. Migrations SQL `20261008100000_task_dependencies.sql` (table task_dependencies) et `20261008110000_task_milestones.sql` (champ is_milestone dans tasks), routes serveur correspondantes.
- **Étape 10** : Modernisation du design — cartes avec shadows subtils et bordures arrondies (8px), animations et transitions CSS fluides (fadeIn, slideUp, slideIn), sidebar de détails à droite pour afficher rapidement les informations d'une tâche sans ouvrir le formulaire complet, bouton ℹ dans toutes les vues (liste, kanban, gantt, calendrier) pour ouvrir la sidebar. Composant `TaskSidebar.jsx` ajouté, CSS étendu avec animations et styles de sidebar.
