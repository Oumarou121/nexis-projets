import { getToken, goToNexis } from "./session.js";
import { todayISO } from "./labels.js";

const BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");

// Session absente ou refusée : retour vers NEXIS (la page quitte, on ne résout jamais),
// sauf si ça boucle : on affiche alors la vraie raison au lieu de recommencer.
function reauth(reason) {
  if (goToNexis()) return new Promise(() => {});
  throw new Error(`Connexion impossible. ${reason ?? ""}`.trim());
}

export async function api(path, method = "GET", body) {
  const token = getToken();
  if (!token) return reauth("Aucun jeton valide reçu de NEXIS.");

  const send = () => fetch(`${BASE}${path}`, {
    method,
    // X-Nexis-Today : date locale, pour que les compteurs du serveur (retards) disent la même chose que les cartes.
    headers: { Authorization: `Bearer ${token}`, "X-Nexis-Today": todayISO(), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  // Une lecture qui tombe sur une panne passagère du serveur (500/502/503/504) est retentée une fois, sans rien afficher.
  // Jamais pour une écriture : la rejouer pourrait la dupliquer.
  let res = await send();
  if (method === "GET" && [500, 502, 503, 504].includes(res.status)) {
    await new Promise((r) => setTimeout(r, 600));
    res = await send();
  }
  if (res.status === 204) return null;
  const json = await res.json().catch(() => ({}));
  if (res.status === 401) return reauth(json.error);
  // status et data : l'appelant peut réagir à une réponse précise (ex. 409 { openTasks } au retrait d'un membre).
  if (!res.ok) throw Object.assign(new Error(json.error ?? `Erreur ${res.status}`), { status: res.status, data: json });
  return json;
}

/**
 * Envoie un fichier en trois temps, sans le faire transiter par le serveur (hébergement serverless : corps limités
 * à 4,5 Mo) : URL d'envoi signée demandée au serveur, envoi direct au stockage, puis confirmation au serveur, qui
 * vérifie que le fichier est bien arrivé avant de l'enregistrer.
 */
export async function upload(path, file) {
  const name = file.name;
  const type = file.type || "application/octet-stream";
  const { uploadId, uploadUrl } = await api(`${path}/upload-url`, "POST", { name, type, size: file.size });

  // Même format que supabase-js (uploadToSignedUrl) : formulaire avec le fichier, sans écrasement.
  const form = new FormData();
  form.append("cacheControl", "3600");
  form.append("", file);
  let sent;
  try {
    sent = await fetch(uploadUrl, { method: "PUT", headers: { "x-upsert": "false" }, body: form });
  } catch {
    throw new Error("Envoi du fichier impossible. Vérifiez votre connexion et réessayez.");
  }
  if (!sent.ok) throw new Error(sent.status === 413 ? "Fichier trop volumineux (10 Mo maximum)." : "Envoi du fichier impossible.");

  return api(`${path}/confirm`, "POST", { uploadId, name, type });
}

/**
 * Télécharge un fichier protégé : le serveur vérifie les droits et renvoie un lien signé valable 60 s, toujours
 * en pièce jointe. Le jeton NEXIS ne quitte jamais l'en-tête, et le fichier ne transite pas par le serveur.
 */
export async function download(path, fileName) {
  const { url } = await api(`${path}?link=1`);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName; // ignoré entre domaines ; le lien signé impose déjà le téléchargement et le nom
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  return null;
}
