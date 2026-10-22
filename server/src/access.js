import { db } from "./db.js";
import { UUID_RE, hasPermission, httpError, listOrgMembers } from "./auth.js";
import { unwrap } from "./util.js";

// Visibilité des projets, appliquée ICI et nulle part ailleurs.
//
//   internal : tout utilisateur de l'organisation ayant projects.read.
//   private  : les membres du projet (table project_members, quel que soit leur rôle) et les
//              administrateurs de l'organisation (ADMIN_PERMISSIONS).
//
// Un projet privé qu'on ne peut pas voir répond 404 (jamais 403) : son existence n'est pas révélée.
//   public   : comme « internal » pour l'organisation, et en plus partageable en LECTURE SEULE avec des
//              invités externes par e-mail (table project_guests, API /api/portal, voir routes/portal.js).
//              Un invité n'a AUCUN accès à l'API de l'organisation.
export const VISIBILITIES = ["internal", "private", "public"];

// Qui voit TOUS les projets privés de l'organisation sans en être membre : les administrateurs de
// l'organisation (projects.manage, ou projects.delete). Ils sont aussi responsables de tous les projets.
export const ADMIN_PERMISSIONS = ["projects.manage", "projects.delete"];
export const FULL_ACCESS_PERMISSION = "projects.delete"; // conservé pour les imports existants

/** Vrai si l'appelant administre les projets de l'organisation (voit et gère tout). Une fois par requête. */
export async function isOrgAdmin(req) {
  if (req.orgAdmin === undefined) {
    req.orgAdmin = false;
    for (const p of ADMIN_PERMISSIONS) {
      if (await hasPermission(req.auth, req.params.orgId, p)) {
        req.orgAdmin = true;
        break;
      }
    }
  }
  return req.orgAdmin;
}

/** Vrai si l'appelant voit tous les projets de l'organisation, privés compris. */
export const isFullAccess = isOrgAdmin;

// ── Rôles dans un projet (modèle mixte) ────────────────────────────────────────────────────────
//   manager     : responsable — paramètres, visibilité, membres, invités, étapes, toutes les tâches
//   contributor : crée des tâches et fait avancer les SIENNES (créées par lui, assignées à lui, ou sous-tâches
//                 d'une des siennes), ne s'assigne qu'à lui-même, joint des fichiers, saisit son temps
//   viewer      : observateur — lit et commente
// Rôle effectif = le plus élevé entre celui que donne l'organisation et celui donné dans le projet
// (table project_members). Le créateur d'un projet en devient responsable.
export const PROJECT_ROLES = ["viewer", "contributor", "manager"]; // ordre croissant
const rank = (r) => PROJECT_ROLES.indexOf(r ?? "");
export const higher = (a, b) => (rank(a) >= rank(b) ? a : b) ?? null;
export const isProjectRole = (r) => PROJECT_ROLES.includes(r);
const ROLE_LABEL = { viewer: "observateur", contributor: "contributeur", manager: "responsable" };

/** Rôle que l'organisation donne à l'appelant dans tous ses projets (null : aucun accès). */
export async function orgBaseRole(req) {
  if (req.orgBase === undefined) {
    const { orgId } = req.params;
    req.orgBase = (await isOrgAdmin(req))
      ? "manager"
      : (await hasPermission(req.auth, orgId, "projects.update"))
        ? "contributor"
        : (await hasPermission(req.auth, orgId, "projects.read"))
          ? "viewer"
          : null;
  }
  return req.orgBase;
}

/** Rôle d'un membre du projet (null s'il n'en est pas membre). Avant la migration des rôles : contributeur. */
export async function memberRole(projectId, userId) {
  const row = unwrap(await db.from("project_members").select("*").eq("project_id", projectId).eq("user_id", userId).maybeSingle());
  return row ? (isProjectRole(row.role) ? row.role : "contributor") : null;
}

/** Rôle effectif de l'appelant dans le projet courant (posé par projectGuard). Une fois par requête. */
export async function projectRole(req) {
  if (req.projectRoleCache === undefined) {
    const projectId = req.project?.id ?? req.params.projectId;
    req.projectRoleCache = higher(await orgBaseRole(req), projectId ? await memberRole(projectId, req.auth.userId) : null);
  }
  return req.projectRoleCache;
}

/** Vrai si l'appelant est responsable du projet courant. */
export async function isManager(req) {
  return (await projectRole(req)) === "manager";
}

/** 403 si le rôle de l'appelant dans le projet est inférieur à `min`. */
export async function assertRole(req, min, message) {
  if (rank(await projectRole(req)) < rank(min)) {
    throw httpError(403, message ?? `Action réservée à un ${ROLE_LABEL[min]} du projet.`);
  }
}

/** Middleware : rôle minimal dans le projet courant. */
export const requireRole = (min, message) => async (req, _res, next) => {
  try {
    await assertRole(req, min, message);
    next();
  } catch (e) {
    next(e);
  }
};

