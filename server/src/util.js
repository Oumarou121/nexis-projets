export const PRIORITIES = ["low", "medium", "high", "urgent"];
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

import { UUID_RE, httpError } from "./auth.js";
import { db } from "./db.js";

/** Résultat Supabase → données, ou 500 (le détail reste dans les logs serveur). */
export function unwrap({ data, error }) {
  if (error) {
    console.error(error);
    throw httpError(500, "Erreur base de données.");
  }
  return data;
}

/** Le projet doit exister DANS cette organisation (sinon 404). Renvoie { id, name }. */
export async function assertProject({ orgId, projectId }) {
  if (!UUID_RE.test(projectId)) throw httpError(404, "Projet introuvable.");
  const row = unwrap(
    await db.from("projects").select("id, name").eq("id", projectId).eq("organization_id", orgId).maybeSingle(),
  );
  if (!row) throw httpError(404, "Projet introuvable.");
  return row;
}

/** La tâche doit exister DANS ce projet (sinon 404). */
export async function assertTask(taskId, projectId) {
  if (!UUID_RE.test(taskId)) throw httpError(404, "Tâche introuvable.");
  const row = unwrap(await db.from("tasks").select("id, title").eq("id", taskId).eq("project_id", projectId).maybeSingle());
  if (!row) throw httpError(404, "Tâche introuvable.");
  return row;
}
