# Mise en production — module Gestion de projet

Ce guide a été écrit d'après le code du module et celui de NEXIS Identity. Rien n'a été
exécuté contre une vraie base ni un vrai hébergeur : les sections 6 (notifications) et 7 (tests) servent justement à le faire
une fois, avant d'ouvrir le module à l'équipe.

Pièces à mettre en ligne : **(a)** le client (fichiers statiques), **(b)** le serveur Node,
**(c)** le projet Supabase des données du module. NEXIS Identity et son projet Supabase existent déjà.
Le module envoie aussi des e-mails (Resend) et des notifications push (Firebase) : voir la section 6.

## 1. Base de données du module (projet Supabase dédié)
- [ ] Créer un projet Supabase **distinct** d'Identity (ne jamais y mettre ces tables).
- [ ] SQL Editor, dans l'ordre : `20261008020000_projects_init.sql`, `20261008030000_activity_log.sql`, `20261008040000_task_comments.sql`, `20261008050000_task_labels_subtasks.sql` (celle-ci ajoute des colonnes à `tasks` : à passer AVANT de déployer le nouveau serveur, sinon la liste des tâches répond « Erreur base de données »), puis `20261008060000_task_attachments.sql` (table des pièces jointes + bucket de stockage privé `task-attachments`, 10 Mo par fichier).
- [ ] Passer ensuite **toutes les autres migrations** de `supabase/migrations/`, dans l'ordre des noms de fichier (vérifier qu'aucune ne manque ; chacune ne se joue qu'une fois) : `…070000_task_activities`, `…080000_project_settings`, `…090000_task_timesheets`, `…100000_task_dependencies`, `…110000_task_milestones`, `…120000_task_status_history`, `20261010090000_project_color`, `20261010100000_task_start_date`, `20261011090000_project_members` (lire ses notes), puis celles des notifications : `20261012090000_notifications`, `20261012100000_notification_prefs`, `20261012110000_notifications_comments_mentions`, `20261012120000_project_guests`, `20261012130000_notifications_due_dates`, `20261012140000_daily_digest`, `20261012150000_push_tokens`. Sans les quatre dernières, le serveur répond « Erreur base de données » sur les rappels, le résumé, les invités et le push.
- [ ] Vérifier que la RLS est active sur les 5 tables (`projects`, `tasks`, `activity_log`, `task_comments`, `task_attachments`) :
      ```sql
      select relname, relrowsecurity from pg_class
      where relname in ('projects','tasks','activity_log','task_comments','task_attachments');
      ```
      Les cinq lignes doivent afficher `true`.
- [ ] Vérifier le bucket des pièces jointes : Storage → `task-attachments` existe et n'est **pas** public (ou : `select id, public, file_size_limit from storage.buckets where id = 'task-attachments';` → `false`, `10485760`).
- [ ] Relever l'URL du projet et la clé **service_role** (Settings → API). Cette clé ne va **que** dans le serveur.
- [ ] Activer les sauvegardes du projet (selon le plan Supabase) et noter qui peut restaurer.


### Étapes (statuts) personnalisables — migration `20261013090000_project_stages.sql`
- [ ] Exécuter cette migration **avant** de déployer le nouveau serveur (il lit `tasks.stage_id`). Elle convertit les données existantes : chaque projet reçoit les 4 étapes historiques (À faire, En cours, En revue, Terminée), chaque tâche rejoint l'étape de son ancien statut, et « review » devient la catégorie « en cours ». À exécuter **une seule fois**.
- [ ] Après la migration : ouvrir un projet → ⚙ → onglet **Étapes** (créer, renommer, réordonner, supprimer ; la catégorie À faire / En cours / Terminé sert aux retards et aux rapports).
- [ ] Modèle de l'organisation : onglet Étapes → « Utiliser les étapes de ce projet comme modèle » (droit `projects.create`). Il ne s'applique qu'aux nouveaux projets.

