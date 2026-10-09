import { db } from "./db.js";

/**
 * Note l'entrée d'une tâche dans un statut. Comme le journal d'activité, ne fait JAMAIS
 * échouer la requête appelante : sans la migration, l'erreur reste dans le terminal du serveur.
 */
export async function recordStatus({ taskId, status, actorId, at }) {
  try {
    const { error } = await db.from("task_status_history").insert({
      task_id: taskId,
      status,
      changed_by: actorId,
      ...(at ? { entered_at: at } : {}),
    });
    if (error) console.error("[historique] écriture impossible :", error.message);
  } catch (e) {
    console.error("[historique] écriture impossible :", e.message);
  }
}
