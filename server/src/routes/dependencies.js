import { Router } from "express";
import { db } from "../db.js";
import { UUID_RE, httpError, requirePermission } from "../auth.js";
import { assertProject, assertTask, unwrap } from "../util.js";

// Monté sous /api/organizations/:orgId/projects/:projectId/tasks/:taskId/dependencies.
// Droits : lecture = projects.read ; créer / supprimer = projects.update.
const COLS = "id, task_id, depends_on_id, created_at";

const toApi = (r) => ({
  id: r.id,
  taskId: r.task_id,
  dependsOnId: r.depends_on_id,
  createdAt: r.created_at,
});

const router = Router({ mergeParams: true });

router.get("/", requirePermission("projects.read"), async (req, res) => {
  await assertProject(req.params);
  const rows = unwrap(
    await db
      .from("task_dependencies")
      .select(COLS)
      .eq("task_id", req.params.taskId)
      .order("created_at", { ascending: false }),
  );
  res.json(rows.map(toApi));
});

router.post("/", requirePermission("projects.update"), async (req, res) => {
  const { dependsOnId } = req.body;
  if (!dependsOnId || !UUID_RE.test(dependsOnId)) throw httpError(400, "Tâche dépendante invalide.");
  if (dependsOnId === req.params.taskId) throw httpError(400, "Une tâche ne peut pas dépendre d'elle-même.");
  await assertProject(req.params);
  // Les deux tâches doivent être de ce projet (sinon une dépendance pourrait viser un autre projet).
  await assertTask(req.params.taskId, req.params.projectId);
  await assertTask(dependsOnId, req.params.projectId);
  const row = unwrap(
    await db
      .from("task_dependencies")
      .insert({ task_id: req.params.taskId, depends_on_id: dependsOnId })
      .select(COLS)
      .maybeSingle(),
  );
  if (!row) throw httpError(400, "Cette dépendance existe déjà.");
  res.status(201).json(toApi(row));
});

router.delete("/:id", requirePermission("projects.update"), async (req, res) => {
  if (!UUID_RE.test(req.params.id)) throw httpError(404, "Dépendance introuvable.");
  await assertProject(req.params);
  const rows = unwrap(
    await db
      .from("task_dependencies")
      .delete()
      .eq("id", req.params.id)
      .eq("task_id", req.params.taskId)
      .select("id"),
  );
  if (rows.length === 0) throw httpError(404, "Dépendance introuvable.");
  res.status(204).end();
});

export default router;
