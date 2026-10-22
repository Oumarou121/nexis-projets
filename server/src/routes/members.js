import { Router } from "express";
import { db } from "../db.js";
import { UUID_RE, httpError, listOrgMembers } from "../auth.js";
import { unwrap } from "../util.js";
import { addMember, assertManager, assigneesWithoutAccess as listAssigneesWithoutAccess, isProjectRole, projectRole } from "../access.js";
import { logActivity } from "../activity.js";
import { notify } from "../notifications.js";

// Monté sous /api/organizations/:orgId/projects/:projectId/members, derrière projectGuard
// (qui a déjà vérifié que l'appelant voit le projet) : lire = tout rôle ; ajouter, changer le rôle, retirer =
// responsable du projet. Chaque membre a un RÔLE DANS LE PROJET (responsable, contributeur, observateur) ;
// son rôle effectif est le plus élevé entre celui-ci et celui que lui donne l'organisation (voir access.js).
// Être membre ouvre aussi un projet privé.
const router = Router({ mergeParams: true });

const toApi = (r) => ({ userId: r.user_id, role: isProjectRole(r.role) ? r.role : "contributor", addedBy: r.added_by ?? null, createdAt: r.created_at });

/** Rôle demandé dans le corps : responsable, contributeur ou observateur (absent = défaut). */
function parseRole(raw, fallback) {
  if (raw === undefined) return fallback;
  if (!isProjectRole(raw)) throw httpError(400, "Rôle invalide (manager, contributor ou viewer).");
  return raw;
}

const memberRow = (projectId, userId) =>
  db.from("project_members").select("*").eq("project_id", projectId).eq("user_id", userId).maybeSingle();

router.get("/", async (req, res) => {
  const { projectId } = req.params;
  const rows = unwrap(await db.from("project_members").select("*").eq("project_id", projectId).order("created_at", { ascending: true }));

  // Personnes qui ont une tâche en cours dans un projet privé sans en être membres : elles ne la voient plus.
  const assigneesWithoutAccess = req.project.visibility === "private" ? await listAssigneesWithoutAccess(projectId) : [];

  res.set("Cache-Control", "no-store").json({
    visibility: req.project.visibility,
    me: req.auth.userId,
    myRole: await projectRole(req),
    members: rows.map(toApi),
    assigneesWithoutAccess,
  });
});

router.post("/", async (req, res) => {
  await assertManager(req, "Seul un responsable du projet peut gérer ses membres.");
  const userId = String(req.body?.userId ?? "");
  if (!UUID_RE.test(userId)) throw httpError(400, "Membre invalide.");
  const role = parseRole(req.body?.role, "contributor");

  // La personne doit être membre actif de l'organisation (liste donnée par NEXIS Identity avec le jeton de l'appelant).
  let orgMembers;
  try {
    orgMembers = await listOrgMembers(req.auth, req.params.orgId);
  } catch (e) {
    if (e.status === 403) throw httpError(403, "Le droit de consulter les utilisateurs est requis pour gérer les membres d’un projet.");
    throw e;
  }
  if (!orgMembers.some((m) => m.userId === userId)) throw httpError(400, "Cette personne n’appartient pas à l’organisation.");

  const created = await addMember(req.params.projectId, userId, req.auth.userId, role);
  if (created) {
    await logActivity({
      orgId: req.params.orgId, actorId: req.auth.userId, action: "update", entityType: "project",
      entityId: req.project.id, projectId: req.project.id, label: req.project.name,
      details: { member: "added", user_id: userId, role },
    });
    await notify({
      orgId: req.params.orgId, userId, actorId: req.auth.userId, type: "project_member_added",
      projectId: req.project.id, title: `Vous avez été ajouté au projet « ${req.project.name} »`, auth: req.auth,
    });
  } else if (req.body?.role !== undefined) {
    // Déjà membre : le rôle demandé remplace l'ancien.
    unwrap(await db.from("project_members").update({ role }).eq("project_id", req.params.projectId).eq("user_id", userId).select("user_id"));
  }
  res.status(created ? 201 : 200).json(toApi(unwrap(await memberRow(req.params.projectId, userId))));
});

