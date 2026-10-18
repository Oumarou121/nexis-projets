// Moteur de la maquette « 3 propositions de header unifié » — PRÉVISUALISATION UNIQUEMENT.
// Rend, dans un Shadow DOM, les trois versions pour les deux projets (NEXIS Projets, NEXIS Documents).
// Rien ici n'appelle d'API ni n'écrit de donnée : recherche, notifications, changement de module,
// langue et thème sont des SIMULATIONS visuelles. Les headers réels des applications ne sont pas touchés.
import { HEADER_PREVIEW_CSS } from "./header-preview.styles";
import {
  DEMO_NOTIFICATIONS, DEMO_RESULTS, DICT, LANGS, ORG_NAME, PROJECTS,
  type Lang, type ProjectDef, type ProjectId, type VersionId,
} from "./header-preview.data";

export interface PreviewLogos { projets: string; documents: string }
type Width = "desktop" | "tablet" | "mobile";
type Theme = "light" | "dark";

interface State {
  project: ProjectId | "both";
  version: VersionId | "all";
  width: Width;
  theme: Theme;
  lang: Lang;
  inProject: boolean;
  active: Record<ProjectId, string>;
  open: string | null;
}

const VERSIONS: { id: VersionId; title: string; concept: string; pros: string[]; cons: string[] }[] = [
  {
    id: "v1", title: "Version 1 — Compact et minimaliste",
    concept: "Une seule ligne de 48 px, onglets textuels, commandes réduites à des icônes.",
    pros: ["Gagne ~24 px de hauteur utile sur l'existant (72 px)", "Très lisible dans une application riche en tableaux et formulaires", "Mobile : un simple bouton menu déroule les liens"],
    cons: ["Identité de marque plus discrète", "Commandes uniquement par icône : moins explicites", "Pas d'indication du module au-delà du nom"],
  },
  {
    id: "v2", title: "Version 2 — SaaS structuré",
    concept: "Trois zones séparées (marque · navigation · commandes), onglet actif souligné, recherche visible.",
    pros: ["Hiérarchie très claire, impression de produit mature", "Module actif explicite (surtitre NEXIS + nom du produit)", "Recherche immédiatement repérable sur grand écran"],
    cons: ["64 px de haut, plus dense visuellement", "Sous 900 px, la navigation passe sur une seconde ligne (+44 px)", "Plus de pièces à entretenir"],
  },
  {
    id: "v2b", title: "Version 2b — SaaS structuré, ajusté",
    concept: "Identique à la V2 sur ordinateur ; sous 900 px, la navigation passe en barre d'onglets basse au lieu d'une 2e ligne.",
    pros: ["Même identité que la V2 sur grand écran", "Header d'une seule ligne (~56 px) en tablette et mobile : plus de 2e ligne", "Menu Configuration de Projets toujours accessible (onglet de la barre basse)", "Cohérent avec la barre basse déjà utilisée par NEXIS Documents"],
    cons: ["Une barre basse (~60 px) en tablette et mobile", "Tablette 820 px : la navigation en une seule ligne ne tient pas pour Projets avec Configuration, d'où la barre basse dès 900 px"],
  },
  {
    id: "v3", title: "Version 3 — Multi-projets unifié",
    concept: "Bouton « modules NEXIS », puce produit à accent, navigation en segment, préférences regroupées, barre d'onglets basse sur mobile.",
    pros: ["Appartenance à l'écosystème NEXIS immédiatement lisible", "Extensible : ajouter un module = ajouter une ligne au sélecteur", "Mobile calqué sur la barre basse déjà utilisée par NEXIS Documents"],
    cons: ["Le sélecteur de modules s'appuie sur NEXIS Identity (à confirmer avant implémentation)", "Langue et thème regroupés dans « Préférences » : un clic de plus", "Barre basse : ~60 px en bas de l'écran mobile"],
  },
];

