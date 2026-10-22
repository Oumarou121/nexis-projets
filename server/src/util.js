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

const PAGE = 1000; // plafond de lignes par réponse de Supabase (PostgREST max-rows)

/**
 * Toutes les lignes d'une lecture, page par page (sans cela, Supabase s'arrête à 1000 sans prévenir).
 * `build` rend une NOUVELLE requête à chaque appel (une requête Supabase ne se rejoue pas) ; elle doit être
 * triée sur une colonne unique pour que les pages ne se chevauchent pas.
 */
export async function selectAll(build) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const rows = unwrap(await build().range(from, from + PAGE - 1));
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

// Règles de comptage communes à tous les écrans (liste des projets, tableau de bord, rapports, portail) :
//   - l'avancement d'un projet compte ses TÂCHES PRINCIPALES ; une sous-tâche fait avancer sa tâche, pas le projet ;
//   - les jalons sont des repères, pas du travail : ni dans les totaux, ni dans les retards, ni dans la charge ;
//   - la charge d'une personne compte tout ce qui lui est assigné (sous-tâches comprises) ;
//   - un projet terminé ou en pause n'a pas de retard : ses tâches ouvertes ne comptent ni en retard ni en charge,
//     et ne déclenchent ni rappel ni résumé.
export const isWork = (t) => !t.is_milestone;
export const countsForProgress = (t) => isWork(t) && !t.parent_id;
export const CLOSED_PROJECT = ["done", "on_hold"];
export const isOpenProject = (status) => !CLOSED_PROJECT.includes(status);

/** selectAll sur une longue liste d'identifiants, par lots (l'URL d'un « in » très long serait refusée). */
export async function selectIn(build, ids, size = 200) {
  const out = [];
  for (let i = 0; i < ids.length; i += size) out.push(...(await selectAll(() => build(ids.slice(i, i + size)))));
  return out;
}
