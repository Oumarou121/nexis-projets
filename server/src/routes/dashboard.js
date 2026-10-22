import { Router } from "express";
import { db } from "../db.js";
import { requirePermission } from "../auth.js";
import { countsForProgress, isOpenProject, isWork, selectAll, unwrap } from "../util.js";
import { excludeHidden, getScope } from "../access.js";
import { todayFor } from "../dates.js";

// Monté sous /api/organizations/:orgId/dashboard : indicateurs de l'organisation.
// Règles de comptage : voir util.js (tâches principales hors jalons ; charge = tout ce qui est assigné ;
// pas de retard ni de charge dans un projet terminé ou en pause).
const router = Router({ mergeParams: true });

router.get("/", requirePermission("projects.read"), async (req, res) => {
  const orgId = req.params.orgId;
  const scope = await getScope(req); // les projets privés cachés à l'appelant ne comptent dans aucun chiffre
  const projects = unwrap(await excludeHidden(db.from("projects").select("id, status").eq("organization_id", orgId), "id", scope));
  const statusOf = new Map(projects.map((p) => [p.id, p.status]));
  const tasks = await selectAll(() =>
    excludeHidden(
      db
        .from("tasks")
        .select("id, project_id, parent_id, is_milestone, status, assignee_id, due_date, projects!inner(organization_id)")
        .eq("projects.organization_id", orgId),
      "project_id",
      scope,
    ).order("id", { ascending: true }),
  );

  const t0 = todayFor(req);
  const projectsByStatus = { planned: 0, active: 0, on_hold: 0, done: 0 };
  for (const p of projects) projectsByStatus[p.status] += 1;

  // Par catégorie d'étape (les étapes sont propres à chaque projet : seule la catégorie est comparable).
  const tasksByStatus = { todo: 0, in_progress: 0, done: 0 };
  const load = new Map(); // assignee_id -> { open, late }
  let total = 0;
  let late = 0;
  let unassigned = 0;
  for (const t of tasks) {
    if (!isWork(t)) continue;
    const main = countsForProgress(t);
    if (main) {
      total += 1;
      tasksByStatus[t.status] += 1;
    }
    if (t.status === "done" || !isOpenProject(statusOf.get(t.project_id))) continue;
    const isLate = !!t.due_date && t.due_date < t0;
    if (main && isLate) late += 1;
    if (!t.assignee_id) {
      if (main) unassigned += 1;
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
    tasksTotal: total,
    tasksByStatus,
    lateTasks: late,
    unassignedOpenTasks: unassigned,
    workload: [...load.values()].sort((a, b) => b.open - a.open),
  });
});

export default router;
