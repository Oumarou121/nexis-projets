import { Router } from "express";
import { db } from "../db.js";
import { UUID_RE, httpError, requirePermission } from "../auth.js";
import { assertProject, unwrap } from "../util.js";
import { MAX_STAGES, assertValidSet, cleanColor, cleanStage, orgTemplate, projectStages, stageApi, DEFAULT_STAGES } from "../stages.js";

// Monté sous /api/organizations/:orgId/projects/:projectId/stages.
// Lecture = projects.read ; créer / renommer / réordonner / supprimer = projects.update.
// Chaque modification répond avec la liste complète et à jour : { stages: [...] }.
const router = Router({ mergeParams: true });

async function listWithCounts(projectId, orgId) {
  const stages = await projectStages(projectId, orgId);
  const tasks = unwrap(await db.from("tasks").select("stage_id").eq("project_id", projectId));
  const counts = new Map();
  for (const t of tasks) counts.set(t.stage_id, (counts.get(t.stage_id) ?? 0) + 1);
  return stages.map((s) => stageApi(s, counts.get(s.id) ?? 0));
}

const stageIdOf = (req) => {
  if (!UUID_RE.test(req.params.stageId)) throw httpError(404, "Étape introuvable.");
  return req.params.stageId;
};

router.get("/", requirePermission("projects.read"), async (req, res) => {
  await assertProject(req.params);
  res.json({ stages: await listWithCounts(req.params.projectId, req.params.orgId) });
});

router.post("/", requirePermission("projects.update"), async (req, res) => {
  await assertProject(req.params);
  const input = cleanStage(req.body);
  const stages = await projectStages(req.params.projectId, req.params.orgId);
  assertValidSet([...stages, input]);
  unwrap(
    await db.from("project_stages").insert({ project_id: req.params.projectId, ...input, position: stages.length }).select("id"),
  );
  res.status(201).json({ stages: await listWithCounts(req.params.projectId, req.params.orgId) });
});

// Réordonner : la liste doit contenir exactement les étapes du projet, dans le nouvel ordre.
router.put("/order", requirePermission("projects.update"), async (req, res) => {
  await assertProject(req.params);
  const stages = await projectStages(req.params.projectId, req.params.orgId);
  const ids = req.body?.ids;
  if (!Array.isArray(ids) || ids.length !== stages.length || new Set(ids).size !== ids.length || !ids.every((id) => stages.some((s) => s.id === id))) {
    throw httpError(400, "Ordre invalide : toutes les étapes du projet sont attendues.");
  }
  for (const [position, id] of ids.entries()) {
    unwrap(await db.from("project_stages").update({ position }).eq("id", id).eq("project_id", req.params.projectId).select("id"));
  }
  res.json({ stages: await listWithCounts(req.params.projectId, req.params.orgId) });
});

router.patch("/:stageId", requirePermission("projects.update"), async (req, res) => {
  const id = stageIdOf(req);
  await assertProject(req.params);
  const stages = await projectStages(req.params.projectId, req.params.orgId);
  const current = stages.find((s) => s.id === id);
  if (!current) throw httpError(404, "Étape introuvable.");
  // color : absent = inchangé ; null = revenir à la couleur de la catégorie.
  const color = req.body?.color === undefined ? (current.color ?? null) : cleanColor(req.body.color);
  const next = cleanStage({ name: req.body?.name ?? current.name, category: req.body?.category ?? current.category, color });
  if (next.name === current.name && next.category === current.category && next.color === (current.color ?? null)) throw httpError(400, "Aucune modification.");
  assertValidSet(stages.map((s) => (s.id === id ? { ...s, ...next } : s)));
  unwrap(await db.from("project_stages").update(next).eq("id", id).eq("project_id", req.params.projectId).select("id"));
  // Les tâches suivent la catégorie de leur étape (rapports, retards, avancement).
  if (next.category !== current.category) {
    unwrap(await db.from("tasks").update({ status: next.category }).eq("stage_id", id).eq("project_id", req.params.projectId).select("id"));
  }
  res.json({ stages: await listWithCounts(req.params.projectId, req.params.orgId) });
});

