import { Router } from "express";
import { db } from "../db.js";
import { UUID_RE, httpError, listOrgMembers, requirePermission } from "../auth.js";
import { DATE_RE, PRIORITIES, assertProject, unwrap } from "../util.js";
import comments from "./comments.js";
import attachments from "./attachments.js";
import activities from "./activities.js";
import timesheets from "./timesheets.js";
import dependencies from "./dependencies.js";
import statusHistory from "./statusHistory.js";
import { pathsForTasks, removeFiles } from "../storage.js";
import { changedFields, logActivity } from "../activity.js";
import { recordStatus } from "../history.js";

// Monté sous /api/organizations/:orgId/projects/:projectId/tasks.
// Droits : lecture = projects.read ; créer / modifier / supprimer = projects.update.
// Affecter quelqu'un exige en plus de pouvoir lister les membres dans NEXIS Identity.
const STATUSES = ["todo", "in_progress", "review", "done"];
const COLS = "id, project_id, title, description, status, priority, assignee_id, start_date, due_date, labels, parent_id, is_milestone, created_by, created_at, updated_at";

const toApi = (r) => ({
  id: r.id,
  projectId: r.project_id,
  title: r.title,
  description: r.description,
  status: r.status,
  priority: r.priority,
  assigneeId: r.assignee_id,
  startDate: r.start_date ?? null,
  dueDate: r.due_date,
  labels: r.labels ?? [],
  parentId: r.parent_id ?? null,
  isMilestone: r.is_milestone ?? false,
  createdBy: r.created_by,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

function parse(body, { partial }) {
  const out = {};
  const has = (k) => body?.[k] !== undefined;

  if (has("title") || !partial) {
    const title = String(body?.title ?? "").trim().replace(/\s+/g, " ");
    if (title.length < 2 || title.length > 200) throw httpError(400, "Le titre doit faire 2 à 200 caractères.");
    out.title = title;
  }
  if (has("description")) {
    const d = body.description === null ? "" : String(body.description).trim();
    if (d.length > 4000) throw httpError(400, "Description trop longue (4000 caractères).");
    out.description = d || null;
  }
  if (has("status")) {
    if (!STATUSES.includes(body.status)) throw httpError(400, "Statut invalide.");
    out.status = body.status;
  }
  if (has("priority")) {
    if (!PRIORITIES.includes(body.priority)) throw httpError(400, "Priorité invalide.");
    out.priority = body.priority;
  }
  if (has("assigneeId")) {
    if (body.assigneeId !== null && !UUID_RE.test(String(body.assigneeId))) throw httpError(400, "Membre invalide.");
    out.assignee_id = body.assigneeId;
  }
  if (has("dueDate")) {
    if (body.dueDate !== null && !DATE_RE.test(body.dueDate)) throw httpError(400, "Échéance invalide (AAAA-MM-JJ).");
    out.due_date = body.dueDate;
  }
  if (has("startDate")) {
    if (body.startDate !== null && !DATE_RE.test(body.startDate)) throw httpError(400, "Date de début invalide (AAAA-MM-JJ).");
    out.start_date = body.startDate;
  }
  if (out.start_date && out.due_date && out.start_date > out.due_date) throw httpError(400, "La date de début doit précéder l'échéance.");
  if (has("labels")) {
    if (!Array.isArray(body.labels)) throw httpError(400, "Étiquettes invalides.");
    const seen = new Set();
    const labels = [];
    for (const raw of body.labels) {
      const l = String(raw ?? "").trim().replace(/\s+/g, " ");
      if (l.length < 1 || l.length > 30) throw httpError(400, "Une étiquette doit faire 1 à 30 caractères.");
      if (!seen.has(l.toLowerCase())) {
        seen.add(l.toLowerCase());
        labels.push(l);
      }
    }
    if (labels.length > 10) throw httpError(400, "10 étiquettes au maximum par tâche.");
    out.labels = labels;
  }
  if (has("isMilestone")) {
    out.is_milestone = Boolean(body.isMilestone);
  }
  if (has("parentId")) {
    // Le parent se choisit à la création et ne change plus (évite les cycles et les déplacements).
    if (partial) throw httpError(400, "Le parent d’une tâche ne peut pas être modifié.");
    if (body.parentId !== null) {
      if (!UUID_RE.test(String(body.parentId))) throw httpError(400, "Tâche parente invalide.");
      out.parent_id = body.parentId;
    }
  }
  return out;
}

/** Un assigné doit être membre actif de l'organisation (null = désaffecter). */
async function assertAssignee(req, assigneeId) {
  if (!assigneeId) return;
  const members = await listOrgMembers(req.auth, req.params.orgId);
  if (!members.some((m) => m.userId === assigneeId)) {
    throw httpError(400, "Ce membre n’appartient pas à l’organisation.");
  }
}

const router = Router({ mergeParams: true });
router.use("/:taskId/comments", comments);
router.use("/:taskId/attachments", attachments);
router.use("/:taskId/activities", activities);
router.use("/:taskId/timesheets", timesheets);
router.use("/:taskId/dependencies", dependencies);
router.use("/:taskId/status-history", statusHistory);

router.get("/", requirePermission("projects.read"), async (req, res) => {
  await assertProject(req.params);
  const rows = unwrap(
    await db.from("tasks").select(COLS).eq("project_id", req.params.projectId).order("created_at", { ascending: true }),
  );

  // Nombre de commentaires par tâche. Sans la migration des commentaires, on n'empêche pas
  // d'afficher les tâches : on le signale dans le terminal et les compteurs restent à 0.
  const counts = new Map();
  const fileCounts = new Map();
  if (rows.length > 0) {
    const ids = rows.map((r) => r.id);
    const { data, error } = await db.from("task_comments").select("task_id").in("task_id", ids);
    if (error) console.warn("[comments] compteurs indisponibles :", error.message);
    for (const c of data ?? []) counts.set(c.task_id, (counts.get(c.task_id) ?? 0) + 1);
    // Idem pour les pièces jointes : sans leur migration, les tâches s'affichent quand même.
    const files = await db.from("task_attachments").select("task_id").in("task_id", ids);
    if (files.error) console.warn("[attachments] compteurs indisponibles :", files.error.message);
    for (const c of files.data ?? []) fileCounts.set(c.task_id, (fileCounts.get(c.task_id) ?? 0) + 1);
  }
  res.json(rows.map((r) => ({ ...toApi(r), commentCount: counts.get(r.id) ?? 0, attachmentCount: fileCounts.get(r.id) ?? 0 })));
});

router.post("/", requirePermission("projects.update"), async (req, res) => {
  const f = parse(req.body, { partial: false });
  const project = await assertProject(req.params);
  await assertAssignee(req, f.assignee_id);
  if (f.parent_id) {
    const parent = unwrap(
      await db.from("tasks").select("id, parent_id").eq("id", f.parent_id).eq("project_id", req.params.projectId).maybeSingle(),
    );
    if (!parent) throw httpError(400, "Tâche parente introuvable dans ce projet.");
    if (parent.parent_id) throw httpError(400, "Une sous-tâche ne peut pas avoir de sous-tâche.");
  }
  const row = unwrap(
    await db
      .from("tasks")
      .insert({ ...f, project_id: req.params.projectId, created_by: req.auth.userId })
      .select(COLS)
      .single(),
  );
  await recordStatus({ taskId: row.id, status: row.status, actorId: req.auth.userId, at: row.created_at });
  await logActivity({
    orgId: req.params.orgId, actorId: req.auth.userId, action: "create", entityType: "task",
    entityId: row.id, projectId: row.project_id, label: row.title,
    details: {
      project: project.name,
      ...(row.assignee_id ? { assignee_id: row.assignee_id } : {}),
      ...(row.parent_id ? { subtask: true } : {}),
    },
  });
  res.status(201).json(toApi(row));
});

router.patch("/:id", requirePermission("projects.update"), async (req, res) => {
  const f = parse(req.body, { partial: true });
  if (Object.keys(f).length === 0) throw httpError(400, "Aucune modification.");
  if (!UUID_RE.test(req.params.id)) throw httpError(404, "Tâche introuvable.");
  const project = await assertProject(req.params);
  await assertAssignee(req, f.assignee_id);
  if (f.start_date !== undefined || f.due_date !== undefined) {
    // Une seule des deux dates change : on compare avec celle déjà enregistrée.
    const cur = unwrap(await db.from("tasks").select("start_date, due_date").eq("id", req.params.id).eq("project_id", req.params.projectId).maybeSingle());
    const start = f.start_date !== undefined ? f.start_date : cur?.start_date;
    const due = f.due_date !== undefined ? f.due_date : cur?.due_date;
    if (start && due && start > due) throw httpError(400, "La date de début doit précéder l'échéance.");
  }
  const previous = f.status
    ? unwrap(await db.from("tasks").select("status").eq("id", req.params.id).eq("project_id", req.params.projectId).maybeSingle())
    : null;
  const row = unwrap(
    await db
      .from("tasks")
      .update({ ...f, updated_at: new Date().toISOString() })
      .eq("id", req.params.id)
      .eq("project_id", req.params.projectId)
      .select(COLS)
      .maybeSingle(),
  );
  if (!row) throw httpError(404, "Tâche introuvable.");
  if (f.status && previous && previous.status !== row.status) {
    await recordStatus({ taskId: row.id, status: row.status, actorId: req.auth.userId });
  }
  await logActivity({
    orgId: req.params.orgId, actorId: req.auth.userId, action: "update", entityType: "task",
    entityId: row.id, projectId: row.project_id, label: row.title,
    details: { project: project.name, ...changedFields(f) },
  });
  res.json(toApi(row));
});

router.delete("/:id", requirePermission("projects.update"), async (req, res) => {
  if (!UUID_RE.test(req.params.id)) throw httpError(404, "Tâche introuvable.");
  const project = await assertProject(req.params);
  // Fichiers de la tâche et de ses sous-tâches : à lister avant la suppression (la cascade efface les lignes).
  const subs = unwrap(await db.from("tasks").select("id").eq("parent_id", req.params.id).eq("project_id", req.params.projectId));
  const paths = await pathsForTasks([req.params.id, ...subs.map((t) => t.id)]);
  const rows = unwrap(
    await db.from("tasks").delete().eq("id", req.params.id).eq("project_id", req.params.projectId).select("id, title"),
  );
  if (rows.length === 0) throw httpError(404, "Tâche introuvable.");
  await removeFiles(paths);
  await logActivity({
    orgId: req.params.orgId, actorId: req.auth.userId, action: "delete", entityType: "task",
    entityId: rows[0].id, projectId: req.params.projectId, label: rows[0].title, details: { project: project.name },
  });
  res.status(204).end();
});

export default router;
