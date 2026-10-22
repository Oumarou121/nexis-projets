import { Router } from "express";
import { db } from "../db.js";
import { UUID_RE, httpError, requirePermission } from "../auth.js";
import { assertProject, assertTask, selectAll, unwrap } from "../util.js";
import { assertCanEditTask, loadTask, requireRole } from "../access.js";

// Monté sous /api/organizations/:orgId/projects/:projectId/tasks/:taskId/dependencies.
// Droits : lecture = projects.read ; créer / supprimer = sur sa tâche (celle qui attend), ou gestionnaire.
const COLS = "id, task_id, depends_on_id, created_at";

const toApi = (r) => ({
  id: r.id,
  taskId: r.task_id,
  dependsOnId: r.depends_on_id,
  createdAt: r.created_at,
});

/**
 * « taskId attend dependsOnId » fermerait-il une boucle ? Oui si dependsOnId attend déjà, directement ou par
 * étapes, taskId (A attend B, B attend C, C attend A) : ces tâches se bloqueraient pour toujours.
 * Renvoie le chemin de la boucle (identifiants), ou null.
 */
async function cycleThrough(projectId, taskId, dependsOnId) {
  const ids = (await selectAll(() => db.from("tasks").select("id").eq("project_id", projectId).order("id", { ascending: true }))).map((t) => t.id);
  const edges = new Map(); // tâche -> tâches qu'elle attend
  for (let i = 0; i < ids.length; i += 200) {
    const rows = await selectAll(() => db.from("task_dependencies").select("id, task_id, depends_on_id").in("task_id", ids.slice(i, i + 200)).order("id", { ascending: true }));
    for (const r of rows) edges.set(r.task_id, [...(edges.get(r.task_id) ?? []), r.depends_on_id]);
  }
  const from = new Map([[dependsOnId, null]]);
  const queue = [dependsOnId];
  while (queue.length) {
    const cur = queue.shift();
    if (cur === taskId) {
      const path = [];
      for (let x = cur; x; x = from.get(x)) path.unshift(x);
      return path;
    }
    for (const next of edges.get(cur) ?? []) {
      if (from.has(next)) continue;
      from.set(next, cur);
      queue.push(next);
    }
  }
  return null;
}

const router = Router({ mergeParams: true });

router.get("/", requirePermission("projects.read"), async (req, res) => {
  await assertProject(req.params);
  await assertTask(req.params.taskId, req.params.projectId);
  const rows = unwrap(
    await db
      .from("task_dependencies")
      .select(COLS)
      .eq("task_id", req.params.taskId)
      .order("created_at", { ascending: false }),
  );
  res.json(rows.map(toApi));
});

router.post("/", requireRole("contributor"), async (req, res) => {
  const { dependsOnId } = req.body;
  if (!dependsOnId || !UUID_RE.test(dependsOnId)) throw httpError(400, "Tâche dépendante invalide.");
  if (dependsOnId === req.params.taskId) throw httpError(400, "Une tâche ne peut pas dépendre d'elle-même.");
  await assertProject(req.params);
  // Les deux tâches doivent être de ce projet (sinon une dépendance pourrait viser un autre projet).
  await assertCanEditTask(req, await loadTask(req, req.params.taskId));
  const blocker = await assertTask(dependsOnId, req.params.projectId);
  const loop = await cycleThrough(req.params.projectId, req.params.taskId, dependsOnId);
  if (loop) {
    throw httpError(400, loop.length <= 2
      ? `« ${blocker.title} » attend déjà cette tâche : elles se bloqueraient mutuellement.`
      : `« ${blocker.title} » attend déjà cette tâche par l’intermédiaire de ${loop.length - 2} autre${loop.length > 3 ? "s" : ""} : cela créerait une boucle de dépendances.`);
  }
  const { data: row, error } = await db
    .from("task_dependencies")
    .insert({ task_id: req.params.taskId, depends_on_id: dependsOnId })
    .select(COLS)
    .maybeSingle();
  if (error?.code === "23505") throw httpError(400, "Cette dépendance existe déjà.");
  unwrap({ data: row, error });
  res.status(201).json(toApi(row));
});

router.delete("/:id", requireRole("contributor"), async (req, res) => {
  if (!UUID_RE.test(req.params.id)) throw httpError(404, "Dépendance introuvable.");
  await assertProject(req.params);
  await assertCanEditTask(req, await loadTask(req, req.params.taskId));
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