const ICONS: Record<string, string> = {
  search: '<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/>',
  bell: '<path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  auto: '<circle cx="12" cy="12" r="8"/><path d="M12 4v16"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  grid9: '<g fill="currentColor" stroke="none"><circle cx="5.5" cy="5.5" r="1.7"/><circle cx="12" cy="5.5" r="1.7"/><circle cx="18.5" cy="5.5" r="1.7"/><circle cx="5.5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="18.5" cy="12" r="1.7"/><circle cx="5.5" cy="18.5" r="1.7"/><circle cx="12" cy="18.5" r="1.7"/><circle cx="18.5" cy="18.5" r="1.7"/></g>',
  sliders: '<path d="M4 6h8M18 6h2M4 12h2M12 12h8M4 18h10M20 18h0"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  flag: '<path d="M5 21V4M5 5h12l-2 4 2 4H5"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  external: '<path d="M7 17 17 7M9 7h8v8"/>',
  home: '<path d="M4 11l8-7 8 7v9H4z"/>',
  templates: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5"/>',
  generate: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3"/>',
  archives: '<path d="M3 4h18v5H3zM5 9v10h14V9M10 13h4"/>',
  projects: '<rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/>',
  tasks: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  dashboard: '<path d="M4 20V11M10 20V5M16 20v-7M21 20H3"/>',
  activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
};

type Attr = string | number | boolean | null | undefined | ((e: Event) => void);
type Child = Node | string | null | false | undefined;

function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, Attr> = {}, ...kids: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, String(v));
  }
  for (const c of kids) if (c) el.append(c);
  return el;
}

function icon(name: string, cls = ""): SVGSVGElement {
  const wrap = document.createElement("span");
  wrap.innerHTML = `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] ?? ""}</svg>`;
  return wrap.firstElementChild as SVGSVGElement;
}