### Couleur par étape — migration `20261014090000_stage_colors.sql`
- [ ] Exécuter cette migration **après** `20261013090000_project_stages.sql` et **avant** de lancer le nouveau serveur (il lit la colonne `color`). Elle ajoute une colonne `color` (0 à 7, vide = couleur de la catégorie) aux étapes et au modèle de l'organisation. Les étapes existantes ne changent pas d'aspect.
- [ ] Choisir une couleur : ⚙ du projet → onglet Étapes → pastille de couleur à gauche de chaque étape.

## 2. Serveur Node
Démarrage : `npm start -w server` (ou `node server/src/index.js`). Les variables viennent de
l'hébergeur ; le fichier `.env` n'est utilisé qu'en développement (`npm run dev`).
Testé avec Node 22 ; Express 5 et jose 6 demandent une version récente, évitez < 20.

| Variable | Valeur en production |
|---|---|
| `IDENTITY_SUPABASE_URL` | **Identique** à `NEXT_PUBLIC_SUPABASE_URL` de NEXIS, sans slash final |
| `IDENTITY_JWT_SECRET` | Seulement si le projet Identity signe en HS256 (le serveur l'indique dans sa réponse 401 et son terminal) |
| `NEXIS_IDENTITY_URL` | URL publique de NEXIS en production, **accessible depuis le serveur** (pas `localhost`), sans slash final |
| `DATA_SUPABASE_URL` | URL du projet Supabase du module |
| `DATA_SUPABASE_SERVICE_ROLE_KEY` | Clé service_role du module (secret) |
| `CLIENT_ORIGIN` | Origine exacte du client : `https://projets.exemple.com` (schéma + domaine, sans slash final ni chemin). Plusieurs : séparées par des virgules |
| `PORT` | Fourni par l'hébergeur le plus souvent |
| `APP_URL` | URL publique du client, sans slash final : lien des e-mails de notification **et** des invitations d'invités externes (obligatoire pour inviter) |
| `RESEND_API_KEY`, `MAIL_FROM` | E-mails (section 6). Sans eux, les e-mails sont seulement écrits dans la console |
| `IDENTITY_MODULE_KEY` | Clé serveur-à-serveur, **identique** à l'entrée `projets:` de `MODULE_API_KEYS` chez Identity (section 6). Sans elle : ni rappels par e-mail, ni résumé quotidien |
| `DIGEST_HOUR`, `DIGEST_TZ` | Heure (0-23, 8 par défaut) et fuseau IANA du résumé quotidien, ex. `Africa/Tunis`. Sans `DIGEST_TZ` : UTC |
| `FIREBASE_SERVICE_ACCOUNT` ou `FIREBASE_SERVICE_ACCOUNT_FILE` | Clé de compte de service Firebase (secret) : active le push. Sans elle, le push est désactivé |
| `TRUST_PROXY` | `1` derrière un proxy (Render, Nginx, Cloudflare…), sinon la limitation de débit du portail des invités voit l'IP du proxy |
| `REMINDERS=off`, `DAILY_DIGEST=off` | Facultatif : coupent les rappels d'échéance / le résumé (utile sur les instances secondaires) |

- [ ] Le serveur s'arrête au démarrage s'il manque l'une des 4 premières variables : lire son terminal.
- [ ] `GET https://<api>/health` répond `{"ok":true}`.
- [ ] **Une seule instance** du serveur : rappels et résumé tournent dans le processus ; deux instances = e-mails en double (mettre `REMINDERS=off` et `DAILY_DIGEST=off` sur toute instance supplémentaire).
- [ ] Le serveur est en **HTTPS** (le client est en HTTPS : un appel HTTP serait bloqué par le navigateur).
- [ ] Surveiller les logs : `[auth] JWT refusé : …` (cause d'un 401) et `[activity] écriture impossible : …` (journal en panne sans bloquer l'utilisateur). Les e-mails refusés (quota Resend, panne) et les push en échec sont aussi journalisés sans bloquer l'action.

## 3. Client
Les variables `VITE_*` sont **figées à la compilation** : les définir AVANT `npm run build`, puis
redéployer à chaque changement.

| Variable | Valeur |
|---|---|
| `VITE_NEXIS_URL` | URL publique de NEXIS, sans slash final |
| `VITE_API_URL` | URL publique du serveur Node, sans slash final (vide uniquement en développement) |
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID` | Config web Firebase (console Firebase > Paramètres du projet > Vos applications). Non secrètes |
| `VITE_FIREBASE_VAPID_KEY` | Clé publique : Paramètres du projet > Cloud Messaging > Certificats Web Push > « Générer une paire de clés » |

Sans les variables `VITE_FIREBASE_*`, la case push n'apparaît pas dans la cloche (le reste fonctionne).

- [ ] `npm run build` → publier le dossier `client/dist` sur un hébergeur statique, en **HTTPS**.
- [ ] Pas de règle de réécriture à prévoir : l'application n'a pas de routes (une seule page). **Une seule exigence côté hébergeur** : `/firebase-messaging-sw.js` doit être servi à la racine du domaine, sans redirection (vérifier `https://<client>/firebase-messaging-sw.js` dans le navigateur : le code du service worker s'affiche, pas la page d'accueil). Il en va de même pour `manifest.webmanifest` et les icônes, présents dans `client/dist` après le build.
- [ ] Lancer `npm install` dans `client/` avant le build (dépendance Firebase).
- [ ] Le domaine du client correspond exactement à `CLIENT_ORIGIN` côté serveur.

## 3 bis. Hébergement sur Vercel (client + API dans un seul projet, plan Hobby)
Alternative aux sections 2 et 3 : le client est servi en statique et l'API Express tourne en fonction serverless
([api/index.mjs](api/index.mjs)), sur **le même domaine** (toutes les routes de l'API sont sous `/api`). Plus de CORS ni de
`VITE_API_URL`. Réglages dans [vercel.json](vercel.json).

Ce qui change par rapport à un serveur Node classique :
- **Rappels et résumé** : les minuteries du processus ne tournent pas en serverless, et un cron Vercel Hobby ne tourne
  qu'une fois par jour. C'est **Supabase pg_cron** qui appelle l'API toutes les heures (`/api/cron/reminders` à hh:05,
  `/api/cron/digest` à hh:10), avec le secret `CRON_SECRET`. La contrainte « une seule instance » disparaît.
- **Pièces jointes** : Vercel refuse les corps et réponses de plus de 4,5 Mo. Le navigateur envoie donc le fichier
  **directement** au stockage Supabase avec une URL signée délivrée par l'API (qui vérifie droits, taille et quota, puis
  confirme que le fichier est arrivé) ; le téléchargement passe par un lien signé de 60 s, toujours en pièce jointe.
