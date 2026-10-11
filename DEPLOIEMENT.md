# Mise en production — module Gestion de projet

Ce guide a été écrit d'après le code du module et celui de NEXIS Identity. Rien n'a été
exécuté contre une vraie base ni un vrai hébergeur : la section 6 sert justement à le faire
une fois, avant d'ouvrir le module à l'équipe.

Pièces à mettre en ligne : **(a)** le client (fichiers statiques), **(b)** le serveur Node,
**(c)** le projet Supabase des données du module. NEXIS Identity et son projet Supabase existent déjà.

## 1. Base de données du module (projet Supabase dédié)
- [ ] Créer un projet Supabase **distinct** d'Identity (ne jamais y mettre ces tables).
- [ ] SQL Editor, dans l'ordre : `20261008020000_projects_init.sql`, `20261008030000_activity_log.sql`, `20261008040000_task_comments.sql`, `20261008050000_task_labels_subtasks.sql` (celle-ci ajoute des colonnes à `tasks` : à passer AVANT de déployer le nouveau serveur, sinon la liste des tâches répond « Erreur base de données »), puis `20261008060000_task_attachments.sql` (table des pièces jointes + bucket de stockage privé `task-attachments`, 10 Mo par fichier).
- [ ] Vérifier que la RLS est active sur les 5 tables (`projects`, `tasks`, `activity_log`, `task_comments`, `task_attachments`) :
      ```sql
      select relname, relrowsecurity from pg_class
      where relname in ('projects','tasks','activity_log','task_comments','task_attachments');
      ```
      Les cinq lignes doivent afficher `true`.
- [ ] Vérifier le bucket des pièces jointes : Storage → `task-attachments` existe et n'est **pas** public (ou : `select id, public, file_size_limit from storage.buckets where id = 'task-attachments';` → `false`, `10485760`).
- [ ] Relever l'URL du projet et la clé **service_role** (Settings → API). Cette clé ne va **que** dans le serveur.
- [ ] Activer les sauvegardes du projet (selon le plan Supabase) et noter qui peut restaurer.

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

- [ ] Le serveur s'arrête au démarrage s'il manque l'une des 4 premières variables : lire son terminal.
- [ ] `GET https://<api>/health` répond `{"ok":true}`.
- [ ] Le serveur est en **HTTPS** (le client est en HTTPS : un appel HTTP serait bloqué par le navigateur).
- [ ] Surveiller les logs : `[auth] JWT refusé : …` (cause d'un 401) et `[activity] écriture impossible : …` (journal en panne sans bloquer l'utilisateur).

## 3. Client
Les variables `VITE_*` sont **figées à la compilation** : les définir AVANT `npm run build`, puis
redéployer à chaque changement.

| Variable | Valeur |
|---|---|
| `VITE_NEXIS_URL` | URL publique de NEXIS, sans slash final |
| `VITE_API_URL` | URL publique du serveur Node, sans slash final (vide uniquement en développement) |

- [ ] `npm run build` → publier le dossier `client/dist` sur un hébergeur statique, en **HTTPS**.
- [ ] Pas de règle de réécriture à prévoir : l'application n'a pas de routes (une seule page).
- [ ] Le domaine du client correspond exactement à `CLIENT_ORIGIN` côté serveur.

## 4. Côté NEXIS Identity
- [ ] `/dashboard/modules` (admin plateforme) : renseigner l'URL du module `projects` avec le domaine du client.
- [ ] **Activer le module pour chaque organisation** : sans ligne dans `organization_modules`, il est désactivé (opt-in), et `/dashboard/ouvrir/projects` affiche « Cette application n’est pas disponible ».
- [ ] Le module n'apparaît que pour les rôles qui ont `projects.read`.
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

## 6. Test sur la vraie base (à faire une fois, avant l'équipe)
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

Session :
- [ ] Vider le stockage de session de l'onglet du module puis recharger : retour par NEXIS puis réouverture, sans boucle.
- [ ] Laisser le jeton expirer : la prochaine action renvoie vers NEXIS et revient.
- [ ] Désactiver le module pour l'organisation : le lien disparaît de NEXIS.

## 7. Avant d'ouvrir à l'équipe
- [ ] `npm test` passe (77 tests) sur la version déployée.
- [ ] Aucun fichier `.env` dans le dépôt (le `.gitignore` les exclut, à confirmer avec `git status`).
- [ ] La clé service_role n'apparaît ni dans `client/`, ni dans `client/dist`, ni dans les logs.
- [ ] Qui reçoit les alertes quand le serveur tombe, et où sont lus les logs : à décider.

## Limites connues de cette V1
- Pas de limitation de débit (rate limiting) sur le serveur.
- Pièces jointes : 10 Mo par fichier, 10 fichiers par tâche. Les fichiers transitent par le serveur Node (en mémoire le temps de l'envoi) : si l'hébergeur impose une taille de requête plus petite (proxy, passerelle), l'envoi échouera avant 10 Mo. Aucun contrôle antivirus, et aucun aperçu : un fichier est toujours téléchargé, jamais affiché dans la page.
- Si la suppression d'un fichier dans le stockage échoue (service indisponible), la ligne en base est déjà supprimée : le fichier reste orphelin et l'erreur `[storage] suppression impossible` est écrite dans le terminal du serveur.
- Le journal d'activité n'est pas purgé : à surveiller si le volume grandit.
- Les étiquettes sont du texte libre par tâche (pas de catalogue d'organisation) : renommer une étiquette demande de la modifier sur chaque tâche.
- Les sous-tâches (un seul niveau) comptent dans le tableau de bord et dans « Mes tâches » comme des tâches à part entière.
- Tableau de bord, « Mes tâches » et recherche filtrent ou calculent sur toutes les données de l'organisation à chaque appel : correct pour une équipe, à optimiser pour de gros volumes.
- Les tests automatiques s'appuient sur une base en mémoire qui imite le client Supabase : ils vérifient la logique du serveur (visibilité, droits, validation), pas les requêtes réelles sur PostgREST. La section 6 reste nécessaire une fois sur la vraie base.
- Visibilité : « Public » (comptes portail) n'existe pas. Un projet privé dont le dernier membre est parti n'est visible que des responsables. Les personnes retirées d'un projet privé gardent leurs tâches assignées (signalées dans l'onglet Membres) mais ne les voient plus.
