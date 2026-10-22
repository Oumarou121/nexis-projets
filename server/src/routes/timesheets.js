import { Router } from "express";
import { db } from "../db.js";
import { UUID_RE, httpError, requirePermission } from "../auth.js";
import { DATE_RE, assertProject, assertTask, unwrap } from "../util.js";
import { todayFor } from "../dates.js";
import { assertCanEditTask, isManager, loadTask, requireRole } from "../access.js";

// Monté sous /api/organizations/:orgId/projects/:projectId/tasks/:taskId/timesheets.
// Droits : lecture = projects.read. Saisir du temps : sur ses tâches (ou gestionnaire).
// Modifier / supprimer une ligne : son auteur, ou un gestionnaire.
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

function parse(body, { partial, today }) {
  const out = {};
  const has = (k) => body?.[k] !== undefined;

  if (has("date") || !partial) {
    if (!DATE_RE.test(body.date)) throw httpError(400, "Date invalide (AAAA-MM-JJ).");
    // Du temps passé : pas dans le futur (« aujourd’hui » = celui du navigateur, voir dates.js).
    if (today && body.date > today) throw httpError(400, "Le temps saisi ne peut pas être daté dans le futur.");
    out.date = body.date;
  }
  if (has("description") || !partial) {
    const d = body.description === null ? "" : String(body.description).trim();
    if (d.length > 500) throw httpError(400, "Description trop longue (500 caractères).");
    out.description = d || null;
  }
  if (has("duration") || !partial) {
    const dur = Number(body.duration);
    // Minutes entières : la colonne est un entier (1,5 minute provoquait une erreur 500).
    if (!Number.isInteger(dur) || dur <= 0 || dur > 1440) throw httpError(400, "Durée invalide (1 à 1440 minutes entières).");
    out.duration = dur;
  }
  return out;
}

/** Ligne de temps : modifiable par son auteur ou par un gestionnaire (404 si elle n'est pas sur cette tâche). */
async function assertEntryOwner(req) {
  const row = unwrap(await db.from("task_timesheets").select("user_id").eq("id", req.params.id).eq("task_id", req.params.taskId).maybeSingle());
  if (!row) throw httpError(404, "Feuille de temps introuvable.");
  if (row.user_id !== req.auth.userId && !(await isManager(req))) {
    throw httpError(403, "Vous ne pouvez modifier que le temps que vous avez saisi.");
  }
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

router.post("/", requireRole("contributor"), async (req, res) => {
  const f = parse(req.body, { partial: false, today: todayFor(req) });
  await assertProject(req.params);
  await assertCanEditTask(req, await loadTask(req, req.params.taskId));
  const row = unwrap(
    await db
      .from("task_timesheets")
      .insert({ ...f, task_id: req.params.taskId, user_id: req.auth.userId })
      .select(COLS)
      .single(),
  );
  res.status(201).json(toApi(row));
});

router.patch("/:id", requireRole("contributor"), async (req, res) => {
  const f = parse(req.body, { partial: true, today: todayFor(req) });
  if (Object.keys(f).length === 0) throw httpError(400, "Aucune modification.");
  if (!UUID_RE.test(req.params.id)) throw httpError(404, "Feuille de temps introuvable.");
  await assertProject(req.params);
  await assertTask(req.params.taskId, req.params.projectId);
  await assertEntryOwner(req);
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

router.delete("/:id", requireRole("contributor"), async (req, res) => {
  if (!UUID_RE.test(req.params.id)) throw httpError(404, "Feuille de temps introuvable.");
  await assertProject(req.params);
  await assertTask(req.params.taskId, req.params.projectId);
  await assertEntryOwner(req);
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