- **Limitation de débit du portail des invités** : compteurs partagés dans **Upstash Redis** (chaque instance serverless
  aurait sinon son propre compteur). Sans Upstash, la limite existe mais devient approximative.

Étapes :
- [ ] Vercel → *Add New Project* → importer le dépôt, **Root Directory = `nexis-projets`**. Le reste vient de `vercel.json`
      (installation, `npm run build`, sortie `client/dist`, fonction `api/index.mjs` de 60 s au plus).
- [ ] Variables d'environnement (*Settings → Environment Variables*, environnement Production) :
  - celles de la **section 2**, sauf `PORT`, `CLIENT_ORIGIN` (inutile : même domaine) et `TRUST_PROXY` (réglé
    automatiquement sur Vercel) ;
  - `APP_URL` = l'URL Vercel ou le domaine du projet, sans slash final ;
  - `FIREBASE_SERVICE_ACCOUNT` = le JSON du compte de service **sur une ligne** (pas de fichier sur Vercel) ;
  - `CRON_SECRET` = une valeur aléatoire d'au moins 32 caractères (ex. `openssl rand -hex 32`) ;
  - `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` : base Redis gratuite sur upstash.com (la même que NEXIS
    Identity convient : les clés de ce module sont préfixées `nexis-projets:`) ;
  - côté client : les `VITE_FIREBASE_*` de la section 3 ; **ne pas** définir `VITE_API_URL`.