// Changer le rôle d'un membre dans le projet.
router.patch("/:userId", async (req, res) => {
  await assertManager(req, "Seul un responsable du projet peut gérer ses membres.");
  const { projectId, userId } = req.params;
  if (!UUID_RE.test(userId)) throw httpError(404, "Membre introuvable.");
  const role = parseRole(req.body?.role, undefined);
  if (!role) throw httpError(400, "Rôle attendu (manager, contributor ou viewer).");
  const current = unwrap(await memberRow(projectId, userId));
  if (!current) throw httpError(404, "Membre introuvable.");
  if (current.role !== role) {
    unwrap(await db.from("project_members").update({ role }).eq("project_id", projectId).eq("user_id", userId).select("user_id"));
    await logActivity({
      orgId: req.params.orgId, actorId: req.auth.userId, action: "update", entityType: "project",
      entityId: req.project.id, projectId: req.project.id, label: req.project.name,
      details: { member: "role", user_id: userId, role },
    });
  }
  res.json(toApi(unwrap(await memberRow(projectId, userId))));
});

// Retirer : dans un projet privé, la personne perd l'accès. Si elle a des tâches en cours, le responsable choisit :
//   ?unassign=1 : ces tâches repassent « non assignées » ; ?keep=1 : elles restent à son nom (signalées).
// Sans choix : 409 { openTasks } pour que l'interface le demande.
router.delete("/:userId", async (req, res) => {
  await assertManager(req, "Seul un responsable du projet peut gérer ses membres.");
  const { projectId, userId } = req.params;
  if (!UUID_RE.test(userId)) throw httpError(404, "Membre introuvable.");
  const rows = unwrap(await db.from("project_members").select("user_id, added_by").eq("project_id", projectId));
  const target = rows.find((r) => r.user_id === userId);
  if (!target) throw httpError(404, "Membre introuvable.");
  const lastMessage = "Un projet privé doit garder au moins un membre : passez-le en interne ou ajoutez quelqu’un d’abord.";
  // Un projet privé garde au moins un membre : sinon plus personne (hors administrateurs) ne pourrait l'ouvrir.
  if (req.project.visibility === "private" && rows.length <= 1) throw httpError(400, lastMessage);

  const losesAccess = req.project.visibility === "private";
  const unassign = req.query.unassign === "1";
  if (losesAccess && !unassign && req.query.keep !== "1") {
    const open = unwrap(await db.from("tasks").select("id").eq("project_id", projectId).eq("assignee_id", userId).neq("status", "done"));
    if (open.length > 0) {
      throw Object.assign(
        httpError(409, `Cette personne a ${open.length} tâche${open.length > 1 ? "s" : ""} en cours dans ce projet : choisissez de les désassigner ou de les laisser à son nom.`),
        { details: { openTasks: open.length } },
      );
    }
  }

  unwrap(await db.from("project_members").delete().eq("project_id", projectId).eq("user_id", userId));
  // Deux retraits simultanés ont pu passer le contrôle ci-dessus : on recompte APRÈS la suppression
  // et on rétablit ce membre si le projet privé se retrouve sans personne.
  if (losesAccess) {
    const left = unwrap(await db.from("project_members").select("user_id").eq("project_id", projectId));
    if (left.length === 0) {
      await addMember(projectId, userId, target.added_by ?? userId);
      throw httpError(400, lastMessage);
    }
  }
  if (losesAccess && unassign) {
    unwrap(
      await db.from("tasks").update({ assignee_id: null, updated_at: new Date().toISOString() }).eq("project_id", projectId).eq("assignee_id", userId).neq("status", "done").select("id"),
    );
  }
  await logActivity({
    orgId: req.params.orgId, actorId: req.auth.userId, action: "update", entityType: "project",
    entityId: req.project.id, projectId: req.project.id, label: req.project.name,
    details: { member: "removed", user_id: userId },
  });
  // Seul un projet privé fait perdre l'accès. Pas de lien vers le projet : il ne lui est plus accessible.
  if (losesAccess) {
    await notify({
      orgId: req.params.orgId, userId, actorId: req.auth.userId, type: "project_access_removed",
      title: `Vous n’avez plus accès au projet « ${req.project.name} »`, auth: req.auth,
    });
  }
  res.status(204).end();
});

export default router;
