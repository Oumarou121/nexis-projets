import { notify } from "../notifications.js";
import { Router } from "express";
import { db } from "../db.js";
import { UUID_RE, httpError, requirePermission } from "../auth.js";
import { DATE_RE, PRIORITIES, assertProject, clip, selectAll, selectIn, unwrap } from "../util.js";
import comments from "./comments.js";
import attachments from "./attachments.js";
import activities from "./activities.js";
import timesheets from "./timesheets.js";
import dependencies from "./dependencies.js";
import statusHistory from "./statusHistory.js";
import { pathsForTasks, removeFiles } from "../storage.js";
import { changedFields, logActivity } from "../activity.js";
import { recordStatus } from "../history.js";
import { projectStages, resolveStage, stageInput } from "../stages.js";
import { assertAssignee, assertCanEditTask, isManager, ownsTask, requireRole } from "../access.js";
import reassign, { closePendingRequest } from "./reassign.js";

// Monté sous /api/organizations/:orgId/projects/:projectId/tasks.
// Droits : lecture = projects.read ; créer = projects.update.
// Modifier : gestionnaire (projects.manage), ou contributeur sur SES tâches (voir access.js).
// Assigner : un contributeur ne s'assigne qu'à lui-même (et peut prendre une tâche libre) ; répartir le
// travail entre les personnes est réservé aux gestionnaires. Supprimer : gestionnaire ou créateur.
// Affecter quelqu'un d'autre exige en plus de pouvoir lister les membres dans NEXIS Identity.
const COLS = "id, project_id, title, description, status, stage_id, priority, assignee_id, start_date, due_date, labels, parent_id, is_milestone, created_by, created_at, updated_at";

