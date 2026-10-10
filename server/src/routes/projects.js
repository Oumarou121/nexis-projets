import { Router } from "express";
import { db } from "../db.js";
import { UUID_RE, httpError, requirePermission } from "../auth.js";
import { DATE_RE, PRIORITIES, assertProject, unwrap } from "../util.js";
import tasks from "./tasks.js";
import projectDependencies from "./projectDependencies.js";
import { changedFields, logActivity } from "../activity.js";
import { pathsForTasks, removeFiles } from "../storage.js";

const STATUSES = ["planned", "active", "on_hold", "done"];
const COLS = "id, organization_id, name, description, status, priority, due_date, settings, color, created_by, created_at, updated_at";

const toApi = (r) => ({
  id: r.id,
  organizationId: r.organization_id,
  name: r.name,
  description: r.description,
  status: r.status,
  priority: r.priority,
  dueDate: r.due_date,
  settings: r.settings,
  color: r.color,
  createdBy: r.created_by,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

/** Valide les champs présents ; renvoie { colonne: valeur }. */
function parse(body, { partial }) {
  const out = {};
  const has = (k) => body?.[k] !== undefined;

  if (has("name") || !partial) {
    const name = String(body?.name ?? "").trim().replace(/\s+/g, " ");
    if (name.length < 2 || name.length > 120) throw httpError(400, "Le nom doit faire 2 à 120 caractères.");
    out.name = name;
  }
  if (has("description")) {
    const d = body.description === null ? "" : String(body.description).trim();
    if (d.length > 2000) throw httpError(400, "Description trop longue (2000 caractères).");
    out.description = d || null;
  }
  if (has("status")) {
    if (!STATUSES.includes(body.status)) throw httpError(400, "Statut invalide.");
    out.status = body.status;
  }
  if (has("priority")) {
    if (!PRIORITIES.includes(body.priority)) throw httpError(400, "Priorité invalide.");
    out.priority = body.priority;
  }
  if (has("dueDate")) {
    if (body.dueDate !== null && !DATE_RE.test(body.dueDate)) throw httpError(400, "Échéance invalide (AAAA-MM-JJ).");
    out.due_date = body.dueDate;
  }
  if (has("color")) {
    if (body.color !== null && !(Number.isInteger(body.color) && body.color >= 0 && body.color <= 4)) throw httpError(400, "Couleur invalide (0 à 4).");
    out.color = body.color;
  }
  if (has("settings")) {
    if (body.settings !== null && typeof body.settings !== "object") throw httpError(400, "Paramètres invalides.");
    out.settings = body.settings;
  }
  return out;
}

const checkId = (id) => {
  if (!UUID_RE.test(id)) throw httpError(404, "Projet introuvable.");
};

const router = Router({ mergeParams: true });
router.use("/:projectId/tasks", tasks);
router.use("/:projectId/dependencies", projectDependencies);

router.get("/", requirePermission("projects.read"), async (req, res) => {
  const rows = unwrap(
    await db.from("projects").select(COLS).eq("organization_id", req.params.orgId).order("created_at", { ascending: false }),
  );
  // Chiffres affichés sur la page Projets : tâches principales (hors sous-tâches).
  // Avancement (terminées / total), retards, membres concernés et jalons à venir.
  // Un échec ne bloque pas la liste : les compteurs sont alors à 0.
  const today = new Date().toISOString().slice(0, 10);
  const stats = new Map();
  const of = (id) => {
    if (!stats.has(id)) stats.set(id, { total: 0, done: 0, late: 0, open: {}, milestones: [] });
    return stats.get(id);
  };
  if (rows.length > 0) {
    const { data, error } = await db
      .from("tasks")
      .select("project_id, status, assignee_id, due_date, is_milestone")
      .is("parent_id", null)
      .in("project_id", rows.map((r) => r.id));
    if (error) console.warn("[projets] compteurs indisponibles :", error.message);
    for (const t of data ?? []) {
      const s = of(t.project_id);
      s.total += 1;
      if (t.status === "done") {
        s.done += 1;
        continue;
      }
      if (t.due_date && t.due_date < today) s.late += 1;
      if (t.assignee_id) s.open[t.assignee_id] = (s.open[t.assignee_id] ?? 0) + 1;
      if (t.is_milestone && t.due_date) s.milestones.push(t.due_date);
    }
  }
  res.json(
    rows.map((r) => {
      const s = of(r.id);
      return {
        ...toApi(r),
        taskCount: s.total,
        doneCount: s.done,
        lateCount: s.late,
        openByAssignee: s.open,
        milestoneDates: s.milestones.sort().slice(0, 10),
      };
    }),
  );
});

router.get("/:id", requirePermission("projects.read"), async (req, res) => {
  checkId(req.params.id);
  const row = unwrap(
    await db.from("projects").select(COLS).eq("id", req.params.id).eq("organization_id", req.params.orgId).maybeSingle(),
  );
  if (!row) throw httpError(404, "Projet introuvable.");
  res.json(toApi(row));
});

router.post("/", requirePermission("projects.create"), async (req, res) => {
  const f = parse(req.body, { partial: false });
  const row = unwrap(
    await db
      .from("projects")
      .insert({ ...f, organization_id: req.params.orgId, created_by: req.auth.userId })
      .select(COLS)
      .single(),
  );
  await logActivity({
    orgId: req.params.orgId, actorId: req.auth.userId, action: "create", entityType: "project",
    entityId: row.id, projectId: row.id, label: row.name,
  });
  res.status(201).json(toApi(row));
});

router.patch("/:id", requirePermission("projects.update"), async (req, res) => {
  checkId(req.params.id);
  const f = parse(req.body, { partial: true });
  if (Object.keys(f).length === 0) throw httpError(400, "Aucune modification.");
  const row = unwrap(
    await db
      .from("projects")
      .update({ ...f, updated_at: new Date().toISOString() })
      .eq("id", req.params.id)
      .eq("organization_id", req.params.orgId)
      .select(COLS)
      .maybeSingle(),
  );
  if (!row) throw httpError(404, "Projet introuvable.");
  await logActivity({
    orgId: req.params.orgId, actorId: req.auth.userId, action: "update", entityType: "project",
    entityId: row.id, projectId: row.id, label: row.name, details: changedFields(f),
  });
  res.json(toApi(row));
});

router.delete("/:id", requirePermission("projects.delete"), async (req, res) => {
  checkId(req.params.id);
  // Fichiers de toutes les tâches du projet : à lister avant la suppression (la cascade efface les lignes).
  await assertProject({ orgId: req.params.orgId, projectId: req.params.id });
  const taskRows = unwrap(await db.from("tasks").select("id").eq("project_id", req.params.id));
  const paths = await pathsForTasks(taskRows.map((t) => t.id));
  const rows = unwrap(
    await db.from("projects").delete().eq("id", req.params.id).eq("organization_id", req.params.orgId).select("id, name"),
  );
  if (rows.length === 0) throw httpError(404, "Projet introuvable.");
  await removeFiles(paths);
  await logActivity({
    orgId: req.params.orgId, actorId: req.auth.userId, action: "delete", entityType: "project",
    entityId: rows[0].id, projectId: rows[0].id, label: rows[0].name,
  });
  res.status(204).end();
});

export default router;
