// Lien direct vers une tâche : « #/o/<organisation>/t/<tâche> » (reçu par e-mail). Le fragment ne survit pas à
// la redirection vers NEXIS Identity (connexion) : on le range dans sessionStorage dès le démarrage, et
// l'application le reprend une fois la session ouverte. Voir App.jsx et GET /api/organizations/:orgId/tasks/:taskId.
const KEY = "nexis.deeplink";
const RE = /^#\/o\/([0-9a-f-]{36})\/t\/([0-9a-f-]{36})$/i;

/** À appeler au démarrage, avant captureLaunch() et toute redirection. */
export function captureDeepLink() {
  const m = RE.exec(window.location.hash);
  if (!m) return;
  sessionStorage.setItem(KEY, JSON.stringify({ orgId: m[1].toLowerCase(), taskId: m[2].toLowerCase() }));
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
}

/** Lien en attente ({ orgId, taskId }) ou null ; il n'est lu qu'une fois. */
export function takeDeepLink() {
  const raw = sessionStorage.getItem(KEY);
  sessionStorage.removeItem(KEY);
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