export function mountHeaderPreview(host: HTMLElement, logos: PreviewLogos): () => void {
  const root = host.attachShadow({ mode: "open" });
  root.append(h("style", {}, HEADER_PREVIEW_CSS));
  const html = document.documentElement;
  const initialTheme = html.dataset["theme"];
  const state: State = {
    project: "projets", version: "all", width: "desktop", theme: "light", lang: "fr", inProject: true,
    active: { projets: "projects", documents: "home" }, open: null,
  };
  const observers: ResizeObserver[] = [];
  const tr = (k: string): string => DICT[state.lang][k] ?? k;
  const logoOf = (p: ProjectDef): string => logos[p.id];

  // ---------------------------------------------------------------- en-têtes
  function menuItem(label: string, ic: string | null, on: boolean, act: () => void): HTMLElement {
    return h("button", { class: "it" + (on ? " on" : ""), role: "menuitem", onclick: (e) => { e.stopPropagation(); act(); state.open = null; render(); } },
      ic ? icon(ic, "sm") : null, label, h("span", { class: "ck" }, icon("check", "sm")));
  }

  /** Enveloppe d'un déclencheur + menu. `key` identifie le menu ouvert (un seul à la fois). */
  function popWrap(key: string, trigger: HTMLElement, menu: () => HTMLElement, cls = ""): HTMLElement {
    const open = state.open === key;
    trigger.setAttribute("aria-expanded", String(open));
    trigger.setAttribute("aria-haspopup", "menu");
    trigger.addEventListener("click", (e) => { e.stopPropagation(); state.open = open ? null : key; render(); });
    return h("span", { class: "pw " + cls, "data-key": key }, trigger, open ? menu() : null);
  }

  function themeIcon(): string { return state.theme === "dark" ? "moon" : "sun"; }

  function langMenu(key: string, p: ProjectDef, ex: string): HTMLElement {
    const btn = h("button", { class: "ib langb", "aria-label": p.id === "projets" ? DICT[state.lang]["p.language"] ?? "" : DICT[state.lang]["d.languageSwitcher"] ?? "", title: tr("x.language") }, state.lang.toUpperCase());
    return popWrap(key, btn, () => h("div", { class: "menu", role: "menu" }, ...LANGS.map((l) => menuItem(l.name, null, l.code === state.lang, () => { state.lang = l.code; }))), ex);
  }

  function themeMenu(key: string): HTMLElement {
    const btn = h("button", { class: "ib", "aria-label": tr("x.theme"), title: tr("x.theme") }, icon(themeIcon()));
    const items: [Theme | "auto", string][] = [["light", "sun"], ["dark", "moon"], ["auto", "auto"]];
    return popWrap(key, btn, () => h("div", { class: "menu", role: "menu" }, ...items.map(([v, ic]) =>
      menuItem(tr("p.theme_" + v), ic, v === state.theme, () => { if (v !== "auto") { state.theme = v; applyTheme(); } }))));
  }

  function bell(key: string, p: ProjectDef): HTMLElement {
    const btn = h("button", { class: "ib", "aria-label": tr("d.notifications"), title: tr("d.notifications") }, icon("bell"), p.notifications ? h("span", { class: "badge" }, "3") : null);
    return popWrap(key, btn, () => h("div", { class: "menu wide", role: "dialog" },
      h("div", { class: "mh" }, tr("d.notifications"), h("span", { class: "simtag" }, tr("x.simulation"))),
      p.notifications
        ? h("div", {}, ...DEMO_NOTIFICATIONS.map((n) => h("div", { class: "nrow" }, h("i"), n)))
        : h("div", { class: "empty" }, tr("d.noNotifications"))));
  }

  function searchTrigger(key: string, cls: string, withText: boolean): HTMLElement {
    const label = tr("d.search");
    return h("button", { class: cls, "aria-label": label, title: label + " (Ctrl K)", onclick: (e) => { e.stopPropagation(); state.open = key; render(); } },
      icon("search"), withText ? h("span", { class: "tx" }, label) : null, withText ? h("span", { class: "kbd" }, "Ctrl K") : null);
  }

  function navButtons(p: ProjectDef, key: string, withIcons: boolean, cls = "tab"): HTMLElement[] {
    const current = state.active[p.id];
    const out: HTMLElement[] = p.nav.map((n) => {
      const on = n.id === current;
      return h("button", { class: cls, "aria-current": on ? "page" : null, onclick: () => { state.active[p.id] = n.id; if (p.id === "projets") state.inProject = false; state.open = null; render(); } },
        withIcons ? icon(n.icon, "sm") : null, h("span", {}, tr(n.labelKey)));
    });
    if (p.hasConfig && state.inProject) out.push(configMenu(p, key, withIcons, cls));
    return out;
  }

  function configMenu(p: ProjectDef, key: string, withIcons: boolean, cls: string): HTMLElement {
    void p;
    const btn = h("button", { class: cls }, withIcons ? icon("sliders", "sm") : null, h("span", {}, tr("p.config")), icon("chevron", "sm"));
    return popWrap(key + ":cfg", btn, () => h("div", { class: "menu start", role: "menu" },
      menuItem(tr("p.projectSettings"), "sliders", false, () => undefined), menuItem(tr("p.milestones"), "flag", false, () => undefined)));
  }

  function avatar(): HTMLElement {
    return h("span", { class: "av", title: ORG_NAME, "aria-hidden": "true" }, ORG_NAME.charAt(0).toUpperCase());
  }

  function palette(key: string, p: ProjectDef): HTMLElement {
    const list = h("div", {});
    const input = h("input", { type: "search", placeholder: tr(p.searchKey), "aria-label": tr("d.search"), autocomplete: "off" });
    const fill = (): void => {
      list.replaceChildren();
      const q = input.value.trim().toLowerCase();
      let n = 0;
      for (const g of DEMO_RESULTS[p.id]) {
        const items = g.items.filter((s) => s.toLowerCase().includes(q));
        if (!items.length) continue;
        list.append(h("div", { class: "gl" }, tr(g.groupKey)));
        for (const s of items) { n++; list.append(h("button", { class: "r", onclick: () => { state.open = null; render(); } }, s)); }
      }
      if (!n) list.append(h("div", { class: "empty menu", style: "position:static;box-shadow:none;border:0" }, tr("x.noResults")));
    };
    input.addEventListener("input", fill);
    input.addEventListener("keydown", (e) => { if ((e as KeyboardEvent).key === "Escape") { state.open = null; render(); } });
    fill();
    queueMicrotask(() => input.focus());
    return h("div", { class: "scrim", "data-key": key, onclick: (e) => { if (e.target === e.currentTarget) { state.open = null; render(); } } },
      h("div", { class: "pal", role: "dialog", "aria-modal": "true", "aria-label": tr("d.search") },
        h("div", { class: "in" }, icon("search"), input, h("span", { class: "kbd" }, "Esc")), list,
        h("div", { class: "ft" }, h("span", {}, tr("x.simulation")), h("span", {}, "Ctrl K"))));
  }

  function makeTabbar(p: ProjectDef, id: string, cls: string): HTMLElement {
    const tb = h("nav", { class: "tabbar " + cls, "aria-label": tr(p.navLabelKey) },
      ...p.nav.map((n) => h("button", { class: "tb", "aria-current": state.active[p.id] === n.id ? "page" : null, onclick: () => { state.active[p.id] = n.id; if (p.id === "projets") state.inProject = false; state.open = null; render(); } }, icon(n.icon), h("span", { class: "lb" }, tr(n.labelKey)))));
    if (p.hasConfig && state.inProject) {
      const cfgBtn = h("button", { class: "tb" }, icon("sliders"), h("span", { class: "lb" }, tr("p.config")));
      tb.append(popWrap(`${id}:tbcfg`, cfgBtn, () => h("div", { class: "menu up", role: "menu" },
        menuItem(tr("p.projectSettings"), "sliders", false, () => undefined), menuItem(tr("p.milestones"), "flag", false, () => undefined))));
    }
    return tb;
  }

  /** Renvoie [header, ...éléments à poser dans le cadre (palette, barre basse)]. */
  function buildHeader(p: ProjectDef, v: VersionId): HTMLElement[] {
    const id = `${p.id}-${v}`;
    const extra: HTMLElement[] = [];
    const sKey = `${id}:search`;
    if (state.open === sKey) extra.push(palette(sKey, p));
    const header = h("header", { class: `hd ${v === "v2b" ? "v2 v2b" : v}`, style: `--hx-accent: var(${p.accent === "pri" ? "--hx-pri" : "--hx-sec"})` });
    const logo = h("img", { class: "logo", src: logoOf(p), alt: "", width: 34, height: 34 });

    if (v === "v1") {
      const mKey = `${id}:mobile`;
      const burger = h("button", { class: "ib burger", "aria-label": tr("x.openMenu"), onclick: (e) => { e.stopPropagation(); state.open = state.open === mKey ? null : mKey; render(); } }, icon(state.open === mKey ? "close" : "menu"));
      header.append(burger,
        h("span", { class: "brand" }, logo, p.name),
        h("nav", { class: "tabs", "aria-label": tr(p.navLabelKey) }, ...navButtons(p, id, false)),
        h("div", { class: "tools" },
          searchTrigger(sKey, "ib", false), bell(`${id}:bell`, p), themeMenu(`${id}:theme`),
          langMenu(`${id}:lang`, p, "langb-w"), avatar()));
      if (state.open === mKey) {
        const sheet = h("div", { class: "sheet", "data-key": mKey, role: "menu" },
          ...p.nav.map((n) => h("button", { class: "it", "aria-current": state.active[p.id] === n.id ? "page" : null, onclick: () => { state.active[p.id] = n.id; if (p.id === "projets") state.inProject = false; state.open = null; render(); } }, icon(n.icon), tr(n.labelKey))),
          p.hasConfig && state.inProject ? h("button", { class: "it" }, icon("sliders"), tr("p.config")) : null,
          h("div", { class: "langs" }, ...LANGS.map((l) => h("button", { "aria-pressed": String(l.code === state.lang), onclick: () => { state.lang = l.code; render(); } }, l.code.toUpperCase()))));
        header.append(sheet);
      }
    } else if (v === "v2" || v === "v2b") {
      header.append(
        h("div", { class: "z-brand" }, logo, h("span", { class: "bt" }, h("small", {}, "NEXIS"), h("b", {}, p.name))),
        h("nav", { class: "z-nav", "aria-label": tr(p.navLabelKey) }, ...navButtons(p, id, true)),
        h("div", { class: "z-tools" },
          searchTrigger(sKey, "sbtn", true),
          h("div", { class: "clu" }, bell(`${id}:bell`, p), themeMenu(`${id}:theme`), langMenu(`${id}:lang`, p, "")),
          h("span", { class: "sep" }),
          h("span", { class: "org", title: tr("x.org") }, avatar(), h("span", { class: "nm" }, ORG_NAME))));
      if (v === "v2b") extra.push(makeTabbar(p, id, "at900"));
    } else {
      const hubKey = `${id}:hub`;
      const hubBtn = h("button", { class: "hub", "aria-label": tr("x.modules"), title: tr("x.modules") }, icon("grid9"));
      const hub = popWrap(hubKey, hubBtn, () => h("div", { class: "menu wide start", role: "menu" },
        h("div", { class: "mh" }, tr("x.modules"), h("span", { class: "simtag" }, tr("x.simulation"))),
        h("div", { style: "padding:6px" }, ...(Object.values(PROJECTS)).map((m) => h("button", { class: "mod", onclick: () => { state.open = null; render(); } },
          h("img", { src: logoOf(m), alt: "" }), h("span", {}, h("b", {}, m.name), h("small", {}, m.id === p.id ? tr("x.current") : tr("x.open"))),
          m.id === p.id ? h("span", { class: "ck" }, icon("check", "sm")) : null))),
        h("div", { class: "hr" }),
        h("div", { style: "padding:4px 6px 6px" }, h("button", { class: "it" }, icon("external", "sm"), tr("x.nexisHome")))));
      const prefsBtn = h("button", { class: "ib", "aria-label": tr("x.preferences"), title: tr("x.preferences") }, icon("globe"));
      const prefs = popWrap(`${id}:prefs`, prefsBtn, () => h("div", { class: "menu", role: "menu" },
        h("div", { class: "sec" }, tr("x.language")),
        ...LANGS.map((l) => menuItem(l.name, null, l.code === state.lang, () => { state.lang = l.code; })),
        h("div", { class: "hr" }), h("div", { class: "sec" }, tr("x.theme")),
        ...([["light", "sun"], ["dark", "moon"], ["auto", "auto"]] as [Theme | "auto", string][]).map(([t, ic]) =>
          menuItem(tr("p.theme_" + t), ic, t === state.theme, () => { if (t !== "auto") { state.theme = t; applyTheme(); } }))));
      header.append(hub,
        h("span", { class: "prod" }, logo, h("b", {}, p.name), h("i", { title: p.name })),
        h("nav", { class: "pill", "aria-label": tr(p.navLabelKey) }, ...navButtons(p, id, true)),
        h("div", { class: "tools" }, searchTrigger(sKey, "cmd", true), bell(`${id}:bell`, p), prefs,
          h("span", { class: "org", title: tr("x.org") }, avatar(), h("span", { class: "nm" }, ORG_NAME))));
      extra.push(makeTabbar(p, id, ""));
    }
    return [header, ...extra];
  }

  // ---------------------------------------------------------------- comparateur
  const stage = h("div", { class: "stage" });
  const barEl = h("div", { class: "bar" });
  root.append(barEl, stage);

  function seg<T extends string>(label: string, cur: T, opts: [T, string][], set: (v: T) => void): HTMLElement {
    return h("div", { class: "grp" }, h("span", { class: "lbl" }, label),
      h("div", { class: "seg", role: "group", "aria-label": label }, ...opts.map(([v, t]) => h("button", { "aria-pressed": String(v === cur), onclick: () => { state.open = null; set(v); render(); } }, t))));
  }

  function buildBar(): void {
    barEl.replaceChildren(
      seg<ProjectId | "both">("Projet", state.project, [["projets", "A · Projets"], ["documents", "B · Docs"], ["both", "Les deux"]], (v) => { state.project = v; }),
      seg<VersionId | "all">("Version", state.version, [["v1", "1 · Compact"], ["v2", "2 · SaaS"], ["v2b", "2b · SaaS ajusté"], ["v3", "3 · Multi-projets"], ["all", "Toutes"]], (v) => { state.version = v; }),
      seg<Width>("Largeur simulée", state.width, [["desktop", "Ordinateur"], ["tablet", "Tablette 820"], ["mobile", "Mobile 390"]], (v) => { state.width = v; }),
      seg<Theme>("Thème", state.theme, [["light", "Clair"], ["dark", "Sombre"]], (v) => { state.theme = v; applyTheme(); }),
      h("div", { class: "grp" }, h("span", { class: "lbl" }, "Langue des libellés"),
        h("select", { "aria-label": "Langue", onchange: (e) => { state.lang = (e.target as HTMLSelectElement).value as Lang; render(); } },
          ...LANGS.map((l) => h("option", { value: l.code, selected: l.code === state.lang }, l.name)))),
      h("div", { class: "grp" }, h("span", { class: "lbl" }, "Projets : contexte"),
        h("label", { class: "chk" }, h("input", { type: "checkbox", checked: state.inProject, onchange: (e) => { state.inProject = (e.target as HTMLInputElement).checked; if (state.inProject) state.active["projets"] = "projects"; render(); } }), "Un projet est ouvert (menu Configuration)")),
      h("div", { class: "sim" }, "Maquette isolée : recherche, notifications, modules, langue et thème sont des simulations visuelles. Aucune donnée réelle, aucun appel API."));
  }

  function applyTheme(): void {
    html.dataset["theme"] = state.theme;
    if (state.theme === "dark") host.setAttribute("data-dark", ""); else host.removeAttribute("data-dark");
  }

  function card(p: ProjectDef, v: VersionId): HTMLElement {
    const meta = VERSIONS.find((x) => x.id === v)!;
    const [header, ...extra] = buildHeader(p, v) as [HTMLElement, ...HTMLElement[]];
    const hh = h("span", { class: "hh" }, "…");
    const vp = h("div", { class: "vp", dir: state.lang === "ar" ? "rtl" : "ltr", lang: state.lang },
      header,
      h("div", { class: "page", "aria-hidden": "true" }, h("div", { class: "sk t" }), h("div", { class: "sk s" }),
        h("div", { class: "row" }, h("div", { class: "sk" }), h("div", { class: "sk" }), h("div", { class: "sk" })),
        h("div", { class: "tbl" }, ...Array.from({ length: 5 }, (_, i) => h("div", { class: "sk", style: `width:${92 - i * 11}%` })))),
      ...extra);
    const ro = new ResizeObserver(() => {
      const bar = vp.querySelector<HTMLElement>(".tabbar");
      const barH = bar && getComputedStyle(bar).display !== "none" ? Math.round(bar.getBoundingClientRect().height) : 0;
      hh.textContent = `Header ${Math.round(header.getBoundingClientRect().height)} px` + (barH ? ` + barre basse ${barH} px` : "");
    });
    ro.observe(header); ro.observe(vp);
    observers.push(ro);
    return h("section", { class: `card w-${state.width}`, "aria-label": `${meta.title} — ${p.name}` },
      h("div", { class: "card-h" }, h("h3", {}, meta.title), h("span", { class: "meta" }, `${p.name} · ${meta.concept}`), hh),
      vp,
      h("details", {}, h("summary", {}, "Atouts et limites"),
        h("ul", {}, ...meta.pros.map((t) => h("li", {}, "＋ " + t)), ...meta.cons.map((t) => h("li", {}, "− " + t)))));
  }

  function render(): void {
    observers.splice(0).forEach((o) => o.disconnect());
    buildBar();
    const projects = state.project === "both" ? (["projets", "documents"] as ProjectId[]) : [state.project];
    const versions = state.version === "all" ? (["v1", "v2", "v2b", "v3"] as VersionId[]) : [state.version];
    stage.replaceChildren(...versions.flatMap((v) => projects.map((pid) => card(PROJECTS[pid], v))));
  }

  // Clic hors du menu ouvert : on le ferme. (Les déclencheurs et les entrées de menu arrêtent la propagation.)
  const onDocClick = (e: Event): void => {
    if (!state.open) return;
    const inside = e.composedPath().some((n) => n instanceof HTMLElement && n.dataset["key"] === state.open);
    if (!inside) { state.open = null; render(); }
  };
  root.addEventListener("click", onDocClick);
  const onKey = (e: KeyboardEvent): void => { if (e.key === "Escape" && state.open) { state.open = null; render(); } };
  document.addEventListener("keydown", onKey);

  applyTheme();
  render();
  return () => {
    observers.forEach((o) => o.disconnect());
    document.removeEventListener("keydown", onKey);
    if (initialTheme === undefined) delete html.dataset["theme"]; else html.dataset["theme"] = initialTheme;
  };
}