/** 403 si l'appelant n'est pas responsable du projet. */
export async function assertManager(req, what = "Seul un responsable du projet peut faire cette modification.") {
  await assertRole(req, "manager", what);
}

// Rôle d'organisation d'une AUTRE personne, déduit de son rôle NEXIS Identity (annuaire des membres) :
// sert à vérifier qu'on peut lui confier une tâche. Même correspondance que les permissions par défaut.
const ORG_ROLE_BASE = { super_admin: "manager", owner: "manager", organization_admin: "manager", manager: "contributor", user: "contributor", viewer: "viewer" };
// Rôle absent (ancienne version d'Identity) : contributeur, comme avant ; rôle inconnu (ex. comptable) : observateur.
export const orgRoleBaseOf = (identityRole) => (identityRole == null ? "contributor" : ORG_ROLE_BASE[identityRole] ?? "viewer");

/** Rôle effectif d'une autre personne dans le projet, à partir de son rôle d'organisation (annuaire). */
export async function roleOfPerson(projectId, userId, identityRole) {
  return higher(orgRoleBaseOf(identityRole), await memberRole(projectId, userId));
}

/** Tâche { id, created_by, assignee_id, parent_id } du projet, ou 404. */
export async function loadTask(req, taskId) {
  if (!UUID_RE.test(String(taskId))) throw httpError(404, "Tâche introuvable.");
  const row = unwrap(
    await db.from("tasks").select("id, title, created_by, assignee_id, parent_id").eq("id", taskId).eq("project_id", req.project?.id ?? req.params.projectId).maybeSingle(),
  );
  if (!row) throw httpError(404, "Tâche introuvable.");
  return row;
}

const ownsRow = (task, userId) => task.created_by === userId || task.assignee_id === userId;

/** Sa tâche : créée par lui, assignée à lui, ou sous-tâche d'une tâche qui est la sienne. */
export async function ownsTask(req, task) {
  if (ownsRow(task, req.auth.userId)) return true;
  if (!task.parent_id) return false;
  const parent = unwrap(await db.from("tasks").select("created_by, assignee_id").eq("id", task.parent_id).maybeSingle());
  return !!parent && ownsRow(parent, req.auth.userId);
}

/** 403 si l'appelant ne peut pas modifier cette tâche (responsable, ou contributeur dont c'est la tâche). */
export async function assertCanEditTask(req, task) {
  const role = await projectRole(req);
  if (role === "manager") return;
  if (role !== "contributor") throw httpError(403, "Un observateur peut lire et commenter, pas modifier les tâches.");
  if (!(await ownsTask(req, task))) {
    throw httpError(403, "Vous ne pouvez modifier que vos tâches (créées par vous ou qui vous sont assignées).");
  }
}

async function isMember(projectId, userId) {
  const row = unwrap(
    await db.from("project_members").select("user_id").eq("project_id", projectId).eq("user_id", userId).maybeSingle(),
  );
  return !!row;
}

/** L'appelant peut-il voir ce projet ({ id, visibility }) ? */
export async function canSeeProject(req, project) {
  if (project.visibility !== "private") return true;
  if (await isFullAccess(req)) return true;
  return isMember(project.id, req.auth.userId);
}

/**
 * Périmètre de l'appelant pour les requêtes qui portent sur toute l'organisation (liste, recherche,
 * tableau de bord, « Mes tâches », journal). Calculé une fois par requête.
 *   hidden    : identifiants des projets privés que l'appelant ne voit pas (vide pour un responsable)
 *   hiddenSet : le même, en Set
 *   memberOf  : identifiants des projets privés dont l'appelant est membre
 */
export async function getScope(req) {
  if (req.scope) return req.scope;
  const full = await isFullAccess(req);
  let hidden = [];
  let memberOf = new Set();
  if (!full) {
    const privateIds = unwrap(
      await db.from("projects").select("id").eq("organization_id", req.params.orgId).eq("visibility", "private"),
    ).map((r) => r.id);
    if (privateIds.length > 0) {
      const mine = unwrap(
        await db.from("project_members").select("project_id").eq("user_id", req.auth.userId).in("project_id", privateIds),
      );
      memberOf = new Set(mine.map((r) => r.project_id));
      hidden = privateIds.filter((id) => !memberOf.has(id));
    }
  }
  req.scope = { full, hidden, hiddenSet: new Set(hidden), memberOf };
  return req.scope;
}

/** Ajoute « pas dans les projets cachés » à une requête Supabase (avant order/limit). */
export function excludeHidden(query, column, scope) {
  return scope.hidden.length > 0 ? query.not(column, "in", `(${scope.hidden.join(",")})`) : query;
}