// `stages` : Map id → étape du projet (nom affiché). status = catégorie de l'étape (todo / in_progress / done).
const toApi = (r, stages) => ({
  id: r.id,
  projectId: r.project_id,
  title: r.title,
  description: r.description,
  status: r.status,
  stageId: r.stage_id ?? null,
  stage: stages?.get(r.stage_id)?.name ?? null,
  stageColor: stages?.get(r.stage_id)?.color ?? null,
  priority: r.priority,
  assigneeId: r.assignee_id,
  startDate: r.start_date ?? null,
  dueDate: r.due_date,
  labels: r.labels ?? [],
  parentId: r.parent_id ?? null,
  isMilestone: r.is_milestone ?? false,
  createdBy: r.created_by,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

function parse(body, { partial }) {
  const out = {};
  const has = (k) => body?.[k] !== undefined;

  if (has("title") || !partial) {
    const title = String(body?.title ?? "").trim().replace(/\s+/g, " ");
    if (title.length < 2 || title.length > 200) throw httpError(400, "Le titre doit faire 2 à 200 caractères.");
    out.title = title;
  }
  if (has("description")) {
    const d = body.description === null ? "" : String(body.description).trim();
    if (d.length > 4000) throw httpError(400, "Description trop longue (4000 caractères).");
    out.description = d || null;
  }
  if (has("priority")) {
    if (!PRIORITIES.includes(body.priority)) throw httpError(400, "Priorité invalide.");
    out.priority = body.priority;
  }
  if (has("assigneeId")) {
    if (body.assigneeId !== null && !UUID_RE.test(String(body.assigneeId))) throw httpError(400, "Membre invalide.");
    out.assignee_id = body.assigneeId;
  }
  if (has("dueDate")) {
    if (body.dueDate !== null && !DATE_RE.test(body.dueDate)) throw httpError(400, "Échéance invalide (AAAA-MM-JJ).");
    out.due_date = body.dueDate;
  }
  if (has("startDate")) {
    if (body.startDate !== null && !DATE_RE.test(body.startDate)) throw httpError(400, "Date de début invalide (AAAA-MM-JJ).");
    out.start_date = body.startDate;
  }
  if (out.start_date && out.due_date && out.start_date > out.due_date) throw httpError(400, "La date de début doit précéder l'échéance.");
  if (has("labels")) {
    if (!Array.isArray(body.labels)) throw httpError(400, "Étiquettes invalides.");
    const seen = new Set();
    const labels = [];
    for (const raw of body.labels) {
      const l = String(raw ?? "").trim().replace(/\s+/g, " ");
      if (l.length < 1 || l.length > 30) throw httpError(400, "Une étiquette doit faire 1 à 30 caractères.");
      if (!seen.has(l.toLowerCase())) {
        seen.add(l.toLowerCase());
        labels.push(l);
      }
    }
    if (labels.length > 10) throw httpError(400, "10 étiquettes au maximum par tâche.");
    out.labels = labels;
  }
  if (has("isMilestone")) {
    out.is_milestone = Boolean(body.isMilestone);
  }
  if (has("parentId")) {
    // Le parent se choisit à la création et ne change plus (évite les cycles et les déplacements).
    if (partial) throw httpError(400, "Le parent d’une tâche ne peut pas être modifié.");
    if (body.parentId !== null) {
      if (!UUID_RE.test(String(body.parentId))) throw httpError(400, "Tâche parente invalide.");
      out.parent_id = body.parentId;
    }
  }
  return out;
}

/** Prévient la personne à qui la tâche vient d'être assignée (jamais celle qui l'assigne). */
const notifyAssigned = (req, row) =>
  notify({
    orgId: req.params.orgId, userId: row.assignee_id, actorId: req.auth.userId, type: "task_assigned",
    projectId: row.project_id, taskId: row.id, title: `La tâche « ${clip(row.title, 70)} » vous a été assignée dans le projet « ${clip(req.project?.name, 50)} »`, auth: req.auth,
  });

const router = Router({ mergeParams: true });
router.use("/:taskId/comments", comments);
router.use("/:taskId/attachments", attachments);
router.use("/:taskId/activities", activities);
router.use("/:taskId/timesheets", timesheets);
router.use("/:taskId/dependencies", dependencies);
router.use("/:taskId/status-history", statusHistory);
router.use("/:taskId/reassign-requests", reassign);

router.get("/", requirePermission("projects.read"), async (req, res) => {
  await assertProject(req.params);
  const rows = await selectAll(() =>
    db.from("tasks").select(COLS).eq("project_id", req.params.projectId).order("created_at", { ascending: true }).order("id", { ascending: true }),
  );
  const stages = new Map((await projectStages(req.params.projectId, req.params.orgId)).map((st) => [st.id, st]));

  // Nombre de commentaires par tâche. Sans la migration des commentaires, on n'empêche pas
  // d'afficher les tâches : on le signale dans le terminal et les compteurs restent à 0.
  const counts = new Map();
  const fileCounts = new Map();
  const asked = new Map(); // tâche -> demande de réassignation en attente
  const tally = async (table, into, label) => {
    try {
      const found = await selectIn((ids) => db.from(table).select("id, task_id").in("task_id", ids).order("id", { ascending: true }), rows.map((r) => r.id));
      for (const c of found) into.set(c.task_id, (into.get(c.task_id) ?? 0) + 1);
    } catch (e) {
      console.warn(`[${label}] compteurs indisponibles :`, e.message);
    }
  };
  if (rows.length > 0) {
    await tally("task_comments", counts, "comments");
    // Idem pour les pièces jointes : sans leur migration, les tâches s'affichent quand même.
    await tally("task_attachments", fileCounts, "attachments");
    // Sans la migration des demandes, la requête échoue sans bruit : aucune demande affichée.
    const { data: pending } = await db.from("task_reassign_requests").select("task_id, requested_by").eq("project_id", req.params.projectId).eq("status", "pending");
    for (const p of pending ?? []) asked.set(p.task_id, p.requested_by);
  }
  res.json(rows.map((r) => ({
    ...toApi(r, stages),
    commentCount: counts.get(r.id) ?? 0,
    attachmentCount: fileCounts.get(r.id) ?? 0,
    reassignRequestedBy: asked.get(r.id) ?? null,
  })));
});

router.post("/", requireRole("contributor"), async (req, res) => {
  const f = parse(req.body, { partial: false });
  const project = await assertProject(req.params);
  const manager = await isManager(req);
  if (!manager && f.assignee_id && f.assignee_id !== req.auth.userId) {
    throw httpError(403, "Vous ne pouvez assigner une tâche qu’à vous-même : un gestionnaire répartit le travail.");
  }
  await assertAssignee(req, f.assignee_id);
  // Étape de départ : celle demandée (stageId, ou 1re étape d'une catégorie), sinon la 1re étape « À faire »
  // (jamais une étape terminée, même si l'ordre des étapes a été changé).
  const stageList = await projectStages(req.params.projectId, req.params.orgId);
  const stageIn = stageInput(req.body);
  const stage = stageIn.stageId || stageIn.status ? resolveStage(stageList, stageIn) : resolveStage(stageList, { status: "todo" });
  const stages = new Map(stageList.map((st) => [st.id, st]));
  if (f.parent_id) {
    const parent = unwrap(
      await db.from("tasks").select("id, parent_id, created_by, assignee_id").eq("id", f.parent_id).eq("project_id", req.params.projectId).maybeSingle(),
    );
    if (!parent) throw httpError(400, "Tâche parente introuvable dans ce projet.");
    if (parent.parent_id) throw httpError(400, "Une sous-tâche ne peut pas avoir de sous-tâche.");
    // Ajouter une sous-tâche, c'est modifier la tâche parente : mêmes droits que pour la modifier.
    if (!manager && !(await ownsTask(req, parent))) {
      throw httpError(403, "Vous ne pouvez ajouter des sous-tâches qu’à vos tâches.");
    }
  }
  const row = unwrap(
    await db
      .from("tasks")
      .insert({ ...f, stage_id: stage.id, status: stage.category, project_id: req.params.projectId, created_by: req.auth.userId })
      .select(COLS)
      .single(),
  );
  await recordStatus({ taskId: row.id, stageId: row.stage_id, status: row.status, actorId: req.auth.userId, at: row.created_at });
  await logActivity({
    orgId: req.params.orgId, actorId: req.auth.userId, action: "create", entityType: "task",
    entityId: row.id, projectId: row.project_id, label: row.title,
    details: {
      project: project.name,
      ...(row.assignee_id ? { assignee_id: row.assignee_id } : {}),
      ...(row.parent_id ? { subtask: true } : {}),
    },
  });
  if (row.assignee_id) await notifyAssigned(req, row);
  res.status(201).json(toApi(row, stages));
});

router.patch("/:id", requireRole("contributor"), async (req, res) => {
  const f = parse(req.body, { partial: true });
  const stageIn = stageInput(req.body);
  const wantsStage = !!(stageIn.stageId || stageIn.status);
  if (Object.keys(f).length === 0 && !wantsStage) throw httpError(400, "Aucune modification.");
  if (!UUID_RE.test(req.params.id)) throw httpError(404, "Tâche introuvable.");
  const project = await assertProject(req.params);
  // État actuel : droits, dates et historique se décident par rapport à lui.
  const previous = unwrap(
    await db.from("tasks").select("id, created_by, assignee_id, parent_id, stage_id, start_date, due_date").eq("id", req.params.id).eq("project_id", req.params.projectId).maybeSingle(),
  );
  if (!previous) throw httpError(404, "Tâche introuvable.");
  const me = req.auth.userId;
  if (!(await isManager(req))) {
    const onlyAssignee = !wantsStage && Object.keys(f).length === 1 && f.assignee_id !== undefined;
    // Prendre une tâche libre : seul cas où un contributeur touche une tâche qui n'est pas la sienne.
    const takesFreeTask = onlyAssignee && f.assignee_id === me && !previous.assignee_id;
    if (!takesFreeTask) await assertCanEditTask(req, previous);
    // Réassigner : seulement entre « personne » et soi-même ; répartir le travail revient aux gestionnaires.
    if (f.assignee_id !== undefined && f.assignee_id !== previous.assignee_id) {
      const mineOrFree = (id) => !id || id === me;
      if (!mineOrFree(f.assignee_id) || !mineOrFree(previous.assignee_id)) {
        throw httpError(403, "Seul un gestionnaire peut confier une tâche à quelqu’un d’autre.");
      }
    }
  }
  const stageList = await projectStages(req.params.projectId, req.params.orgId);
  const stages = new Map(stageList.map((st) => [st.id, st]));
  const stage = wantsStage ? resolveStage(stageList, stageIn) : null; // « status » seul = 1re étape de cette catégorie
  if (stage) Object.assign(f, { stage_id: stage.id, status: stage.category });
  await assertAssignee(req, f.assignee_id);
  if (f.start_date !== undefined || f.due_date !== undefined) {
    // Une seule des deux dates change : on compare avec celle déjà enregistrée.
    const start = f.start_date !== undefined ? f.start_date : previous.start_date;
    const due = f.due_date !== undefined ? f.due_date : previous.due_date;
    if (start && due && start > due) throw httpError(400, "La date de début doit précéder l'échéance.");
  }
  const row = unwrap(
    await db
      .from("tasks")
      .update({ ...f, updated_at: new Date().toISOString() })
      .eq("id", req.params.id)
      .eq("project_id", req.params.projectId)
      .select(COLS)
      .maybeSingle(),
  );
  if (!row) throw httpError(404, "Tâche introuvable.");
  if (f.assignee_id !== undefined && previous.assignee_id !== row.assignee_id) {
    if (row.assignee_id) await notifyAssigned(req, row);
    // Réassignée directement : une demande en attente n'a plus d'objet.
    await closePendingRequest(req, row);
  }
  if (f.stage_id && previous.stage_id !== row.stage_id) {
    await recordStatus({ taskId: row.id, stageId: row.stage_id, status: row.status, actorId: req.auth.userId });
  }
  await logActivity({
    orgId: req.params.orgId, actorId: req.auth.userId, action: "update", entityType: "task",
    entityId: row.id, projectId: row.project_id, label: row.title,
    details: { project: project.name, ...changedFields(f), ...(stage ? { stage: stage.name } : {}) },
  });
  res.json(toApi(row, stages));
});

router.delete("/:id", requireRole("contributor"), async (req, res) => {
  if (!UUID_RE.test(req.params.id)) throw httpError(404, "Tâche introuvable.");
  const project = await assertProject(req.params);
  const task = unwrap(await db.from("tasks").select("id, created_by").eq("id", req.params.id).eq("project_id", req.params.projectId).maybeSingle());
  if (!task) throw httpError(404, "Tâche introuvable.");
  // Supprimer efface aussi le travail des autres (sous-tâches, temps, fichiers) : gestionnaire ou créateur.
  if (task.created_by !== req.auth.userId && !(await isManager(req))) {
    throw httpError(403, "Seul le créateur de la tâche ou un gestionnaire peut la supprimer.");
  }
  // Fichiers de la tâche et de ses sous-tâches : à lister avant la suppression (la cascade efface les lignes).
  const subs = unwrap(await db.from("tasks").select("id").eq("parent_id", req.params.id).eq("project_id", req.params.projectId));
  const paths = await pathsForTasks([req.params.id, ...subs.map((t) => t.id)]);
  const rows = unwrap(
    await db.from("tasks").delete().eq("id", req.params.id).eq("project_id", req.params.projectId).select("id, title"),
  );
  if (rows.length === 0) throw httpError(404, "Tâche introuvable.");
  await removeFiles(paths);
  await logActivity({
    orgId: req.params.orgId, actorId: req.auth.userId, action: "delete", entityType: "task",
    entityId: rows[0].id, projectId: req.params.projectId, label: rows[0].title, details: { project: project.name },
  });
  res.status(204).end();
});

export default router;
