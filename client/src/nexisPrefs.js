// Préférences partagées entre les applications NEXIS (Identity, Projets, Documents) : thème et langue.
//
// Chaque application garde ses préférences dans son localStorage (clés communes « nexis.theme » et
// « nexis.lang »). Le localStorage est propre à chaque origine : pour que les trois applications se
// suivent, chaque choix est aussi écrit dans le cookie « nexis_prefs », lisible par les trois :
// - en développement (localhost), un cookie est commun à tous les ports ;
// - en production, il est posé sur le domaine parent (ex. « .nexistec.com », variable VITE_NEXIS_PREFS_DOMAIN)
//   et suit donc tous les sous-domaines.
// À l'ouverture, et quand l'onglet redevient visible, le cookie l'emporte : c'est le dernier choix fait
// dans n'importe laquelle des applications.
//
// Même module (même format, mêmes clés) dans les trois applications :
// nexis-site/lib/nexisPrefs.js, nexis-projets/client/src/nexisPrefs.js,
// nexis-documents/frontend/src/app/core/utils/nexis-prefs.ts.

export const NEXIS_PREFS_COOKIE = "nexis_prefs";
export const NEXIS_THEME_KEY = "nexis.theme";
export const NEXIS_LANG_KEY = "nexis.lang";

const THEMES = ["light", "dark", "auto"];
const LANGS = ["fr", "en", "es", "ar"];
const ONE_YEAR_SECONDS = 365 * 24 * 3600;

export const asTheme = (v) => (typeof v === "string" && THEMES.includes(v) ? v : null);
export const asLang = (v) => (typeof v === "string" && LANGS.includes(v) ? v : null);

/** Lit le cookie partagé (« t=dark&l=fr »). Valeurs inconnues ignorées. */
export function readPrefsCookie(cookie) {
  const part = String(cookie || "")
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${NEXIS_PREFS_COOKIE}=`));
  if (!part) return { theme: null, lang: null };
  try {
    const params = new URLSearchParams(decodeURIComponent(part.slice(NEXIS_PREFS_COOKIE.length + 1)));
    return { theme: asTheme(params.get("t")), lang: asLang(params.get("l")) };
  } catch {
    return { theme: null, lang: null };
  }
}

/** Valeur du cookie à écrire (sans les valeurs absentes). */
export function prefsCookieString(prefs, domain = "", secure = false) {
  const params = new URLSearchParams();
  if (prefs.theme) params.set("t", prefs.theme);
  if (prefs.lang) params.set("l", prefs.lang);
  let cookie = `${NEXIS_PREFS_COOKIE}=${encodeURIComponent(params.toString())}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
  if (domain) cookie += `; Domain=${domain}`;
  if (secure) cookie += "; Secure";
  return cookie;
}

function safeGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* stockage indisponible : le choix vaut pour cette visite */
  }
}

function safeCookie() {
  try {
    return document.cookie || "";
  } catch {
    return "";
  }
}

/**
 * Préférence courante : cookie partagé, sinon localStorage commun, sinon anciennes clés propres à
 * l'application (reprises une fois), sinon null (chaque application garde alors son défaut).
 */
export function readNexisPrefs(legacy = {}) {
  const fromCookie = readPrefsCookie(safeCookie());
  const firstLegacy = (keys, as) => {
    for (const k of keys || []) {
      const v = as(safeGet(k));
      if (v) return v;
    }
    return null;
  };
  return {
    theme: fromCookie.theme ?? asTheme(safeGet(NEXIS_THEME_KEY)) ?? firstLegacy(legacy.theme, asTheme),
    lang: fromCookie.lang ?? asLang(safeGet(NEXIS_LANG_KEY)) ?? firstLegacy(legacy.lang, asLang),
  };
}

/** Enregistre un choix dans le localStorage et dans le cookie partagé (l'autre préférence est conservée). */
export function saveNexisPrefs(change, cookieDomain = "") {
  const current = readNexisPrefs();
  const next = {
    theme: change.theme !== undefined ? change.theme : current.theme,
    lang: change.lang !== undefined ? change.lang : current.lang,
  };
  if (next.theme) safeSet(NEXIS_THEME_KEY, next.theme);
  if (next.lang) safeSet(NEXIS_LANG_KEY, next.lang);
  try {
    document.cookie = prefsCookieString(next, cookieDomain, window.location.protocol === "https:");
  } catch {
    /* cookies bloqués : le localStorage suffit pour cette application */
  }
  return next;
}

/** Appelle `onChange(prefs)` quand l'onglet redevient visible (choix fait entre-temps dans une autre application). */
export function watchNexisPrefs(onChange) {
  const handler = () => {
    if (document.visibilityState === "visible") onChange(readNexisPrefs());
  };
  document.addEventListener("visibilitychange", handler);
  return () => document.removeEventListener("visibilitychange", handler);
}
