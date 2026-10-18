// Données de la maquette des headers — textes issus des dictionnaires réels (NEXIS Projets : src/i18n.js ;
// NEXIS Documents : src/assets/i18n/*.json) + quelques libellés propres à la maquette (préfixe « x. »).
export type Lang = "fr" | "en" | "es" | "ar";
export type ProjectId = "projets" | "documents";
export type VersionId = "v1" | "v2" | "v2b" | "v3";

export const LANGS: readonly { code: Lang; name: string }[] = [
  { code: "fr", name: "Français" },
  { code: "en", name: "English" },
  { code: "es", name: "Español" },
  { code: "ar", name: "العربية" },
];

export const DICT: Record<Lang, Record<string, string>> = {
  "fr": {
    "p.main": "Menu principal",
    "p.projects": "Projets",
    "p.mine": "Mes tâches",
    "p.dashboard": "Tableau de bord",
    "p.activity": "Activité",
    "p.config": "Configuration",
    "p.projectSettings": "Paramètres du projet",
    "p.milestones": "Jalons",
    "p.language": "Choisir la langue",
    "p.organization": "Organisation",
    "p.theme_light": "Clair",
    "p.theme_dark": "Sombre",
    "p.theme_auto": "Automatique",
    "d.home": "Accueil",
    "d.templates": "Templates",
    "d.generate": "Générer",
    "d.archives": "Archives",
    "d.mainMenu": "Navigation principale",
    "d.search": "Rechercher",
    "d.searchPlaceholder": "Rechercher dans les documents...",
    "d.notifications": "Notifications",
    "d.noNotifications": "Aucune notification",
    "d.languageSwitcher": "Choisir la langue",
    "d.light": "Thème clair",
    "d.dark": "Thème sombre",
    "d.auto": "Thème du système",
    "d.label": "Changer de thème",
    "x.modules": "Modules NEXIS",
    "x.nexisHome": "Tableau de bord NEXIS",
    "x.openMenu": "Ouvrir le menu",
    "x.closeMenu": "Fermer le menu",
    "x.simulation": "Simulation",
    "x.preferences": "Préférences",
    "x.language": "Langue",
    "x.theme": "Thème",
    "x.searchProjets": "Rechercher un projet ou une tâche…",
    "x.rProjects": "Projets",
    "x.rTasks": "Tâches",
    "x.rTemplates": "Templates",
    "x.rDocs": "Documents",
    "x.noResults": "Aucun résultat",
    "x.more": "Plus",
    "x.org": "Organisation",
    "x.current": "Module actuel",
    "x.open": "Ouvrir le module"
  },
  "en": {
    "p.main": "Main menu",
    "p.projects": "Projects",
    "p.mine": "My tasks",
    "p.dashboard": "Dashboard",
    "p.activity": "Activity",
    "p.config": "Settings",
    "p.projectSettings": "Project settings",
    "p.milestones": "Milestones",
    "p.language": "Select language",
    "p.organization": "Organization",
    "p.theme_light": "Light",
    "p.theme_dark": "Dark",
    "p.theme_auto": "Automatic",
    "d.home": "Home",
    "d.templates": "Templates",
    "d.generate": "Generate",
    "d.archives": "Archives",
    "d.mainMenu": "Main navigation",
    "d.search": "Search",
    "d.searchPlaceholder": "Search documents...",
    "d.notifications": "Notifications",
    "d.noNotifications": "No notifications",
    "d.languageSwitcher": "Select language",
    "d.light": "Light theme",
    "d.dark": "Dark theme",
    "d.auto": "System theme",
    "d.label": "Change theme",
    "x.modules": "NEXIS modules",
    "x.nexisHome": "NEXIS dashboard",
    "x.openMenu": "Open menu",
    "x.closeMenu": "Close menu",
    "x.simulation": "Simulation",
    "x.preferences": "Preferences",
    "x.language": "Language",
    "x.theme": "Theme",
    "x.searchProjets": "Search a project or a task…",
    "x.rProjects": "Projects",
    "x.rTasks": "Tasks",
    "x.rTemplates": "Templates",
    "x.rDocs": "Documents",
    "x.noResults": "No results",
    "x.more": "More",
    "x.org": "Organization",
    "x.current": "Current module",
    "x.open": "Open module"
  },
  "es": {
    "p.main": "Menú principal",
    "p.projects": "Proyectos",
    "p.mine": "Mis tareas",
    "p.dashboard": "Panel de control",
    "p.activity": "Actividad",
    "p.config": "Configuración",
    "p.projectSettings": "Ajustes del proyecto",
    "p.milestones": "Hitos",
    "p.language": "Seleccionar idioma",
    "p.organization": "Organización",
    "p.theme_light": "Claro",
    "p.theme_dark": "Oscuro",
    "p.theme_auto": "Automático",
    "d.home": "Inicio",
    "d.templates": "Plantillas",
    "d.generate": "Generar",
    "d.archives": "Archivos",
    "d.mainMenu": "Navegación principal",
    "d.search": "Buscar",
    "d.searchPlaceholder": "Buscar documentos...",
    "d.notifications": "Notificaciones",
    "d.noNotifications": "No hay notificaciones",
    "d.languageSwitcher": "Seleccionar idioma",
    "d.light": "Tema claro",
    "d.dark": "Tema oscuro",
    "d.auto": "Tema del sistema",
    "d.label": "Cambiar de tema",
    "x.modules": "Módulos NEXIS",
    "x.nexisHome": "Panel de NEXIS",
    "x.openMenu": "Abrir el menú",
    "x.closeMenu": "Cerrar el menú",
    "x.simulation": "Simulación",
    "x.preferences": "Preferencias",
    "x.language": "Idioma",
    "x.theme": "Tema",
    "x.searchProjets": "Buscar un proyecto o una tarea…",
    "x.rProjects": "Proyectos",
    "x.rTasks": "Tareas",
    "x.rTemplates": "Plantillas",
    "x.rDocs": "Documentos",
    "x.noResults": "Sin resultados",
    "x.more": "Más",
    "x.org": "Organización",
    "x.current": "Módulo actual",
    "x.open": "Abrir módulo"
  },
  "ar": {
    "p.main": "القائمة الرئيسية",
    "p.projects": "المشاريع",
    "p.mine": "مهامي",
    "p.dashboard": "لوحة التحكم",
    "p.activity": "النشاط",
    "p.config": "الإعدادات",
    "p.projectSettings": "إعدادات المشروع",
    "p.milestones": "المراحل الرئيسية",
    "p.language": "اختيار اللغة",
    "p.organization": "المنظمة",
    "p.theme_light": "فاتح",
    "p.theme_dark": "داكن",
    "p.theme_auto": "تلقائي",
    "d.home": "الرئيسية",
    "d.templates": "القوالب",
    "d.generate": "إنشاء",
    "d.archives": "الأرشيف",
    "d.mainMenu": "التنقل الرئيسي",
    "d.search": "بحث",
    "d.searchPlaceholder": "البحث في المستندات...",
    "d.notifications": "الإشعارات",
    "d.noNotifications": "لا توجد إشعارات",
    "d.languageSwitcher": "اختيار اللغة",
    "d.light": "المظهر الفاتح",
    "d.dark": "المظهر الداكن",
    "d.auto": "مظهر النظام",
    "d.label": "تغيير المظهر",
    "x.modules": "وحدات NEXIS",
    "x.nexisHome": "لوحة تحكم NEXIS",
    "x.openMenu": "فتح القائمة",
    "x.closeMenu": "إغلاق القائمة",
    "x.simulation": "محاكاة",
    "x.preferences": "التفضيلات",
    "x.language": "اللغة",
    "x.theme": "المظهر",
    "x.searchProjets": "البحث عن مشروع أو مهمة…",
    "x.rProjects": "المشاريع",
    "x.rTasks": "المهام",
    "x.rTemplates": "القوالب",
    "x.rDocs": "المستندات",
    "x.noResults": "لا توجد نتائج",
    "x.more": "المزيد",
    "x.org": "المنظمة",
    "x.current": "الوحدة الحالية",
    "x.open": "فتح الوحدة"
  }
};

