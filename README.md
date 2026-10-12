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


## E-mails (Resend)

Tout envoi d'e-mail passe par `sendMail()` dans `server/src/mail.js` (invitations du mode public à venir, notifications). Aucun autre fichier ne parle à Resend : changer de fournisseur = réécrire cette fonction.

1. Créer un compte Resend et **vérifier votre domaine** (enregistrements DNS SPF/DKIM) ; sans cela les e-mails partent en spam ou sont refusés.
2. Dans `server/.env` : `RESEND_API_KEY` et `MAIL_FROM` (expéditeur sur le domaine vérifié).
3. Sans ces variables, les messages sont seulement écrits dans la console (développement, tests).

Plan gratuit : 100 e-mails/jour, 3 000/mois, un domaine. Quota atteint ou service en panne → l'API répond 503 ; ce n'est jamais un succès silencieux.

## Notifications dans l'application (la cloche)

Migration à exécuter une seule fois : `supabase/migrations/20261012090000_notifications.sql`.

- `notify()` (`server/src/notifications.js`) est le point d'entrée unique. Il n'échoue jamais pour l'appelant, ne notifie pas l'auteur de l'action, et ne notifie dans un projet privé que ses membres.
- Événements branchés : tâche assignée ou réassignée, ajouté à un projet, retiré d'un projet privé, **commentaire** sur une tâche (prévient l'assigné et le créateur, une seule alerte tant qu'elle n'est pas lue) et **mention @** dans un commentaire. Migration à exécuter en dernier : `supabase/migrations/20261012110000_notifications_comments_mentions.sql`.
- Routes : `GET /api/organizations/:orgId/notifications` (30 dernières + compteur), `POST …/:id/read`, `POST …/read-all`. Chacun ne voit que les siennes ; celles d'un projet privé devenu inaccessible sont masquées.
- Client : cloche dans la barre du haut (`NotificationBell.jsx`), rafraîchie toutes les minutes quand l'onglet est visible.
- **Canal e-mail :** chaque notification crée aussi un e-mail (Resend) si la personne ne l'a pas désactivé (case dans le panneau de la cloche). Migration à exécuter après la précédente : `supabase/migrations/20261012100000_notification_prefs.sql`. L'adresse du destinataire vient de NEXIS Identity avec le droit `users.read` de la personne qui agit ; sans ce droit, seule la cloche est alimentée. L'envoi se fait en arrière-plan : une panne ou un quota Resend (100/jour en gratuit) n'empêche jamais l'action. `APP_URL` donne le lien de l'e-mail.
- Canal push (Firebase) : voir « Notifications push » ci-dessous.

**Mentions (@).** Dans la zone de commentaire, taper `@` ouvre la liste des membres (ceux du projet s'il est privé) ; le serveur reçoit `mentions: [userId…]` en plus du texte. Il ignore en silence les personnes hors organisation (ou hors projet privé) et ne notifie jamais l'auteur. Sans le droit `users.read` (annuaire NEXIS Identity), les mentions ne peuvent pas être vérifiées : elles sont ignorées, mais les alertes de commentaire partent.

## Mode « public » : invités externes par e-mail (lecture seule)

Migration à exécuter en dernier : `supabase/migrations/20261012120000_project_guests.sql` (ajoute le niveau « public » et la table `project_guests`). Variables : `APP_URL` (obligatoire pour inviter), `RESEND_API_KEY` / `MAIL_FROM`, `TRUST_PROXY` derrière un proxy.

- **Activer :** Paramètres du projet → Visibilité → Public (confirmation). Un onglet « Partage » apparaît : adresse e-mail + durée de validité (7 j, 30 j, 90 j, 1 an, illimitée). Pour l'organisation, « public » se comporte comme « interne ».
- **Lien :** `APP_URL/#/p/<jeton>`. Le jeton est dans le **fragment** : il n'est jamais envoyé au serveur d'hébergement du client ni dans ses journaux. Il est **personnel** (un par adresse) et réutilisable jusqu'à expiration ou révocation. Seule son empreinte SHA-256 est stockée en base.
- **Ce que voit l'invité (`GET /api/portal`, en-tête `X-Portal-Token`) :** nom, description et statut du projet, avancement, tâches (titre, statut, priorité, échéances, jalon, sous-tâches). Liste blanche stricte (`server/src/routes/portal.js`) : jamais les assignés, auteurs, descriptions de tâches, étiquettes, commentaires, pièces jointes, temps passé, ni les autres projets. Un invité n'a **aucun accès** à l'API de l'organisation.
- **Fin d'accès :** révocation (individuelle), expiration, « Renvoyer » (nouveau jeton, l'ancien meurt), ou sortie du niveau « public » (révoque tous les invités ; repasser en public ne les rouvre pas). Jeton invalide, expiré, révoqué ou projet non public : toujours la même réponse 404.
- **Limitation de débit :** 120 requêtes/min et 10 jetons invalides/10 min par IP (en mémoire : par instance).
- **E-mail impossible** (quota Resend, panne, non configuré) : l'invité est créé et le lien est affiché une seule fois à l'invitant, pour qu'il le transmette lui-même.
- **Pas encore :** commentaires des invités, lien anonyme (sans e-mail), Gantt/calendrier dans le portail, mot de passe sur le lien.