// Supprimer : si l'étape contient des tâches, ?moveTo=<autre étape> est obligatoire (elles y sont déplacées).
router.delete("/:stageId", requirePermission("projects.update"), async (req, res) => {
  const id = stageIdOf(req);
  await assertProject(req.params);
  const stages = await projectStages(req.params.projectId, req.params.orgId);
  const stage = stages.find((s) => s.id === id);
  if (!stage) throw httpError(404, "Étape introuvable.");
  assertValidSet(stages.filter((s) => s.id !== id));
  const tasks = unwrap(await db.from("tasks").select("id").eq("stage_id", id).eq("project_id", req.params.projectId));
  if (tasks.length > 0) {
    const target = stages.find((s) => s.id === req.query.moveTo && s.id !== id);
    if (!target) throw httpError(400, `Cette étape contient ${tasks.length} tâche${tasks.length > 1 ? "s" : ""} : choisissez l’étape où les déplacer.`);
    unwrap(await db.from("tasks").update({ stage_id: target.id, status: target.category, updated_at: new Date().toISOString() }).eq("stage_id", id).eq("project_id", req.params.projectId).select("id"));
    // Journal des durées : les tâches « arrivent » dans la nouvelle étape (jamais bloquant).
    const { error } = await db.from("task_status_history").insert(
      tasks.map((t) => ({ task_id: t.id, stage_id: target.id, status: target.category, changed_by: req.auth.userId })),
    );
    if (error) console.error("[historique] déplacement d'étape non journalisé :", error.message);
  }
  unwrap(await db.from("project_stages").delete().eq("id", id).eq("project_id", req.params.projectId).select("id"));
  // Positions recompactées (0, 1, 2…).
  for (const [position, s] of stages.filter((x) => x.id !== id).entries()) {
    if (s.position !== position) unwrap(await db.from("project_stages").update({ position }).eq("id", s.id).select("id"));
  }
  res.json({ stages: await listWithCounts(req.params.projectId, req.params.orgId) });
});

export default router;

// ---------------------------------------------------------------------------------------------
// Modèle par défaut de l'organisation : /api/organizations/:orgId/stage-template.
// Lecture = projects.read ; modification = projects.create (comme créer un projet). Il ne s'applique
// qu'aux NOUVEAUX projets : les projets existants gardent leurs étapes.
export const templateRouter = Router({ mergeParams: true });

templateRouter.get("/", requirePermission("projects.read"), async (req, res) => {
  const { data } = await db.from("organization_stage_templates").select("id").eq("organization_id", req.params.orgId).limit(1);
  res.json({ stages: await orgTemplate(req.params.orgId), isDefault: (data ?? []).length === 0, builtIn: DEFAULT_STAGES, max: MAX_STAGES });
});

templateRouter.put("/", requirePermission("projects.create"), async (req, res) => {
  const raw = req.body?.stages;
  if (!Array.isArray(raw)) throw httpError(400, "Liste d’étapes attendue.");
  const stages = raw.map(cleanStage);
  assertValidSet(stages);
  unwrap(await db.from("organization_stage_templates").delete().eq("organization_id", req.params.orgId).select("id"));
  unwrap(
    await db
      .from("organization_stage_templates")
      .insert(stages.map((s, i) => ({ organization_id: req.params.orgId, ...s, position: i })))
      .select("id"),
  );
  res.json({ stages, isDefault: false });
});

// Revenir au modèle intégré.
templateRouter.delete("/", requirePermission("projects.create"), async (req, res) => {
  unwrap(await db.from("organization_stage_templates").delete().eq("organization_id", req.params.orgId).select("id"));
  res.json({ stages: DEFAULT_STAGES, isDefault: true });
});
