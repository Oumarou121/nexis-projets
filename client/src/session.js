// Session SSO : NEXIS Identity ouvre ce module avec le jeton dans le fragment d'URL
// (#access_token=…). Le fragment n'est jamais envoyé à un serveur. On le range dans
// sessionStorage (propre à l'onglet) et on nettoie aussitôt l'URL.
const TOKEN_KEY = "nexis.token";
const ORG_KEY = "nexis.org";
const LOOP_KEY = "nexis.redirects";
const NEXIS_URL = (import.meta.env.VITE_NEXIS_URL ?? "").replace(/\/+$/, "");
const MODULE_CODE = "projects"; // code du module dans le catalogue NEXIS Identity

/** À appeler une fois au démarrage. */
export function captureLaunch() {
  const h = new URLSearchParams(window.location.hash.slice(1));
  const token = h.get("access_token");
  if (!token) return;
  sessionStorage.setItem(TOKEN_KEY, token);
  const org = h.get("organization_id");
  if (org) localStorage.setItem(ORG_KEY, org);
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
}

/** Jeton valide (non expiré) ou null. */
export function getToken() {
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (payload.exp * 1000 > Date.now() + 10_000) return token;
  } catch {
    /* jeton illisible : traité comme absent */
  }
  sessionStorage.removeItem(TOKEN_KEY);
  return null;
}

export const getOrg = () => localStorage.getItem(ORG_KEY);
export const setOrg = (id) => localStorage.setItem(ORG_KEY, id);
export const nexisHome = `${NEXIS_URL}/dashboard`;

/**
 * Session absente ou expirée : NEXIS Identity la renouvelle (ou demande la connexion) puis nous rouvre.
 * Garde-fou : après 2 renvois en 30 s, on n'insiste pas (renvoie false) au lieu de boucler.
 * Renvoie true si la page quitte pour NEXIS.
 */
export function goToNexis() {
  sessionStorage.removeItem(TOKEN_KEY);
  const now = Date.now();
  const recent = JSON.parse(sessionStorage.getItem(LOOP_KEY) ?? "[]").filter((t) => now - t < 30_000);
  if (recent.length >= 2) return false;
  sessionStorage.setItem(LOOP_KEY, JSON.stringify([...recent, now]));
  window.location.replace(`${NEXIS_URL}/dashboard/ouvrir/${MODULE_CODE}`);
  return true;
}
