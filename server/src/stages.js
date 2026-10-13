import { db } from "./db.js";
import { httpError } from "./auth.js";
import { unwrap } from "./util.js";

// Étapes (statuts) d'un projet. Chaque étape a une CATÉGORIE fixe : c'est elle qui alimente les
// rapports, le tableau de bord, les retards et l'avancement (tasks.status = catégorie de l'étape).
export const CATEGORIES = ["todo", "in_progress", "done"];
export const MAX_STAGES = 12;
export const MAX_COLOR = 7; // palette de 8 couleurs (indices 0 à 7) ; null = couleur de la catégorie
export const DEFAULT_STAGES = [
  { name: "À faire", category: "todo" },
  { name: "En cours", category: "in_progress" },
  { name: "En revue", category: "in_progress" },
  { name: "Terminée", category: "done" },
];

/** Nettoie une étape saisie : { name, category } ou 400. */
export function cleanStage(raw) {
  const name = String(raw?.name ?? "").trim().replace(/\s+/g, " ");
  if (name.length < 1 || name.length > 30) throw httpError(400, "Le nom d’une étape doit faire 1 à 30 caractères.");
  if (!CATEGORIES.includes(raw?.category)) throw httpError(400, "Catégorie d’étape invalide (todo, in_progress ou done).");
  return { name, category: raw.category, color: cleanColor(raw?.color) };
}

/** Couleur d'étape : entier 0 à 7, ou null (couleur de la catégorie). Absent = null. */
export function cleanColor(v) {
  if (v === undefined || v === null || v === "") return null;
  if (!Number.isInteger(v) || v < 0 || v > MAX_COLOR) throw httpError(400, "Couleur d’étape invalide.");
  return v;
}

/**
 * Un ensemble d'étapes doit rester utilisable : 1 à 12 étapes, noms uniques (sans tenir compte de
 * la casse), au moins une étape « à faire » (où arrivent les nouvelles tâches) et une « terminée ».
 */
export function assertValidSet(list) {
  if (list.length < 1 || list.length > MAX_STAGES) throw httpError(400, `Un projet doit avoir entre 1 et ${MAX_STAGES} étapes.`);
  const names = new Set(list.map((s) => s.name.toLowerCase()));
  if (names.size !== list.length) throw httpError(400, "Deux étapes ne peuvent pas porter le même nom.");
  if (!list.some((s) => s.category === "todo")) throw httpError(400, "Il faut garder au moins une étape de catégorie « À faire ».");
  if (!list.some((s) => s.category === "done")) throw httpError(400, "Il faut garder au moins une étape de catégorie « Terminé ».");
}

/** Modèle de l'organisation pour les nouveaux projets (modèle intégré si elle n'en a pas défini). */
export async function orgTemplate(orgId) {
  const { data, error } = await db
    .from("organization_stage_templates")
    .select("name, category, color, position")
    .eq("organization_id", orgId)
    .order("position", { ascending: true });
  if (error) console.warn("[étapes] modèle de l'organisation indisponible :", error.message);
  const rows = data ?? [];
  return rows.length > 0 ? rows.map(({ name, category, color }) => ({ name, category, color: color ?? null })) : DEFAULT_STAGES;
}

/** Crée les étapes d'un projet à partir du modèle de son organisation. */
export async function seedStages(projectId, orgId) {
  const template = await orgTemplate(orgId);
  return unwrap(
    await db
      .from("project_stages")
      .insert(template.map((s, i) => ({ project_id: projectId, name: s.name, category: s.category, color: s.color ?? null, position: i })))
      .select("id, project_id, name, category, color, position"),
  );
}

/** Étapes du projet, dans l'ordre. Un projet sans étape (créé avant la migration) reçoit celles du modèle. */
export async function projectStages(projectId, orgId) {
  let rows = unwrap(
    await db.from("project_stages").select("id, project_id, name, category, color, position").eq("project_id", projectId).order("position", { ascending: true }),
  );
  if (rows.length === 0) rows = await seedStages(projectId, orgId);
  return [...rows].sort((a, b) => a.position - b.position);
}

export const stageApi = (r, taskCount) => ({
  id: r.id,
  name: r.name,
  category: r.category,
  color: r.color ?? null,
  position: r.position,
  ...(taskCount !== undefined ? { taskCount } : {}),
});

/** Lit { stageId, status } d'un corps de requête (formes seulement ; l'existence se vérifie avec resolveStage). */
export function stageInput(body) {
  const out = {};
  if (body?.stageId !== undefined) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(body.stageId))) throw httpError(400, "Étape invalide.");
    out.stageId = body.stageId;
  }
  if (body?.status !== undefined) {
    // « review » : ancien statut, devenu une étape « en cours » (anciens clients).
    const s = body.status === "review" ? "in_progress" : body.status;
    if (!CATEGORIES.includes(s)) throw httpError(400, "Statut invalide.");
    out.status = s;
  }
  return out;
}

/** L'étape visée : par identifiant, ou la première étape de la catégorie demandée. */
export function resolveStage(stages, { stageId, status }) {
  if (stageId) {
    const s = stages.find((x) => x.id === stageId);
    if (!s) throw httpError(400, "Cette étape n’appartient pas à ce projet.");
    return s;
  }
  const s = stages.find((x) => x.category === status);
  if (!s) throw httpError(400, "Ce projet n’a aucune étape de cette catégorie.");
  return s;
}
