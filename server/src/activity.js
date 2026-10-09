import { db } from "./db.js";

/**
 * Écrit une entrée du journal. Ne fait JAMAIS échouer la requête appelante :
 * une erreur de journal est seulement écrite dans le terminal du serveur.
 */
export async function logActivity({ orgId, actorId, action, entityType, entityId, projectId = null, label, details = {} }) {
  try {
    const { error } = await db.from("activity_log").insert({
      organization_id: orgId,
      actor_id: actorId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      project_id: projectId,
      label,
      details,
    });
    if (error) console.error("[activity] écriture impossible :", error.message);
  } catch (e) {
    console.error("[activity] écriture impossible :", e.message);
  }
}

/** Champs modifiés pour le journal (on ne stocke pas le texte des descriptions). */
export function changedFields(f) {
  const out = { ...f };
  if ("description" in out) out.description = true;
  return out;
}
