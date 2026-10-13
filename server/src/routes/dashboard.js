import { Router } from "express";
import { db } from "../db.js";
import { requirePermission } from "../auth.js";
import { unwrap } from "../util.js";
import { excludeHidden, getScope } from "../access.js";

// Monté sous /api/organizations/:orgId/dashboard : indicateurs de l'organisation.
const router = Router({ mergeParams: true });

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

router.get("/", requirePermission("projects.read"), async (req, res) => {
  const orgId = req.params.orgId;
  const scope = await getScope(req); // les projets privés cachés à l'appelant ne comptent dans aucun chiffre
  const projects = unwrap(await excludeHidden(db.from("projects").select("id, status").eq("organization_id", orgId), "id", scope));
  const tasks = unwrap(
    await excludeHidden(
      db
        .from("tasks")
        .select("status, assignee_id, due_date, projects!inner(organization_id)")
        .eq("projects.organization_id", orgId),
      "project_id",
      scope,
    ),
  );

  const t0 = today();
  const projectsByStatus = { planned: 0, active: 0, on_hold: 0, done: 0 };
  for (const p of projects) projectsByStatus[p.status] += 1;

  // Par catégorie d'étape (les étapes sont propres à chaque projet : seule la catégorie est comparable).
  const tasksByStatus = { todo: 0, in_progress: 0, done: 0 };
  const load = new Map(); // assignee_id -> { open, late }
  let late = 0;
  let unassigned = 0;
  for (const t of tasks) {
    tasksByStatus[t.status] += 1;
    if (t.status === "done") continue;
    const isLate = !!t.due_date && t.due_date < t0;
    if (isLate) late += 1;
    if (!t.assignee_id) {
      unassigned += 1;
      continue;
    }
    const w = load.get(t.assignee_id) ?? { userId: t.assignee_id, open: 0, late: 0 };
    w.open += 1;
    if (isLate) w.late += 1;
    load.set(t.assignee_id, w);
  }

  res.json({
    projectsTotal: projects.length,
    projectsByStatus,
    tasksTotal: tasks.length,
    tasksByStatus,
    lateTasks: late,
    unassignedOpenTasks: unassigned,
    workload: [...load.values()].sort((a, b) => b.open - a.open),
  });
});

export default router;
