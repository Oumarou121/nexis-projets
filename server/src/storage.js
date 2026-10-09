import { db } from "./db.js";

export const BUCKET = "task-attachments";
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_FILES_PER_TASK = 10;

/** Nom d'affichage sûr : sans chemin ni caractères de contrôle, 150 caractères au plus. */
export function cleanFileName(raw) {
  const base = String(raw ?? "").split(/[\\/]/).pop();
  const name = base.replace(/[\u0000-\u001f\u007f"<>:*?|]/g, "").replace(/\s+/g, " ").trim().slice(0, 150);
  return name || "fichier";
}

/**
 * Supprime des fichiers du stockage. Ne fait JAMAIS échouer la requête : la ligne en base
 * a déjà disparu, un fichier orphelin est seulement signalé dans le terminal du serveur.
 */
export async function removeFiles(paths) {
  if (!paths || paths.length === 0) return;
  try {
    const { error } = await db.storage.from(BUCKET).remove(paths);
    if (error) console.error("[storage] suppression impossible :", error.message);
  } catch (e) {
    console.error("[storage] suppression impossible :", e.message);
  }
}

/** Chemins des fichiers de ces tâches (à lire AVANT de supprimer les tâches : la cascade efface les lignes). */
export async function pathsForTasks(taskIds) {
  if (taskIds.length === 0) return [];
  try {
    const { data, error } = await db.from("task_attachments").select("storage_path").in("task_id", taskIds);
    if (error) {
      console.warn("[attachments] lecture impossible :", error.message);
      return [];
    }
    return (data ?? []).map((r) => r.storage_path);
  } catch (e) {
    console.warn("[attachments] lecture impossible :", e.message);
    return [];
  }
}
