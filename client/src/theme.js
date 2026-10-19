// Thème : « light » (défaut, comme Odoo), « dark » ou « auto » (suit le système).
// Partagé avec NEXIS Identity et NEXIS Documents (voir nexisPrefs.js) : localStorage + cookie commun.
import { readNexisPrefs, saveNexisPrefs } from "./nexisPrefs.js";

/** Ancienne clé propre à Projets, reprise une fois. */
const LEGACY_KEY = "nexis.projets.theme";
const COOKIE_DOMAIN = import.meta.env.VITE_NEXIS_PREFS_DOMAIN || "";
export const THEMES = { light: "Clair", dark: "Sombre", auto: "Automatique" };

export function getTheme() {
  return readNexisPrefs({ theme: [LEGACY_KEY] }).theme ?? "light";
}

export function setTheme(theme) {
  if (!THEMES[theme]) return;
  document.documentElement.dataset.theme = theme;
  saveNexisPrefs({ theme }, COOKIE_DOMAIN);
}

/** Avant le premier rendu ; publie aussi une préférence trouvée ici (ancienne clé comprise) pour les autres applications. */
export function applyTheme() {
  const stored = readNexisPrefs({ theme: [LEGACY_KEY] }).theme;
  if (stored) saveNexisPrefs({ theme: stored }, COOKIE_DOMAIN);
  document.documentElement.dataset.theme = stored ?? "light";
}
