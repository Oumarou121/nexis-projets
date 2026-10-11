import { Router } from "express";
import { db } from "../db.js";
import { UUID_RE, httpError, requirePermission } from "../auth.js";
import { DATE_RE, assertProject, assertTask, unwrap } from "../util.js";

// Monté sous /api/organizations/:orgId/projects/:projectId/tasks/:taskId/activities.
// Droits : lecture = projects.read ; créer / modifier / supprimer = projects.update.
const TYPES = ["todo", "call", "email", "meeting", "note"];
const COLS = "id, task_id, type, summary, due_date, assignee_id, done, created_by, created_at, updated_at";

const toApi = (r) => ({
  id: r.id,
  taskId: r.task_id,
  type: r.type,
  summary: r.summary,
  dueDate: r.due_date,
  assigneeId: r.assignee_id,
  done: r.done,
  createdBy: r.created_by,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

function parse(body, { partial }) {
  const out = {};
  const has = (k) => body?.[k] !== undefined;

  if (has("type") || !partial) {
    if (!TYPES.includes(body.type)) throw httpError(400, "Type d'activité invalide.");
    out.type = body.type;
  }
  if (has("summary") || !partial) {
    const summary = String(body.summary ?? "").trim().replace(/\s+/g, " ");
    if (summary.length < 2 || summary.length > 200) throw httpError(400, "Le résumé doit faire 2 à 200 caractères.");
    out.summary = summary;
  }
  if (has("dueDate")) {
    if (body.dueDate !== null && !DATE_RE.test(body.dueDate)) throw httpError(400, "Échéance invalide (AAAA-MM-JJ).");
    out.due_date = body.dueDate;
  }
  if (has("assigneeId")) {
    if (body.assigneeId !== null && !UUID_RE.test(String(body.assigneeId))) throw httpError(400, "Membre invalide.");
    out.assignee_id = body.assigneeId;
  }
  if (has("done")) {
    out.done = Boolean(body.done);
  }
  return out;
}

const router = Router({ mergeParams: true });

router.get("/", requirePermission("projects.read"), async (req, res) => {
  await assertProject(req.params);
  await assertTask(req.params.taskId, req.params.projectId);
  const rows = unwrap(
    await db
      .from("task_activities")
      .select(COLS)
      .eq("task_id", req.params.taskId)
      .order("created_at", { ascending: false }),
  );
  res.json(rows.map(toApi));
});

router.post("/", requirePermission("projects.update"), async (req, res) => {
  const f = parse(req.body, { partial: false });
  await assertProject(req.params);
  await assertTask(req.params.taskId, req.params.projectId);
  const row = unwrap(
    await db
      .from("task_activities")
      .insert({ ...f, task_id: req.params.taskId, created_by: req.auth.userId })
      .select(COLS)
      .single(),
  );
  res.status(201).json(toApi(row));
});

router.patch("/:id", requirePermission("projects.update"), async (req, res) => {
  const f = parse(req.body, { partial: true });
  if (Object.keys(f).length === 0) throw httpError(400, "Aucune modification.");
  if (!UUID_RE.test(req.params.id)) throw httpError(404, "Activité introuvable.");
  await assertProject(req.params);
  await assertTask(req.params.taskId, req.params.projectId);
  const row = unwrap(
    await db
      .from("task_activities")
      .update({ ...f, updated_at: new Date().toISOString() })
      .eq("id", req.params.id)
      .eq("task_id", req.params.taskId)
      .select(COLS)
      .maybeSingle(),
  );
  if (!row) throw httpError(404, "Activité introuvable.");
  res.json(toApi(row));
});

router.delete("/:id", requirePermission("projects.update"), async (req, res) => {
  if (!UUID_RE.test(req.params.id)) throw httpError(404, "Activité introuvable.");
  await assertProject(req.params);
  await assertTask(req.params.taskId, req.params.projectId);
  const rows = unwrap(
    await db
      .from("task_activities")
      .delete()
      .eq("id", req.params.id)
      .eq("task_id", req.params.taskId)
      .select("id"),
  );
  if (rows.length === 0) throw httpError(404, "Activité introuvable.");
  res.status(204).end();
});

export default router;
