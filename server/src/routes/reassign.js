import { Router } from "express";
import { db } from "../db.js";
import { UUID_RE, httpError, listOrgMembers, requirePermission } from "../auth.js";
import { assertProject, clip, unwrap } from "../util.js";
import { changedFields, logActivity } from "../activity.js";
import { notify } from "../notifications.js";
import { assertAssignee, assertManager, orgRoleBaseOf, requireRole } from "../access.js";

// Monté sous /api/organizations/:orgId/projects/:projectId/tasks/:taskId/reassign-requests.
// Demande de réassignation : l'assigné d'une tâche demande qu'on la confie à quelqu'un d'autre, avec une raison
// et, s'il le souhaite, une personne suggérée. Répartir le travail reste l'affaire des responsables du projet :
//   - demander / annuler sa demande : l'assigné actuel (une seule demande en attente par tâche) ;
//   - accepter (en choisissant le nouvel assigné, la suggestion par défaut, ou personne) / refuser : responsable.
// Les responsables nommés du projet sont prévenus ; s'il n'y en a aucun, les administrateurs de l'organisation.
// La tâche réassignée autrement (modification directe) clôt la demande en attente (closePendingRequest).
const COLS = "id, task_id, project_id, requested_by, suggested_user_id, reason, status, decided_by, decided_at, decision_note, new_assignee_id, created_at";

const toApi = (r) => ({
  id: r.id,
  taskId: r.task_id,
  requestedBy: r.requested_by,
  suggestedUserId: r.suggested_user_id ?? null,
  reason: r.reason,
  status: r.status,
  decidedBy: r.decided_by ?? null,
  decidedAt: r.decided_at ?? null,
  decisionNote: r.decision_note ?? null,
  newAssigneeId: r.new_assignee_id ?? null,
  createdAt: r.created_at,
});

const text = (v, { min = 0, max = 500, what }) => {
  const s = String(v ?? "").trim().replace(/[ \t]+/g, " ");
  if (s.length < min || s.length > max) throw httpError(400, min ? `${what} : ${min} à ${max} caractères.` : `${what} : ${max} caractères au maximum.`);
  return s || null;
};

async function loadTask(req) {
  if (!UUID_RE.test(req.params.taskId)) throw httpError(404, "Tâche introuvable.");
  const task = unwrap(
    await db.from("tasks").select("id, project_id, title, assignee_id").eq("id", req.params.taskId).eq("project_id", req.params.projectId).maybeSingle(),
  );
  if (!task) throw httpError(404, "Tâche introuvable.");
  return task;
}

async function loadPending(req, id) {
  if (!UUID_RE.test(id)) throw httpError(404, "Demande introuvable.");
  const row = unwrap(await db.from("task_reassign_requests").select(COLS).eq("id", id).eq("task_id", req.params.taskId).maybeSingle());
  if (!row) throw httpError(404, "Demande introuvable.");
  if (row.status !== "pending") throw httpError(409, "Cette demande a déjà reçu une réponse.");
  return row;
}

/** Qui décide : les responsables nommés du projet, à défaut les administrateurs de l'organisation. */
async function deciders(req) {
  const named = unwrap(await db.from("project_members").select("user_id, role").eq("project_id", req.params.projectId).eq("role", "manager"));
  if (named.length > 0) return named.map((m) => m.user_id);
  try {
    return (await listOrgMembers(req.auth, req.params.orgId)).filter((m) => orgRoleBaseOf(m.role) === "manager").map((m) => m.userId);
  } catch {
    return []; // annuaire inaccessible avec ce rôle : la demande reste visible sur la tâche
  }
}

const close = (id, req, patch) =>
  db.from("task_reassign_requests").update({ decided_by: req.auth.userId, decided_at: new Date().toISOString(), ...patch }).eq("id", id).eq("status", "pending").select(COLS).maybeSingle();

/** Tâche réassignée en dehors de la demande : la demande en attente est close (acceptée de fait). */
export async function closePendingRequest(req, task) {
  const { error } = await db
    .from("task_reassign_requests")
    .update({ status: "accepted", decided_by: req.auth.userId, decided_at: new Date().toISOString(), new_assignee_id: task.assignee_id ?? null })
    .eq("task_id", task.id)
    .eq("status", "pending");
  if (error && error.code !== "42P01") console.error("[réassignation] clôture impossible :", error.message);
}

const router = Router({ mergeParams: true });

// La demande en attente (s'il y en a une) et les 5 dernières réponses.
router.get("/", requirePermission("projects.read"), async (req, res) => {
  await assertProject(req.params);
  await loadTask(req);
  const rows = unwrap(await db.from("task_reassign_requests").select(COLS).eq("task_id", req.params.taskId).order("created_at", { ascending: false }).limit(6));
  const pending = rows.find((r) => r.status === "pending");
  res.json({ pending: pending ? toApi(pending) : null, history: rows.filter((r) => r !== pending).slice(0, 5).map(toApi) });
});