- [ ] Déployer, puis vérifier `https://<projet>.vercel.app/api/health` → `{"ok":true}`. Si une variable manque, la
      fonction répond 500 et ses journaux (*Deployments → Functions*) en donnent la liste.
- [ ] Supabase du module → *SQL Editor* : créer les deux secrets Vault (URL publique et `CRON_SECRET`), puis exécuter
      `supabase/migrations/20261020090000_cron_jobs.sql` (les commandes sont en tête du fichier). Vérifier une heure plus
      tard : `select created, status_code from net._http_response order by created desc limit 5;` → `200`.
- [ ] Pièces jointes : envoyer un fichier de plus de 5 Mo depuis une tâche, puis le télécharger.
- [ ] Domaine personnalisé (facultatif) : *Settings → Domains*, puis mettre à jour `APP_URL`, le secret Vault
      `projets_app_url` et l'URL du module dans NEXIS (section 4).
- [ ] Ne pas lancer en parallèle un serveur Node classique avec les minuteries actives : mettre `REMINDERS=off` et
      `DAILY_DIGEST=off` sur tout autre serveur, sinon rappels et résumés partiraient deux fois.

## 4. Côté NEXIS Identity
- [ ] `/dashboard/modules` (admin plateforme) : renseigner l'URL du module `projects` avec le domaine du client.
- [ ] **Activer le module pour chaque organisation** : sans ligne dans `organization_modules`, il est désactivé (opt-in), et `/dashboard/ouvrir/projects` affiche « Cette application n’est pas disponible ».
- [ ] Le module n'apparaît que pour les rôles qui ont `projects.read`.
- [ ] Côté Identity, variables d'envoi : `RESEND_API_KEY`, `MAIL_FROM` (domaine vérifié chez Resend) et `MAIL_TO` (destinataire des formulaires contact/devis). Les anciennes variables `SMTP_*` ne servent plus. Ces e-mails couvrent contact, devis et **invitations de membres** (le lien est créé avec `generateLink` puis envoyé par Resend ; si l'envoi échoue, le compte créé est supprimé).
- [ ] Clé serveur-à-serveur : `MODULE_API_KEYS=projets:<clé>` (section 6). Sans elle, la route interne répond 401 et Projets ne peut envoyer ni rappels ni résumé par e-mail.
- [ ] Vérifier dans Supabase Auth (projet Identity) que l'URL de NEXIS en production est dans les URL autorisées, comme pour le reste de NEXIS : le module n'ajoute aucune redirection Supabase, il passe par `/dashboard/ouvrir/projects`.

## 5. Droits par rôle (d'après la migration d'Identity)
| Rôle | Voir | Créer un projet | Modifier projets et tâches | Supprimer un projet |
|---|---|---|---|---|
| organization_admin | oui | oui | oui | oui |
| manager | oui | oui | oui | **non** |
| user | oui | **non** | oui (tâches et projets) | **non** |
| viewer | oui | **non** | **non** | **non** |

Notes : dans le module, modifier un projet ET créer/modifier/supprimer une tâche exigent `projects.update`.
Affecter une tâche demande en plus de pouvoir lister les membres dans Identity (`users.read`) : sans ce droit, la liste d'affectation est vide et les noms s'affichent « un membre » dans l'activité.
L'interface ne masque pas les boutons selon les droits : un refus s'affiche comme message d'erreur (403 « Accès refusé »).

## 6. Notifications, e-mails et push

Trois canaux partent de la même notification : la **cloche** (toujours active), l'**e-mail** (Resend) et le **push** (Firebase). Chacun se met en place séparément ; un canal non configuré n'empêche pas les autres.

**6.1 E-mails (Resend)**
- [ ] Créer un compte Resend et **vérifier le domaine d'envoi** (DNS SPF/DKIM). Sans cela, e-mails en spam ou refusés.
- [ ] Projets (`server`) : `RESEND_API_KEY`, `MAIL_FROM`, `APP_URL`. Identity : `RESEND_API_KEY`, `MAIL_FROM`, `MAIL_TO`. La même clé Resend peut servir aux deux, mais **le quota est commun** (voir limites).
- [ ] Facultatif, e-mail « mot de passe oublié » (resté chez Supabase) : dans le projet Supabase d'Identity, Authentication > SMTP Settings : hôte `smtp.resend.com`, port `465`, utilisateur `resend`, mot de passe = clé API Resend, expéditeur = `MAIL_FROM`.

