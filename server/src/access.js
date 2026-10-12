import { db } from "./db.js";
import { UUID_RE, hasPermission, httpError } from "./auth.js";
import { unwrap } from "./util.js";

// Visibilité des projets, appliquée ICI et nulle part ailleurs.
//
//   internal : tout utilisateur de l'organisation ayant projects.read.
//   private  : les membres du projet (table project_members), les détenteurs de
//              FULL_ACCESS_PERMISSION dans l'organisation et les administrateurs plateforme.
//
// Un projet privé qu'on ne peut pas voir répond 404 (jamais 403) : son existence n'est pas révélée.
//   public   : comme « internal » pour l'organisation, et en plus partageable en LECTURE SEULE avec des
//              invités externes par e-mail (table project_guests, API /api/portal, voir routes/portal.js).
//              Un invité n'a AUCUN accès à l'API de l'organisation.
export const VISIBILITIES = ["internal", "private", "public"];

// Qui voit TOUS les projets privés de l'organisation sans en être membre. Une seule constante
// à changer si cette règle ne vous convient pas (l'administrateur plateforme voit tout, toujours).
export const FULL_ACCESS_PERMISSION = "projects.delete";

/** Vrai si l'appelant voit tous les projets de l'organisation (responsable ou admin plateforme). */
export async function isFullAccess(req) {
  if (req.fullAccess === undefined) {
    req.fullAccess = await hasPermission(req.auth, req.params.orgId, FULL_ACCESS_PERMISSION);
  }
  return req.fullAccess;
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
function requiredPermission(req) {
  if (req.method === "GET" || req.method === "HEAD") return "projects.read";
  if (req.method === "DELETE" && req.path === "/") return "projects.delete"; // suppression du projet lui-même
  return "projects.update";
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

/** Ajoute un membre (sans erreur s'il l'est déjà). Renvoie true s'il vient d'être ajouté. */
export async function addMember(projectId, userId, addedBy) {
  const { error } = await db.from("project_members").insert({ project_id: projectId, user_id: userId, added_by: addedBy });
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
