export const PRIORITIES = ["low", "medium", "high", "urgent"];
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

import { UUID_RE, httpError } from "./auth.js";
import { db } from "./db.js";

// Erreurs réseau (et non SQL) : la base n'a pas répondu, ce n'est pas un bogue de la requête.
const NETWORK_RE = /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|UND_ERR|timeout|aborted|network|socket/i;
// Page d'erreur HTML d'une passerelle (corps non JSON), base saturée ou redémarrée : même cause, même réponse 503.
const GATEWAY_RE = /<html|<!doctype|unexpected token|not valid json|bad gateway|gateway time-?out|service unavailable|web server is down|connection (terminated|refused)|too many connections|remaining connection slots|could not connect|schema cache/i;
const TRANSIENT_CODE_RE = /^(PGRST00[0-3]|08[0-9A-Z]{3}|53300|57P0[1-3]|57014)$/;

/** Raccourcit un nom pour un titre de notification (limité à 200 caractères) : la fin d'un titre ne doit jamais être coupée. */
export const clip = (s, max = 60) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
};

/** Résultat Supabase → données, ou 503 (base injoignable, réessayable) / 500 (erreur de requête). Le détail reste dans les logs serveur. */
export function unwrap({ data, error, status }) {
  if (error) {
    const text = `${error.message ?? ""} ${error.details ?? ""} ${error.code ?? ""}`;
    const transient =
      NETWORK_RE.test(text) || GATEWAY_RE.test(text) || TRANSIENT_CODE_RE.test(error.code ?? "") ||
      status === 0 || status === 429 || (status >= 502 && status <= 504) || (status >= 520 && status <= 526);
    console.error(`[db] ${transient ? "indisponible" : "erreur"} (HTTP ${status ?? "?"}, code ${error.code || "-"}) : ${error.message}`);
    if (transient) throw httpError(503, "Base de données momentanément indisponible. Réessayez dans un instant.");
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
