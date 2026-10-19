// Langue de l'interface — même liste et mêmes codes que NEXIS Documents (fr, en, es, ar).
// Pour l'instant seule la barre de navigation est traduite ; le reste de l'écran reste en français
// tant que ses textes n'ont pas été migrés vers `t()`.
import { readNexisPrefs, saveNexisPrefs } from "./nexisPrefs.js";

/** Ancienne clé propre à Projets, reprise une fois. La langue est partagée avec Identity et Documents (nexisPrefs.js). */
const LEGACY_KEY = "nexis.projets.lang";
const COOKIE_DOMAIN = import.meta.env.VITE_NEXIS_PREFS_DOMAIN || "";
export const DEFAULT_LANG = "fr";
export const LANGS = [
  { code: "fr", name: "Français" },
  { code: "en", name: "English" },
  { code: "es", name: "Español" },
  { code: "ar", name: "العربية" },
];

const DICT = {
  fr: {
    "nav.main": "Menu principal",
    "nav.projects": "Projets",
    "nav.mine": "Mes tâches",
    "nav.dashboard": "Tableau de bord",
    "nav.activity": "Activité",
    "nav.config": "Configuration",
    "nav.projectSettings": "Paramètres du projet",
    "nav.milestones": "Jalons",
    "nav.language": "Choisir la langue",
    "nav.organization": "Organisation",
    "theme.label": "Thème : {x}",
    "theme.light": "Clair",
    "theme.dark": "Sombre",
    "theme.auto": "Automatique",
  },
  en: {
    "nav.main": "Main menu",
    "nav.projects": "Projects",
    "nav.mine": "My tasks",
    "nav.dashboard": "Dashboard",
    "nav.activity": "Activity",
    "nav.config": "Settings",
    "nav.projectSettings": "Project settings",
    "nav.milestones": "Milestones",
    "nav.language": "Select language",
    "nav.organization": "Organization",
    "theme.label": "Theme: {x}",
    "theme.light": "Light",
    "theme.dark": "Dark",
    "theme.auto": "Automatic",
  },
  es: {
    "nav.main": "Menú principal",
    "nav.projects": "Proyectos",
    "nav.mine": "Mis tareas",
    "nav.dashboard": "Panel de control",
    "nav.activity": "Actividad",
    "nav.config": "Configuración",
    "nav.projectSettings": "Ajustes del proyecto",
    "nav.milestones": "Hitos",
    "nav.language": "Seleccionar idioma",
    "nav.organization": "Organización",
    "theme.label": "Tema: {x}",
    "theme.light": "Claro",
    "theme.dark": "Oscuro",
    "theme.auto": "Automático",
  },
  ar: {
    "nav.main": "القائمة الرئيسية",
    "nav.projects": "المشاريع",
    "nav.mine": "مهامي",
    "nav.dashboard": "لوحة التحكم",
    "nav.activity": "النشاط",
    "nav.config": "الإعدادات",
    "nav.projectSettings": "إعدادات المشروع",
    "nav.milestones": "المراحل الرئيسية",
    "nav.language": "اختيار اللغة",
    "nav.organization": "المنظمة",
    "theme.label": "السمة: {x}",
    "theme.light": "فاتح",
    "theme.dark": "داكن",
    "theme.auto": "تلقائي",
  },
};

export function getLang() {
  const v = readNexisPrefs({ lang: [LEGACY_KEY] }).lang;
  return v && DICT[v] ? v : DEFAULT_LANG;
}

export function setLang(lang) {
  if (!DICT[lang]) return;
  document.documentElement.lang = lang;
  saveNexisPrefs({ lang }, COOKIE_DOMAIN);
}

/** Avant le premier rendu ; publie aussi une langue trouvée ici (ancienne clé comprise) pour les autres applications. */
export function applyLang() {
  const stored = readNexisPrefs({ lang: [LEGACY_KEY] }).lang;
  if (stored && DICT[stored]) saveNexisPrefs({ lang: stored }, COOKIE_DOMAIN);
  document.documentElement.lang = getLang();
}

/** Traduit une clé ; `vars` remplace {nom}. Repli : français, puis la clé elle-même. */
export function t(lang, key, vars = {}) {
  const raw = DICT[lang]?.[key] ?? DICT[DEFAULT_LANG][key] ?? key;
  return raw.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}
