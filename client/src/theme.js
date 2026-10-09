// Thème : « light » (défaut, comme Odoo), « dark » ou « auto » (suit le système). Gardé dans ce navigateur.
const KEY = "nexis.projets.theme";
export const THEMES = { light: "Clair", dark: "Sombre", auto: "Automatique" };

export function getTheme() {
  try {
    const v = localStorage.getItem(KEY);
    return v && THEMES[v] ? v : "light";
  } catch {
    return "light";
  }
}

export function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* stockage indisponible : le thème vaut pour cette session seulement */
  }
}

export const applyTheme = () => (document.documentElement.dataset.theme = getTheme());
