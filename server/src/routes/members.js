import { Router } from "express";
import { db } from "../db.js";
import { UUID_RE, httpError, listOrgMembers } from "../auth.js";
import { unwrap } from "../util.js";
import { addMember, assigneesWithoutAccess as listAssigneesWithoutAccess } from "../access.js";
import { logActivity } from "../activity.js";
import { notify } from "../notifications.js";

// Monté sous /api/organizations/:orgId/projects/:projectId/members, derrière projectGuard
// (qui a déjà vérifié que l'appelant voit le projet) : lire = projects.read ; ajouter / retirer = projects.update.
// Les membres sont gérés pour tous les projets ; ils ne limitent l'accès que lorsque le projet est privé.
const router = Router({ mergeParams: true });

const toApi = (r) => ({ userId: r.user_id, addedBy: r.added_by ?? null, createdAt: r.created_at });

router.get("/", async (req, res) => {
  const { projectId } = req.params;
  const rows = unwrap(
    await db.from("project_members").select("user_id, added_by, created_at").eq("project_id", projectId).order("created_at", { ascending: true }),
  );

  // Personnes qui ont une tâche en cours dans un projet privé sans en être membres : elles ne la voient plus.
  const assigneesWithoutAccess = req.project.visibility === "private" ? await listAssigneesWithoutAccess(projectId) : [];

  res.set("Cache-Control", "no-store").json({
    visibility: req.project.visibility,
    me: req.auth.userId,
    members: rows.map(toApi),
    assigneesWithoutAccess,
  });
});

router.post("/", async (req, res) => {
  const userId = String(req.body?.userId ?? "");
  if (!UUID_RE.test(userId)) throw httpError(400, "Membre invalide.");

  // La personne doit être membre actif de l'organisation (liste donnée par NEXIS Identity avec le jeton de l'appelant).
  let orgMembers;
  try {
    orgMembers = await listOrgMembers(req.auth, req.params.orgId);
  } catch (e) {
    if (e.status === 403) throw httpError(403, "Le droit de consulter les utilisateurs est requis pour gérer les membres d’un projet.");
    throw e;
  }
  if (!orgMembers.some((m) => m.userId === userId)) throw httpError(400, "Cette personne n’appartient pas à l’organisation.");

  const created = await addMember(req.params.projectId, userId, req.auth.userId);
  if (created) {
    await logActivity({
      orgId: req.params.orgId, actorId: req.auth.userId, action: "update", entityType: "project",
      entityId: req.project.id, projectId: req.project.id, label: req.project.name,
      details: { member: "added", user_id: userId },
    });
    await notify({
      orgId: req.params.orgId, userId, actorId: req.auth.userId, type: "project_member_added",
      projectId: req.project.id, title: `Vous avez été ajouté au projet « ${req.project.name} »`, auth: req.auth,
    });
  }
  const row = unwrap(
    await db.from("project_members").select("user_id, added_by, created_at").eq("project_id", req.params.projectId).eq("user_id", userId).maybeSingle(),
  );
  res.status(created ? 201 : 200).json(toApi(row));
});

router.delete("/:userId", async (req, res) => {
  const { projectId, userId } = req.params;
  if (!UUID_RE.test(userId)) throw httpError(404, "Membre introuvable.");
  const rows = unwrap(await db.from("project_members").select("user_id, added_by").eq("project_id", projectId));
  const target = rows.find((r) => r.user_id === userId);
  if (!target) throw httpError(404, "Membre introuvable.");
  const lastMessage = "Un projet privé doit garder au moins un membre : passez-le en interne ou ajoutez quelqu’un d’abord.";
  // Un projet privé garde au moins un membre : sinon plus personne (hors responsables) ne pourrait l'ouvrir.
  if (req.project.visibility === "private" && rows.length <= 1) throw httpError(400, lastMessage);
  unwrap(await db.from("project_members").delete().eq("project_id", projectId).eq("user_id", userId));
  // Deux retraits simultanés ont pu passer le contrôle ci-dessus : on recompte APRÈS la suppression
  // et on rétablit ce membre si le projet privé se retrouve sans personne.
  if (req.project.visibility === "private") {
    const left = unwrap(await db.from("project_members").select("user_id").eq("project_id", projectId));
    if (left.length === 0) {
      await addMember(projectId, userId, target.added_by ?? userId);
      throw httpError(400, lastMessage);
    }
  }
  await logActivity({
    orgId: req.params.orgId, actorId: req.auth.userId, action: "update", entityType: "project",
    entityId: req.project.id, projectId: req.project.id, label: req.project.name,
    details: { member: "removed", user_id: userId },
  });
  // Seul un projet privé fait perdre l'accès. Pas de lien vers le projet : il ne lui est plus accessible.
  if (req.project.visibility === "private") {
    await notify({
      orgId: req.params.orgId, userId, actorId: req.auth.userId, type: "project_access_removed",
      title: `Vous n’avez plus accès au projet « ${req.project.name} »`, auth: req.auth,
    });
  }
  res.status(204).end();
});

export default router;
