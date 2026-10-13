import { Router } from "express";
import { db } from "../db.js";
import { requirePermission } from "../auth.js";
import { assertProject, assertTask, unwrap } from "../util.js";

// Monté sous /api/organizations/:orgId/projects/:projectId/tasks/:taskId/status-history.
// Lecture seule (projects.read) : les lignes sont écrites par les routes de tâches.
const router = Router({ mergeParams: true });

router.get("/", requirePermission("projects.read"), async (req, res) => {
  await assertProject(req.params);
  await assertTask(req.params.taskId, req.params.projectId);
  const rows = unwrap(
    await db
      .from("task_status_history")
      .select("status, stage_id, entered_at")
      .eq("task_id", req.params.taskId)
      .order("entered_at", { ascending: true }),
  );
  res.json(rows.map((r) => ({ status: r.status, stageId: r.stage_id ?? null, enteredAt: r.entered_at })));
});

export default router;
