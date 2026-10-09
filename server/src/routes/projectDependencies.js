import { Router } from "express";
import { db } from "../db.js";
import { requirePermission } from "../auth.js";
import { assertProject, unwrap } from "../util.js";

// Monté sous /api/organizations/:orgId/projects/:projectId/dependencies.
// Toutes les dépendances du projet en une requête (flèches du Gantt). Lecture seule.
// Une dépendance appartient au projet si la tâche qui dépend (task_id) en fait partie ;
// les deux tâches sont dans le même projet, ce que la route de création ne vérifie pas :
// on exige donc aussi que la tâche bloquante soit du projet.
const router = Router({ mergeParams: true });

router.get("/", requirePermission("projects.read"), async (req, res) => {
  await assertProject(req.params);
  const tasks = unwrap(await db.from("tasks").select("id").eq("project_id", req.params.projectId));
  const ids = tasks.map((t) => t.id);
  if (ids.length === 0) return res.json([]);
  const inProject = new Set(ids);
  const rows = unwrap(
    await db.from("task_dependencies").select("id, task_id, depends_on_id").in("task_id", ids),
  );
  res.json(
    rows
      .filter((r) => inProject.has(r.depends_on_id))
      .map((r) => ({ id: r.id, taskId: r.task_id, dependsOnId: r.depends_on_id })),
  );
});

export default router;