**6.2 Clé serveur-à-serveur (rappels, résumé, e-mails d'assignation)**
- [ ] Générer : `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` (24 caractères minimum).
- [ ] Chez Identity : `MODULE_API_KEYS=projets:<clé>` ; chez Projets : `IDENTITY_MODULE_KEY=<même clé>`. **Redéployer les deux.** Sans elle, seule la cloche est alimentée (et les e-mails d'assignation ne partent que si l'auteur a le droit `users.read`).

**6.3 Rappels d'échéance et résumé quotidien**
- [ ] Rappels : passe toutes les heures. Échéance aujourd'hui/demain : une fois par tâche et par personne ; retard (jusqu'à 30 jours) : au plus une fois tous les 7 jours. Assigné seulement ; ni tâches terminées, ni jalons, ni tâches sans assigné. Dates en UTC.
- [ ] Résumé : un e-mail par jour et par organisation (retards, aujourd'hui, 3 prochains jours), rien s'il n'y a rien à signaler. Définir `DIGEST_HOUR` et `DIGEST_TZ` (sans `DIGEST_TZ`, tout est en UTC). Serveur arrêté à l'heure prévue : envoi rattrapé dans les 4 heures, sinon la journée est sautée. La table `digest_log` évite les doublons.
- [ ] Une seule instance du serveur (section 2).

**6.4 Push (Firebase Cloud Messaging)**
- [ ] Console Firebase : créer/choisir le projet, générer la clé de compte de service (Paramètres du projet > Comptes de service > « Générer une nouvelle clé privée »). La renseigner dans `FIREBASE_SERVICE_ACCOUNT` (JSON sur une ligne) ou `FIREBASE_SERVICE_ACCOUNT_FILE`. **Secret : jamais dans le dépôt ni dans `client/`.**
- [ ] Client : les cinq variables `VITE_FIREBASE_*` (section 3), **avant** `npm run build`.
- [ ] HTTPS obligatoire sur le client et le serveur ; `/firebase-messaging-sw.js` à la racine, sans redirection.
- [ ] Les jetons invalides sont supprimés automatiquement ; le push ignore la préférence « e-mails désactivés ».

**6.5 iPhone (PWA)**
- [ ] iOS **16.4 minimum** (en dessous : aucune notification). Le push web n'existe sur iPhone que pour l'application installée : Safari > Partager > « Sur l'écran d'accueil », ouvrir NEXIS depuis l'icône, puis cocher la case push dans la cloche et accepter la permission **depuis l'application installée**, pas depuis Safari. Dans un onglet Safari, la cloche affiche cette marche à suivre à la place de la case.
- [ ] Regarder les icônes générées (`client/public/icon-*.png`, `apple-touch-icon.png`) : tirées de `logo.png`, qui est large et peut paraître petit dans le carré.

## 7. Test sur la vraie base (à faire une fois, avant l'équipe)
Préparer 2 organisations A et B, et 4 comptes : admin de A, manager de A, viewer de A, et un membre de B seulement.

Parcours principal (admin de A) :
- [ ] Ouvrir le module depuis NEXIS : arrivée sur la liste, sans boucle de redirection.
- [ ] Créer un projet (avec priorité et échéance), modifier statut / description / échéance, recharger la page : tout est conservé.
- [ ] Créer des tâches, en assigner une à vous-même avec une échéance passée.
- [ ] « Mes tâches » : la tâche apparaît, l'alerte de retard est affichée, les filtres statut / priorité / échéance / recherche fonctionnent, le changement de statut s'enregistre.
- [ ] Tableau de bord : les chiffres correspondent à ce que vous venez de créer ; la charge par membre affiche des noms.
- [ ] Ouvrir une tâche (clic sur son titre), écrire un commentaire : il apparaît, le compteur 💬 de la carte s'incrémente, et l'activité note « commentaire ajouté ».
- [ ] Étiquettes : en ajouter à une tâche (panneau ou formulaire de création), filtrer par étiquette sur le projet et dans « Mes tâches » ; en retirer une.
- [ ] Pièces jointes : envoyer un petit fichier (PDF, image) dans le panneau d'une tâche, le télécharger depuis la liste (le contenu doit être identique), vérifier le compteur 📎 de la carte et la ligne « pièce jointe ajoutée » dans l'activité ; puis la supprimer. Essayer un fichier de plus de 10 Mo : message d'erreur, rien d'enregistré.
- [ ] Pièces jointes et suppression : joindre un fichier à une tâche, supprimer la tâche, puis vérifier dans Storage → `task-attachments` que le fichier a disparu (idem en supprimant un projet).
- [ ] Sous-tâches : en ajouter dans le panneau, les cocher (le compteur ☑ de la carte suit) ; supprimer la tâche parente supprime ses sous-tâches.
- [ ] Activité : chaque action ci-dessus a une ligne (création, modification avec détail, suppression) ; supprimer le projet laisse ses lignes.

Droits et isolation :
- [ ] viewer de A : voit tout, mais créer un projet / une tâche donne « Accès refusé ».
- [ ] manager de A : crée et modifie, **ne peut pas** supprimer un projet.
- [ ] Commentaires : un membre « user » supprime son commentaire mais pas celui d'un autre ; l'admin de A peut supprimer n'importe lequel.
- [ ] membre de B : ne voit aucune donnée de A ; appeler directement une URL de A avec son jeton répond 403.
- [ ] Un projet de A ne s'ouvre pas via l'identifiant d'une autre organisation (404).

Visibilité des projets (migration `20261011090000_project_members.sql` exécutée, lire ses notes avant) :
- [ ] Le résultat de la requête de contrôle en fin de migration liste bien les projets qui doivent être privés (ceux dont le réglage « privé » avait été posé auparavant) ; ajouter leurs membres depuis Paramètres → Membres.
- [ ] Créer un projet : son créateur apparaît dans Paramètres → Membres. Le passer en **privé** : le cadenas apparaît.
- [ ] Avec le compte « user » de A (non membre) : le projet privé n'apparaît ni dans la liste, ni dans la recherche, ni dans le tableau de bord, ni dans « Mes tâches », ni dans l'activité ; ouvrir son URL directement donne « Projet introuvable ».
- [ ] Ajouter ce compte aux membres : il voit le projet et ses tâches. Le retirer : il le perd de vue.
- [ ] Le manager de A (qui n'a pas `projects.delete`) ne voit pas non plus un projet privé dont il n'est pas membre ; l'admin de A le voit sans en être membre.
- [ ] Assigner une tâche d'un projet privé à un non-membre est refusé ; la liste « Responsable » ne propose que les membres.
- [ ] Repasser le projet en interne : tout le monde le revoit, y compris son historique dans l'activité.

Notifications, e-mails et push (section 6 faite) :
- [ ] Inviter une adresse que vous contrôlez (Identity) : l'e-mail arrive (pas en spam) et le lien mène à `/activation`. Certains filtres anti-spam ouvrent le lien avant le destinataire et le consomment : il faut alors réinviter.
- [ ] Depuis un autre compte, vous assigner une tâche : la cloche s'incrémente, l'e-mail arrive avec le bon lien `APP_URL`, et le push arrive (onglet en arrière-plan, puis application fermée).
- [ ] Commentaire et mention @ : alerte reçue ; l'auteur n'est pas notifié ; un projet privé ne notifie que ses membres.
- [ ] Décocher les e-mails dans la cloche : plus d'e-mail ni de résumé, mais le push continue.
- [ ] Rappel d'échéance : tâche assignée à échéance demain, attendre la passe horaire (ou redémarrer le serveur : une passe a lieu au démarrage) : alerte dans la cloche et e-mail.
- [ ] Résumé quotidien : mettre `DIGEST_HOUR` sur l'heure courante (dans `DIGEST_TZ`), redémarrer : un seul e-mail ; un second redémarrage n'en renvoie pas.
- [ ] Invité externe (projet « public ») : l'e-mail part ; sans Resend ou en cas de quota atteint, le lien s'affiche une fois à l'invitant.
- [ ] iPhone (iOS 16.4+) : installer sur l'écran d'accueil, activer le push depuis l'icône, s'assigner une tâche avec l'application fermée.

Session :
- [ ] Vider le stockage de session de l'onglet du module puis recharger : retour par NEXIS puis réouverture, sans boucle.
- [ ] Laisser le jeton expirer : la prochaine action renvoie vers NEXIS et revient.
- [ ] Désactiver le module pour l'organisation : le lien disparaît de NEXIS.

## 8. Avant d'ouvrir à l'équipe
- [ ] `npm test` passe sur la version déployée.
- [ ] Aucun fichier `.env` dans le dépôt (le `.gitignore` les exclut, à confirmer avec `git status`).
- [ ] La clé service_role, la clé de compte de service Firebase, `RESEND_API_KEY` et `IDENTITY_MODULE_KEY` n'apparaissent ni dans `client/`, ni dans `client/dist`, ni dans les logs, ni dans le dépôt.
- [ ] Qui reçoit les alertes quand le serveur tombe, et où sont lus les logs : à décider.

## Limites connues de cette V1
- Pas de limitation de débit (rate limiting) sur le serveur.
- Pièces jointes : 10 Mo par fichier, 10 fichiers par tâche. Les fichiers transitent par le serveur Node (en mémoire le temps de l'envoi) : si l'hébergeur impose une taille de requête plus petite (proxy, passerelle), l'envoi échouera avant 10 Mo. Aucun contrôle antivirus, et aucun aperçu : un fichier est toujours téléchargé, jamais affiché dans la page.
- Si la suppression d'un fichier dans le stockage échoue (service indisponible), la ligne en base est déjà supprimée : le fichier reste orphelin et l'erreur `[storage] suppression impossible` est écrite dans le terminal du serveur.
- E-mails : le plan gratuit Resend est limité à 100 e-mails/jour (3 000/mois, un domaine), **partagés** entre Projets, Identity et le résumé quotidien. Quota atteint : les e-mails sont refusés (journalisé), la cloche et le push continuent.
- Une tâche à échéance demain peut arriver deux fois par e-mail : par le rappel et par le résumé quotidien.
- Désactiver les e-mails dans la cloche coupe aussi le résumé quotidien, mais pas le push.
- Push : un clic sur une notification avec l'application fermée ouvre la racine, pas la tâche (pas d'adresse directe vers une tâche) ; iOS antérieur à 16.4 : rien n'arrive.
- Rappels et résumé : dates en UTC pour les rappels, une seule instance du serveur ; hors de ces règles, des doublons sont possibles.
- Le journal d'activité n'est pas purgé : à surveiller si le volume grandit.
- Les étiquettes sont du texte libre par tâche (pas de catalogue d'organisation) : renommer une étiquette demande de la modifier sur chaque tâche.
- Les sous-tâches (un seul niveau) comptent dans le tableau de bord et dans « Mes tâches » comme des tâches à part entière.
- Tableau de bord, « Mes tâches » et recherche filtrent ou calculent sur toutes les données de l'organisation à chaque appel : correct pour une équipe, à optimiser pour de gros volumes.
- Les tests automatiques s'appuient sur une base en mémoire qui imite le client Supabase : ils vérifient la logique du serveur (visibilité, droits, validation), pas les requêtes réelles sur PostgREST. Les sections 6 et 7 restent nécessaires une fois sur la vraie base (jamais testé avec un vrai envoi Resend, un vrai projet Firebase ni un vrai iPhone).
- Visibilité : « Public » (comptes portail) n'existe pas. Un projet privé dont le dernier membre est parti n'est visible que des responsables. Les personnes retirées d'un projet privé gardent leurs tâches assignées (signalées dans l'onglet Membres) mais ne les voient plus.