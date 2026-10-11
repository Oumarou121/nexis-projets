import { Router } from "express";
import { db } from "../db.js";
import { UUID_RE, httpError, requirePermission } from "../auth.js";
import { DATE_RE, assertProject, assertTask, unwrap } from "../util.js";

// Monté sous /api/organizations/:orgId/projects/:projectId/tasks/:taskId/timesheets.
// Droits : lecture = projects.read ; créer / modifier / supprimer = projects.update.
const COLS = "id, task_id, user_id, date, description, duration, created_at, updated_at";

const toApi = (r) => ({
  id: r.id,
  taskId: r.task_id,
  userId: r.user_id,
  date: r.date,
  description: r.description,
  duration: r.duration,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

function parse(body, { partial }) {
  const out = {};
  const has = (k) => body?.[k] !== undefined;

  if (has("date") || !partial) {
    if (!DATE_RE.test(body.date)) throw httpError(400, "Date invalide (AAAA-MM-JJ).");
    out.date = body.date;
  }
  if (has("description") || !partial) {
    const d = body.description === null ? "" : String(body.description).trim();
    if (d.length > 500) throw httpError(400, "Description trop longue (500 caractères).");
    out.description = d || null;
  }
  if (has("duration") || !partial) {
    const dur = Number(body.duration);
    if (isNaN(dur) || dur <= 0 || dur > 1440) throw httpError(400, "Durée invalide (1 à 1440 minutes).");
    out.duration = dur;
  }
  return out;
}

const router = Router({ mergeParams: true });

router.get("/", requirePermission("projects.read"), async (req, res) => {
  await assertProject(req.params);
  await assertTask(req.params.taskId, req.params.projectId);
  const rows = unwrap(
    await db
      .from("task_timesheets")
      .select(COLS)
      .eq("task_id", req.params.taskId)
      .order("date", { ascending: false }),
  );
  res.json(rows.map(toApi));
});

router.post("/", requirePermission("projects.update"), async (req, res) => {
  const f = parse(req.body, { partial: false });
  await assertProject(req.params);
  await assertTask(req.params.taskId, req.params.projectId);
  const row = unwrap(
    await db
      .from("task_timesheets")
      .insert({ ...f, task_id: req.params.taskId, user_id: req.auth.userId })
      .select(COLS)
      .single(),
  );
  res.status(201).json(toApi(row));
});

router.patch("/:id", requirePermission("projects.update"), async (req, res) => {
  const f = parse(req.body, { partial: true });
  if (Object.keys(f).length === 0) throw httpError(400, "Aucune modification.");
  if (!UUID_RE.test(req.params.id)) throw httpError(404, "Feuille de temps introuvable.");
  await assertProject(req.params);
  await assertTask(req.params.taskId, req.params.projectId);
  const row = unwrap(
    await db
      .from("task_timesheets")
      .update({ ...f, updated_at: new Date().toISOString() })
      .eq("id", req.params.id)
      .eq("task_id", req.params.taskId)
      .select(COLS)
      .maybeSingle(),
  );
  if (!row) throw httpError(404, "Feuille de temps introuvable.");
  res.json(toApi(row));
});

router.delete("/:id", requirePermission("projects.update"), async (req, res) => {
  if (!UUID_RE.test(req.params.id)) throw httpError(404, "Feuille de temps introuvable.");
  await assertProject(req.params);
  await assertTask(req.params.taskId, req.params.projectId);
  const rows = unwrap(
    await db
      .from("task_timesheets")
      .delete()
      .eq("id", req.params.id)
      .eq("task_id", req.params.taskId)
      .select("id"),
  );
  if (rows.length === 0) throw httpError(404, "Feuille de temps introuvable.");
  res.status(204).end();
});

export default router;