## Rappels d'échéance (cloche)

Migration à exécuter en dernier : `supabase/migrations/20261012130000_notifications_due_dates.sql`.

Une passe toutes les heures (`server/src/reminders.js`, lancée au démarrage de `index.js` ; `REMINDERS=off` la désactive) :
- **échéance aujourd'hui ou demain** → « Échéance demain : … », une seule fois par tâche et par personne ;
- **en retard** (jusqu'à 30 jours) → « En retard (échéance le …) : … », relancé au plus une fois tous les 7 jours.

Seul l'**assigné** est prévenu ; ni les tâches terminées, ni les jalons, ni les tâches sans assigné. Les règles de `notify()` s'appliquent (projet privé : membres seulement). **E-mail** : chaque rappel part aussi par e-mail (Resend), sauf si la personne l'a désactivé dans la cloche. Une passe automatique n'a pas d'appelant : l'adresse est demandée à NEXIS Identity en **serveur à serveur** (`POST /api/internal/users/emails`, clé de module). Mise en place : générer une clé (`node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`), la déclarer chez Identity dans `MODULE_API_KEYS=projets:<clé>`, puis la mettre ici dans `IDENTITY_MODULE_KEY` (même valeur) et redéployer les deux. Sans `IDENTITY_MODULE_KEY`, seule la cloche est alimentée. La même clé permet aussi d'envoyer les e-mails de notification (assignation, commentaire…) quand l'auteur de l'action n'a pas le droit `users.read`. Seuls les membres actifs de l'organisation sont retrouvés. Dates en UTC. Ne lancer qu'**une seule instance** du serveur avec les rappels actifs (sinon doublons possibles).

## Résumé quotidien (e-mail)

Migration à exécuter en dernier : `supabase/migrations/20261012140000_daily_digest.sql` (colonne `digest_enabled` + table `digest_log`).

Une fois par jour (`server/src/digest.js`, lancé au démarrage de `index.js` ; `DAILY_DIGEST=off` le désactive), chaque personne qui a des tâches **assignées** à suivre reçoit un e-mail : **en retard** (jusqu'à 30 jours), **pour aujourd'hui** et **à venir** (3 prochains jours). Rien à signaler : pas d'e-mail. Ni tâches terminées, ni jalons ; projet privé : membres seulement (mêmes règles que `notify()`).

- **Heure et fuseau :** `DIGEST_HOUR` (0-23, 8 par défaut) et `DIGEST_TZ` (fuseau IANA, ex. `Africa/Tunis` ; UTC par défaut). « Aujourd'hui » suit ce fuseau. Serveur arrêté à l'heure prévue : l'envoi a encore lieu dans les 4 heures qui suivent, sinon la journée est sautée.
- **Une seule fois par jour :** la ligne `digest_log` (personne, organisation, jour) est réservée avant l'envoi, puis libérée si l'envoi échoue (réessai à la passe horaire suivante). Une personne dans deux organisations reçoit un résumé par organisation.
- **Désactivation :** case « Recevoir un résumé quotidien de mes tâches » dans la cloche. Désactiver les e-mails de notification coupe aussi le résumé.
- **Prérequis :** `IDENTITY_MODULE_KEY` (adresse retrouvée chez Identity en serveur à serveur) et Resend. Sans la clé, rien n'est envoyé.
- **Quota Resend (plan gratuit : 100 e-mails/jour) :** le résumé s'ajoute aux e-mails de rappel et de notification. Au premier refus 503 de Resend, la passe s'arrête.
- Une seule instance du serveur par déploiement ; la réservation en base évite quand même les doublons.

## Notifications push (Firebase Cloud Messaging)

Chaque notification de la cloche déclenche aussi un push sur les appareils que la personne a activés (case « Recevoir les notifications push sur cet appareil » dans la cloche). Mêmes règles de visibilité que la cloche ; les e-mails désactivés n'empêchent pas le push.

- **Serveur** : `FIREBASE_SERVICE_ACCOUNT` (JSON de la clé du compte de service, sur une ligne) ou `FIREBASE_SERVICE_ACCOUNT_FILE` (chemin). Sans l'un des deux, le push est désactivé. Migration : `20261012150000_push_tokens.sql`, à exécuter une seule fois.
- **Client** : `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_VAPID_KEY` (voir `client/.env.example`). Sans elles, la case n'apparaît pas.
- Le service worker est `client/public/firebase-messaging-sw.js` : il doit être servi à la racine du site (`/firebase-messaging-sw.js`), en HTTPS (ou `localhost`).
- Les jetons que FCM ne reconnaît plus sont supprimés automatiquement.

### iPhone (PWA)

Le push web n'existe sur iOS (16.4 minimum) que pour une application ajoutée à l'écran d'accueil. Le client fournit pour cela `client/public/manifest.webmanifest`, les icônes (`icon-*.png`, `apple-touch-icon.png`) et le service worker `firebase-messaging-sw.js`. Dans Safari : Partager, « Sur l'écran d'accueil », ouvrir NEXIS depuis l'icône, puis cocher la case push dans la cloche (la permission doit être demandée depuis ce mode). Le site doit être en HTTPS, et le service worker servi à la racine (`/firebase-messaging-sw.js`) sans redirection.
