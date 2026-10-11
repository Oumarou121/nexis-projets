import { db } from "./db.js";

/**
 * Écrit une entrée du journal. Ne fait JAMAIS échouer la requête appelante :
 * une erreur de journal est seulement écrite dans le terminal du serveur.
 *
 * `restricted` : l'entrée concerne un projet privé (elle n'apparaît alors que pour ceux qui le voient).
 * Non précisé, il se déduit du projet. En cas de doute (projet introuvable, erreur) on restreint :
 * mieux vaut cacher une entrée que laisser fuiter un projet privé.
 */
export async function logActivity({ orgId, actorId, action, entityType, entityId, projectId = null, label, details = {}, restricted }) {
  try {
    let isRestricted = restricted;
    if (isRestricted === undefined) {
      isRestricted = false;
      if (projectId) {
        const { data } = await db.from("projects").select("visibility").eq("id", projectId).maybeSingle();
        isRestricted = !data || data.visibility === "private";
      }
    }
    const { error } = await db.from("activity_log").insert({
      organization_id: orgId,
      actor_id: actorId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      project_id: projectId,
      label,
      details,
      restricted: isRestricted,
    });
    if (error) console.error("[activity] écriture impossible :", error.message);
  } catch (e) {
    console.error("[activity] écriture impossible :", e.message);
  }
}

/** Aligne les entrées passées d'un projet sur sa visibilité (appelé quand elle change). */
export async function syncActivityVisibility(projectId, visibility) {
  try {
    const { error } = await db.from("activity_log").update({ restricted: visibility === "private" }).eq("project_id", projectId);
    if (error) console.error("[activity] mise à jour de la visibilité impossible :", error.message);
  } catch (e) {
    console.error("[activity] mise à jour de la visibilité impossible :", e.message);
  }
}

/** Champs modifiés pour le journal (on ne stocke pas le texte des descriptions). */
export function changedFields(f) {
  const out = { ...f };
  if ("description" in out) out.description = true;
  return out;
}
