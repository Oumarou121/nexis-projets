import { Router } from "express";
import { db } from "../db.js";
import { UUID_RE, hasPermission, httpError, requirePermission } from "../auth.js";
import { assertProject, assertTask, unwrap } from "../util.js";
import { logActivity } from "../activity.js";

// Monté sous .../projects/:projectId/tasks/:taskId/comments.
// Lire = projects.read ; commenter = projects.update (comme toute modification d'une tâche).
// Supprimer : son propre commentaire (projects.update) ou n'importe lequel avec projects.delete.
const COLS = "id, task_id, author_id, body, created_at";

const toApi = (r, userId, canModerate) => ({
  id: r.id,
  taskId: r.task_id,
  authorId: r.author_id,
  body: r.body,
  createdAt: r.created_at,
  canDelete: r.author_id === userId || canModerate,
});

const router = Router({ mergeParams: true });

router.get("/", requirePermission("projects.read"), async (req, res) => {
  const { projectId, taskId, orgId } = req.params;
  await assertProject(req.params);
  await assertTask(taskId, projectId);
  const rows = unwrap(
    await db.from("task_comments").select(COLS).eq("task_id", taskId).order("created_at", { ascending: true }),
  );
  const canModerate = await hasPermission(req.auth, orgId, "projects.delete");
  res.json(rows.map((r) => toApi(r, req.auth.userId, canModerate)));
});

router.post("/", requirePermission("projects.update"), async (req, res) => {
  const body = String(req.body?.body ?? "").trim();
  if (body.length < 1 || body.length > 4000) throw httpError(400, "Le commentaire doit faire 1 à 4000 caractères.");
  const project = await assertProject(req.params);
  const task = await assertTask(req.params.taskId, req.params.projectId);
  const row = unwrap(
    await db.from("task_comments").insert({ task_id: task.id, author_id: req.auth.userId, body }).select(COLS).single(),
  );
  // Le texte n'est pas copié dans le journal : on y note seulement qu'un commentaire a été ajouté.
  await logActivity({
    orgId: req.params.orgId, actorId: req.auth.userId, action: "update", entityType: "task",
    entityId: task.id, projectId: project.id, label: task.title, details: { project: project.name, comment: true },
  });
  res.status(201).json(toApi(row, req.auth.userId, false));
});

router.delete("/:commentId", requirePermission("projects.update"), async (req, res) => {
  const { commentId, taskId, projectId, orgId } = req.params;
  if (!UUID_RE.test(commentId)) throw httpError(404, "Commentaire introuvable.");
  await assertProject(req.params);
  await assertTask(taskId, projectId);
  const found = unwrap(
    await db.from("task_comments").select("id, author_id").eq("id", commentId).eq("task_id", taskId).maybeSingle(),
  );
  if (!found) throw httpError(404, "Commentaire introuvable.");
  if (found.author_id !== req.auth.userId && !(await hasPermission(req.auth, orgId, "projects.delete"))) {
    throw httpError(403, "Seul l’auteur ou un responsable peut supprimer ce commentaire.");
  }
  unwrap(await db.from("task_comments").delete().eq("id", commentId));
  res.status(204).end();
});

export default router;
