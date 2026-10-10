export const PROJECT_STATUS = { planned: "Planifié", active: "Actif", on_hold: "En pause", done: "Terminé" };
export const TASK_STATUS = { todo: "À faire", in_progress: "En cours", review: "En revue", done: "Terminée" };
export const PRIORITY = { low: "Basse", medium: "Moyenne", high: "Haute", urgent: "Urgente" };

export const memberName = (m) =>
  [m?.firstName, m?.lastName].filter(Boolean).join(" ") || m?.email || "Membre";

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
/** Tâche en retard : échéance passée et pas terminée. */
export const isLate = (t) => !!t.dueDate && t.status !== "done" && t.dueDate < todayISO();

/** Couleur stable d'une étiquette, déduite de son nom (pas de catalogue à gérer). */
export const labelHue = (name) => {
  let h = 0;
  for (const c of name.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
};
export const labelColor = (name) => `hsl(${labelHue(name)} 60% 62%)`;

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const fileSize = (n) => (n < 1024 ? `${n} o` : n < 1024 * 1024 ? `${Math.round(n / 1024)} Ko` : `${(n / 1024 / 1024).toFixed(1)} Mo`);

/** Couleur de statut (point, pastille, barre de progression). */
export const STATUS_COLOR = { todo: "#9ca3af", in_progress: "#3b82f6", review: "#f59e0b", done: "#22c55e" };
export const PRIORITY_COLOR = { low: "#9ca3af", medium: "#3b82f6", high: "#f59e0b", urgent: "#ef4444" };

/** « 12 oct. » ou « Demain » : date courte et lisible. */
export function shortDate(iso) {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  const diff = Math.round((d - new Date(todayISO() + "T00:00:00")) / 86400000);
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return "Demain";
  if (diff === -1) return "Hier";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", ...(d.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}) });
}

/** Durée lisible : « < 1 min », « 25 min », « 5 h », « 3 j ». */
export function fmtDuration(ms) {
  const min = Math.floor(ms / 60000);
  if (min < 1) return "< 1 min";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} j`;
}

/**
 * Temps passé dans chaque statut, à partir de l'historique (entrées triées par date).
 * Renvoie { status: { ms, since } } : `ms` cumule les passages, `since` = dernière entrée.
 * L'étape en cours court jusqu'à `now`.
 */
export function stageDurations(history, now = Date.now()) {
  const out = {};
  (history ?? []).forEach((h, i) => {
    const start = new Date(h.enteredAt).getTime();
    const end = i + 1 < history.length ? new Date(history[i + 1].enteredAt).getTime() : now;
    const cur = out[h.status] ?? { ms: 0, since: h.enteredAt };
    out[h.status] = { ms: cur.ms + Math.max(0, end - start), since: h.enteredAt };
  });
  return out;
}

/** Couleur d'un projet : teinte choisie (0 à 4) ou, à défaut, déduite du nom. Variables CSS --pj-0 à --pj-4. */
export const projectColor = (name = "", color = null) => {
  if (Number.isInteger(color) && color >= 0 && color <= 4) return `var(--pj-${color})`;
  let h = 0;
  for (const c of name.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) % 997;
  return `var(--pj-${h % 5})`;
};