// Droit exigé AVANT toute lecture de la base, selon la méthode : le refus (403) ne dépend ainsi
// jamais de l'existence ou de la visibilité du projet. Les routes gardent leur propre contrôle,
// qui reste le plus précis ; celui-ci est un plancher, pas un remplacement.
// Écrire ne demande ici que l'accès aux projets : c'est le rôle DANS le projet (requireRole) qui décide
// ensuite, car une personne « lecture seule » dans l'organisation peut être contributrice d'un projet.
function requiredPermission(req) {
  if (req.method === "DELETE" && req.path === "/") return "projects.delete"; // suppression du projet lui-même
  return "projects.read";
}

/**
 * Garde unique de TOUT ce qui se trouve sous /projects/:projectId (le projet, ses tâches,
 * commentaires, pièces jointes, activités, feuilles de temps, dépendances, historique, membres…).
 * Monté une fois, avant les sous-routeurs : une route ajoutée plus tard est protégée d'office.
 * Place { id, name, visibility } dans req.project.
 */
export async function projectGuard(req, _res, next) {
  try {
    const { orgId, projectId } = req.params;
    if (!UUID_RE.test(orgId)) throw httpError(400, "Organisation invalide.");
    if (!(await hasPermission(req.auth, orgId, requiredPermission(req)))) throw httpError(403, "Accès refusé.");
    if (!UUID_RE.test(projectId)) throw httpError(404, "Projet introuvable.");
    const project = unwrap(
      await db.from("projects").select("id, name, visibility").eq("id", projectId).eq("organization_id", orgId).maybeSingle(),
    );
    if (!project || !(await canSeeProject(req, project))) throw httpError(404, "Projet introuvable.");
    req.project = project;
    next();
  } catch (e) {
    next(e);
  }
}

/** Ajoute un membre avec son rôle dans le projet (sans erreur s'il l'est déjà). Renvoie true s'il vient d'être ajouté. */
export async function addMember(projectId, userId, addedBy, role = "contributor") {
  let { error } = await db.from("project_members").insert({ project_id: projectId, user_id: userId, added_by: addedBy, role });
  // Colonne « role » absente (migration 20261022090000 pas encore appliquée) : membre ajouté sans rôle.
  if (error?.code === "PGRST204") ({ error } = await db.from("project_members").insert({ project_id: projectId, user_id: userId, added_by: addedBy }));
  if (!error) return true;
  if (error.code === "23505") return false; // déjà membre
  console.error(error);
  throw httpError(500, "Erreur base de données.");
}

/** Retire un membre. Utilisé pour annuler un ajout dont le changement n'a pas abouti. */
export async function removeMember(projectId, userId) {
  const { error } = await db.from("project_members").delete().eq("project_id", projectId).eq("user_id", userId);
  if (error) console.error(error);
}

/**
 * Personnes qui ont une tâche en cours dans ce projet sans en être membres : s'il est privé,
 * elles ne la voient pas. Sert au signalement (onglet Membres, et avertissement au passage en privé).
 */
export async function assigneesWithoutAccess(projectId) {
  const open = unwrap(
    await db.from("tasks").select("assignee_id").eq("project_id", projectId).neq("status", "done").not("assignee_id", "is", null),
  );
  const rows = unwrap(await db.from("project_members").select("user_id").eq("project_id", projectId));
  const ok = new Set(rows.map((r) => r.user_id));
  return [...new Set(open.map((t) => t.assignee_id))].filter((id) => !ok.has(id));
}

/** Un assigné doit être membre actif de l'organisation, et du projet s'il est privé (null = désaffecter). */
export async function assertAssignee(req, assigneeId) {
  if (!assigneeId) return;
  // Soi-même : forcément membre actif, et au moins contributeur (requireRole) : pas besoin de l'annuaire.
  if (assigneeId === req.auth.userId) return;
  const person = (await listOrgMembers(req.auth, req.params.orgId)).find((m) => m.userId === assigneeId);
  if (!person) throw httpError(400, "Ce membre n’appartient pas à l’organisation.");
  const orgAdmin = orgRoleBaseOf(person.role) === "manager"; // voit tous les projets, privés compris
  // Dans un projet privé, l'assigné doit pouvoir le voir : sinon il aurait une tâche qu'il ne peut pas ouvrir.
  if (req.project?.visibility === "private" && !orgAdmin) {
    const row = unwrap(
      await db.from("project_members").select("user_id").eq("project_id", req.params.projectId).eq("user_id", assigneeId).maybeSingle(),
    );
    if (!row) throw httpError(400, "Cette personne n’a pas accès à ce projet privé : ajoutez-la d’abord aux membres du projet.");
  }
  // On ne confie pas de travail à un observateur : il ne pourrait pas faire avancer la tâche.
  if ((await roleOfPerson(req.params.projectId, assigneeId, person.role)) === "viewer") {
    throw httpError(400, "Cette personne est observatrice du projet : donnez-lui d’abord le rôle de contributeur.");
  }
}