router.post("/", requireRole("viewer"), async (req, res) => {
  const project = await assertProject(req.params);
  const task = await loadTask(req);
  if (task.assignee_id !== req.auth.userId) throw httpError(403, "Seule la personne à qui la tâche est assignée peut demander sa réassignation.");
  const reason = text(req.body?.reason, { min: 3, what: "La raison" });
  const suggested = req.body?.suggestedUserId ?? null;
  if (suggested !== null) {
    if (!UUID_RE.test(String(suggested)) || suggested === req.auth.userId) throw httpError(400, "Personne suggérée invalide.");
    // La suggestion doit pouvoir recevoir la tâche ; sans accès à l'annuaire, le responsable vérifiera en acceptant.
    try {
      await assertAssignee(req, suggested);
    } catch (e) {
      if (e.status === 400) throw e;
    }
  }
  const { data: row, error } = await db
    .from("task_reassign_requests")
    .insert({ task_id: task.id, project_id: task.project_id, requested_by: req.auth.userId, suggested_user_id: suggested, reason })
    .select(COLS)
    .maybeSingle();
  if (error?.code === "23505") throw httpError(409, "Une demande est déjà en attente pour cette tâche.");
  unwrap({ data: row, error });
  const title = `Demande de réassignation de la tâche « ${clip(task.title, 70)} » (projet « ${clip(project.name, 50)} ») : ${clip(reason, 60)}`;
  for (const userId of await deciders(req)) {
    await notify({ orgId: req.params.orgId, userId, actorId: req.auth.userId, type: "task_reassign_requested", projectId: task.project_id, taskId: task.id, title, auth: req.auth });
  }
  res.status(201).json(toApi(row));
});

// Accepter : body.assigneeId = nouvel assigné (absent = la personne suggérée ; null = personne, tâche à réattribuer).
router.post("/:id/accept", requireRole("contributor"), async (req, res) => {
  await assertManager(req, "Seul un responsable du projet peut répondre à une demande de réassignation.");
  const project = await assertProject(req.params);
  const task = await loadTask(req);
  const request = await loadPending(req, req.params.id);
  const to = req.body?.assigneeId === undefined ? request.suggested_user_id : req.body.assigneeId;
  if (to !== null && (!UUID_RE.test(String(to)) || to === request.requested_by)) throw httpError(400, "Choisissez une autre personne que celle qui demande la réassignation.");
  await assertAssignee(req, to);
  const note = text(req.body?.note, { what: "Le message" });
  const updated = unwrap(
    await db.from("tasks").update({ assignee_id: to, updated_at: new Date().toISOString() }).eq("id", task.id).eq("project_id", req.params.projectId).select("id, title, assignee_id, project_id").maybeSingle(),
  );
  if (!updated) throw httpError(404, "Tâche introuvable.");
  const row = unwrap(await close(request.id, req, { status: "accepted", new_assignee_id: to, decision_note: note }));
  await logActivity({
    orgId: req.params.orgId, actorId: req.auth.userId, action: "update", entityType: "task",
    entityId: task.id, projectId: task.project_id, label: task.title, details: { project: project.name, ...changedFields({ assignee_id: to }) },
  });
  const where = `« ${clip(task.title, 70)} » (projet « ${clip(project.name, 50)} »)`;
  await notify({ orgId: req.params.orgId, userId: request.requested_by, actorId: req.auth.userId, type: "task_reassign_answered", projectId: task.project_id, taskId: task.id, title: `Demande acceptée : la tâche ${where} ne vous est plus assignée`, auth: req.auth });
  if (to) await notify({ orgId: req.params.orgId, userId: to, actorId: req.auth.userId, type: "task_assigned", projectId: task.project_id, taskId: task.id, title: `La tâche ${where} vous a été assignée`, auth: req.auth });
  res.json({ request: toApi(row ?? { ...request, status: "accepted" }), assigneeId: to });
});

router.post("/:id/decline", requireRole("contributor"), async (req, res) => {
  await assertManager(req, "Seul un responsable du projet peut répondre à une demande de réassignation.");
  const project = await assertProject(req.params);
  const task = await loadTask(req);
  const request = await loadPending(req, req.params.id);
  const note = text(req.body?.note, { what: "Le message" });
  const row = unwrap(await close(request.id, req, { status: "declined", decision_note: note }));
  await notify({
    orgId: req.params.orgId, userId: request.requested_by, actorId: req.auth.userId, type: "task_reassign_answered", projectId: task.project_id, taskId: task.id,
    title: `Demande refusée : la tâche « ${clip(task.title, 70)} » (projet « ${clip(project.name, 50)} ») vous reste assignée${note ? ` — ${clip(note, 60)}` : ""}`, auth: req.auth,
  });
  res.json({ request: toApi(row ?? { ...request, status: "declined" }) });
});

// Annuler sa propre demande.
router.delete("/:id", requireRole("viewer"), async (req, res) => {
  await assertProject(req.params);
  const request = await loadPending(req, req.params.id);
  if (request.requested_by !== req.auth.userId) throw httpError(403, "Seule la personne qui a fait la demande peut l’annuler.");
  unwrap(await close(request.id, req, { status: "cancelled" }));
  res.status(204).end();
});

export default router;
