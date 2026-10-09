import { getToken, goToNexis } from "./session.js";

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

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const json = await res.json().catch(() => ({}));
  if (res.status === 401) return reauth(json.error);
  if (!res.ok) throw new Error(json.error ?? `Erreur ${res.status}`);
  return json;
}

/** Envoie un fichier (octets bruts). Le type est forcé en octet-stream : le serveur ne lit jamais ce corps comme du JSON. */
export async function upload(path, file) {
  const token = getToken();
  if (!token) return reauth("Aucun jeton valide reçu de NEXIS.");
  const qs = `name=${encodeURIComponent(file.name)}&type=${encodeURIComponent(file.type || "application/octet-stream")}`;
  const res = await fetch(`${BASE}${path}?${qs}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/octet-stream" },
    body: file,
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401) return reauth(json.error);
  if (!res.ok) throw new Error(json.error ?? `Erreur ${res.status}`);
  return json;
}

/** Télécharge un fichier protégé (le jeton est dans l'en-tête, pas dans l'URL) puis le propose à l'enregistrement. */
export async function download(path, fileName) {
  const token = getToken();
  if (!token) return reauth("Aucun jeton valide reçu de NEXIS.");
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) return reauth();
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error ?? `Erreur ${res.status}`);
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return null;
}