export interface NavDef { id: string; labelKey: string; icon: string }
export interface ProjectDef {
  id: ProjectId;
  name: string;
  /** Code du module dans le catalogue NEXIS Identity (mécanisme réel : /dashboard/ouvrir/<code>). */
  moduleCode: string;
  accent: "pri" | "sec";
  navLabelKey: string;
  nav: NavDef[];
  /** Menu « Configuration » : n'existe que dans NEXIS Projets, et seulement quand un projet est ouvert. */
  hasConfig: boolean;
  searchKey: string;
  /** NEXIS Projets : cloche réelle (liste) ; NEXIS Documents : panneau vide (pas encore branché). */
  notifications: boolean;
}

export const PROJECTS: Record<ProjectId, ProjectDef> = {
  projets: {
    id: "projets", name: "Projets", moduleCode: "projects", accent: "pri", navLabelKey: "p.main", hasConfig: true,
    searchKey: "x.searchProjets", notifications: true,
    nav: [
      { id: "projects", labelKey: "p.projects", icon: "projects" },
      { id: "mine", labelKey: "p.mine", icon: "tasks" },
      { id: "dashboard", labelKey: "p.dashboard", icon: "dashboard" },
      { id: "activity", labelKey: "p.activity", icon: "activity" },
    ],
  },
  documents: {
    id: "documents", name: "Docs", moduleCode: "documents", accent: "sec", navLabelKey: "d.mainMenu", hasConfig: false,
    searchKey: "d.searchPlaceholder", notifications: false,
    nav: [
      { id: "home", labelKey: "d.home", icon: "home" },
      { id: "templates", labelKey: "d.templates", icon: "templates" },
      { id: "generate", labelKey: "d.generate", icon: "generate" },
      { id: "archives", labelKey: "d.archives", icon: "archives" },
    ],
  },
};

export const ORG_NAME = "nexis";

/** Contenu de démonstration (simulation) pour la recherche et les notifications. */
export const DEMO_RESULTS: Record<ProjectId, { groupKey: string; items: string[] }[]> = {
  projets: [
    { groupKey: "x.rProjects", items: ["Projet exemple A", "Projet exemple B"] },
    { groupKey: "x.rTasks", items: ["Tâche exemple 1", "Tâche exemple 2", "Tâche exemple 3"] },
  ],
  documents: [
    { groupKey: "x.rTemplates", items: ["Template exemple 1", "Template exemple 2"] },
    { groupKey: "x.rDocs", items: ["Document exemple 1", "Document exemple 2"] },
  ],
};
export const DEMO_NOTIFICATIONS: string[] = [
  "Une tâche exemple vous a été assignée",
  "Échéance demain : tâche exemple 2",
  "Nouveau commentaire sur le projet exemple A",
];
