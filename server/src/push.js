import { readFileSync } from "node:fs";
import { SignJWT, importPKCS8 } from "jose";

// Notifications push (Firebase Cloud Messaging, API HTTP v1) — sans dépendance : on signe nous-mêmes le jeton
// OAuth2 du compte de service avec jose, puis on appelle l'API REST de FCM.
//   FIREBASE_SERVICE_ACCOUNT       : contenu JSON de la clé du compte de service (SECRET, serveur uniquement), sur une ligne.
//   FIREBASE_SERVICE_ACCOUNT_FILE  : à défaut, chemin du fichier JSON de cette clé.
// Sans l'une des deux, le push est simplement désactivé (la cloche et l'e-mail continuent de fonctionner).
// Les messages sont « data-only » : c'est le service worker du client qui affiche la notification.
const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

let cached = { raw: null, account: null };
function account() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim() || process.env.FIREBASE_SERVICE_ACCOUNT_FILE?.trim() || "";
  if (!raw) return null;
  if (cached.raw === raw) return cached.account;
  let account = null;
  try {
    const json = raw.startsWith("{") ? raw : readFileSync(raw, "utf8");
    const a = JSON.parse(json);
    if (a.client_email && a.private_key && a.project_id) account = a;
    else console.error("[push] clé de compte de service incomplète (client_email, private_key, project_id) : push désactivé.");
  } catch (e) {
    console.error("[push] clé de compte de service illisible :", e.message);
  }
  cached = { raw, account };
  return account;
}

export const pushEnabled = () => !!account();

let access = { token: null, exp: 0, email: null };
async function accessToken(a) {
  const now = Date.now();
  if (access.token && access.email === a.client_email && access.exp - 60_000 > now) return access.token;
  const key = await importPKCS8(a.private_key.replace(/\\n/g, "\n"), "RS256");
  const assertion = await new SignJWT({ scope: SCOPE })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(a.client_email)
    .setSubject(a.client_email)
    .setAudience(TOKEN_URL)
    .setIssuedAt()
    .setExpirationTime("55m")
    .sign(key);
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    signal: AbortSignal.timeout(10_000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) throw new Error(`jeton Google refusé (${res.status}) : ${json.error_description ?? json.error ?? "?"}`);
  access = { token: json.access_token, exp: now + (json.expires_in ?? 3600) * 1000, email: a.client_email };
  return access.token;
}

/**
 * Envoie un push à UN appareil.
 * @returns {Promise<{ ok: boolean, invalid?: boolean }>} invalid=true : le jeton n'existe plus (appli désinstallée,
 *   permission retirée) et doit être supprimé de la base. Ne lève jamais d'erreur.
 */
export async function sendPush({ token, title, body, data = {} }) {
  const a = account();
  if (!a) return { ok: false };
  try {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(a.project_id)}/messages:send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await accessToken(a)}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          token,
          // FCM n'accepte que des chaînes dans « data ».
          data: Object.fromEntries(Object.entries({ title, body, ...data }).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])),
          webpush: { headers: { Urgency: "high", TTL: "86400" } },
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return { ok: true };
    const err = (await res.json().catch(() => ({}))).error ?? {};
    const code = err.details?.find?.((d) => d.errorCode)?.errorCode ?? err.status;
    if (res.status === 404 || code === "UNREGISTERED" || code === "NOT_FOUND") return { ok: false, invalid: true };
    console.warn(`[push] FCM ${res.status} (${code ?? "?"}) : ${String(err.message ?? "").slice(0, 200)}`);
    return { ok: false };
  } catch (e) {
    console.warn("[push] envoi impossible :", e.message);
    return { ok: false };
  }
}
