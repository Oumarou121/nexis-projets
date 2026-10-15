import { Router } from "express";
import { db } from "../db.js";
import { UUID_RE, hasPermission, httpError, listOrgMembers, requirePermission } from "../auth.js";
import { assertProject, assertTask, clip, unwrap } from "../util.js";
import { logActivity } from "../activity.js";
import { notify } from "../notifications.js";

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

const MAX_MENTIONS = 20;

/** Personnes mentionnées : identifiants uniques, valides, sans l'auteur. 400 si le format est faux. */
function parseMentions(raw, authorId) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.length > MAX_MENTIONS || !raw.every((id) => typeof id === "string" && UUID_RE.test(id))) {
    throw httpError(400, "Mentions invalides.");
  }
  return [...new Set(raw)].filter((id) => id !== authorId);
}

const fullName = (m) => [m?.firstName, m?.lastName].filter(Boolean).join(" ").trim();

/**
 * Prévient les personnes concernées par un nouveau commentaire :
 *   - les personnes mentionnées (@) : « mention » ;
 *   - l'assigné et le créateur de la tâche : « commentaire », une seule alerte tant qu'elle n'est pas lue.
 * Une personne mentionnée ne reçoit pas en plus l'alerte de commentaire. L'auteur n'est jamais prévenu.
 * Les mentions ne valent que pour des membres de l'organisation (et du projet s'il est privé) :
 * les autres sont ignorées sans message, pour ne rien révéler. Sans le droit de lister les utilisateurs
 * (NEXIS Identity), on ne peut pas vérifier : pas de mentions, mais les alertes de commentaire partent.
 */
async function notifyComment(req, { project, task, mentions }) {
  let people = [];
  try {
    people = await listOrgMembers(req.auth, req.params.orgId);
  } catch {
    mentions = [];
  }
  const known = new Set(people.map((m) => m.userId));
  const mentioned = mentions.filter((id) => known.has(id));
  const author = fullName(people.find((m) => m.userId === req.auth.userId)) || "Quelqu’un";
  const base = { orgId: req.params.orgId, actorId: req.auth.userId, projectId: project.id, taskId: task.id, auth: req.auth };

  for (const userId of mentioned) {
    await notify({ ...base, userId, type: "task_mentioned", title: `${author} vous a mentionné dans la tâche « ${clip(task.title, 70)} » (projet « ${clip(project.name, 50)} »)` });
  }
  const row = unwrap(await db.from("tasks").select("assignee_id, created_by").eq("id", task.id).maybeSingle());
  const concerned = [...new Set([row?.assignee_id, row?.created_by].filter(Boolean))].filter((id) => !mentioned.includes(id));
  for (const userId of concerned) {
    await notify({ ...base, userId, type: "task_commented", title: `${author} a commenté la tâche « ${clip(task.title, 70)} » (projet « ${clip(project.name, 50)} »)`, collapseUnread: true });
  }
}

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
  const mentions = parseMentions(req.body?.mentions, req.auth.userId);
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
  await notifyComment(req, { project, task, mentions });
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
