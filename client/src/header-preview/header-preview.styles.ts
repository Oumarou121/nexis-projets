// CSS de la maquette des headers. Injecté dans un Shadow DOM : aucun style de l'application n'y entre
// (et rien n'en sort). Seules les variables CSS du thème de chaque projet traversent la frontière :
// NEXIS Projets (--pri, --card, --tx…) et NEXIS Documents (--primary, --surface, --text-900…).
export const HEADER_PREVIEW_CSS = String.raw`
:host {
  display: block; color: var(--hx-tx); font: 14px/1.45 var(--hx-sans);
  --hx-display: Sora, "DM Sans", system-ui, sans-serif;
  --hx-sans: "DM Sans", "Segoe UI", system-ui, -apple-system, sans-serif;
  --hx-pri: var(--pri, var(--primary, #0b7482));
  --hx-pri-h: var(--pri-h, var(--primary-dark, #095f6b));
  --hx-pri-soft: var(--pri-soft, var(--primary-light, #def1f3));
  --hx-on-pri: var(--on-pri, var(--on-primary, #fff));
  --hx-sec: var(--sec, var(--nx-secondary, #7b3f74));
  --hx-sec-soft: var(--sec-soft, var(--nx-secondary-soft, #f3e6f1));
  --hx-on-sec: var(--on-sec, var(--hx-on-sec-fb, #fff));
  --hx-bg: var(--bg, var(--surface-2, #f3f6f7));
  --hx-card: var(--card, var(--surface, #fff));
  --hx-tx: var(--tx, var(--text-900, #10202b));
  --hx-mut: var(--mut, var(--text-600, #53656f));
  --hx-bd: var(--bd, var(--border, #dbe3e6));
  --hx-bd-s: var(--bd-s, var(--border-strong, #c9d4d9));
  --hx-hov: var(--hov, var(--surface-3, #e8eef0));
  --hx-sh: var(--sh-2, var(--shadow-md, 0 4px 14px rgba(16,32,43,.12)));
  --hx-sh3: var(--sh-3, var(--shadow-lg, 0 16px 40px rgba(16,32,43,.22)));
  --hx-bad: var(--bad, var(--danger, #c9302f));
}
:host([data-dark]) { --hx-on-sec-fb: #2a0f27; }
* { box-sizing: border-box; }
button, input, select { font: inherit; color: inherit; margin: 0; }
button { background: none; border: 0; padding: 0; cursor: pointer; }
svg.ic { width: 18px; height: 18px; flex: none; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
svg.ic.sm { width: 15px; height: 15px; }
:focus-visible { outline: 2px solid var(--hx-pri); outline-offset: 2px; }

/* ======================= Barre d'outils de la maquette ======================= */
.bar { position: sticky; top: 0; z-index: 50; display: flex; flex-wrap: wrap; gap: 10px 22px; align-items: flex-end; padding: 12px 20px; background: var(--hx-card); border-bottom: 1px solid var(--hx-bd); }
.bar .grp { display: grid; gap: 4px; }
.bar .lbl { font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--hx-mut); }
.seg { display: inline-flex; gap: 2px; padding: 3px; border: 1px solid var(--hx-bd-s); border-radius: 10px; background: var(--hx-bg); }
.seg button { padding: 6px 12px; border-radius: 7px; font-weight: 500; color: var(--hx-mut); white-space: nowrap; }
.seg button:hover { color: var(--hx-tx); }
.seg button[aria-pressed="true"] { background: var(--hx-pri); color: var(--hx-on-pri); font-weight: 600; }
.bar select { height: 34px; padding: 0 10px; border: 1px solid var(--hx-bd-s); border-radius: 8px; background: var(--hx-card); }
.chk { display: inline-flex; align-items: center; gap: 8px; height: 34px; cursor: pointer; }
.sim { margin-inline-start: auto; align-self: center; max-width: 380px; padding: 6px 10px; border-radius: 8px; background: var(--hx-sec-soft); color: var(--hx-sec); font-size: 12.5px; }
.stage { display: flex; flex-wrap: wrap; gap: 22px; justify-content: center; align-items: flex-start; padding: 22px 20px 48px; }
.card { width: 100%; min-width: 0; border: 1px solid var(--hx-bd); border-radius: 14px; background: var(--hx-card); overflow: hidden; box-shadow: var(--hx-sh); }
.card.w-tablet { width: 820px; max-width: 100%; }
.card.w-mobile { width: 390px; max-width: 100%; }
.card-h { display: flex; flex-wrap: wrap; gap: 4px 14px; align-items: baseline; padding: 12px 16px; border-bottom: 1px solid var(--hx-bd); }
.card-h h3 { margin: 0; font: 700 15px var(--hx-display); }
.card-h .meta { color: var(--hx-mut); font-size: 12.5px; }
.card-h .hh { margin-inline-start: auto; padding: 1px 8px; border-radius: 99px; background: var(--hx-pri-soft); color: var(--hx-pri); font-size: 12px; font-weight: 700; white-space: nowrap; }
.card details { padding: 0 16px; border-top: 1px solid var(--hx-bd); font-size: 13px; color: var(--hx-mut); }
.card summary { padding: 9px 0; cursor: pointer; font-weight: 600; color: var(--hx-tx); }
.card details ul { margin: 0 0 12px; padding-inline-start: 18px; }
.card details li { margin: 2px 0; }

/* ----- Cadre de démonstration : le header + un contenu neutre ----- */
.vp { position: relative; overflow: hidden; height: 400px; container-type: inline-size; background: var(--hx-bg); color: var(--hx-tx); }
.card.w-mobile .vp { height: 540px; }
.page { padding: 22px 24px; display: grid; gap: 16px; }
.sk { border-radius: 6px; background: color-mix(in srgb, var(--hx-tx) 9%, transparent); }
.page .t { height: 22px; width: 38%; }
.page .s { height: 12px; width: 58%; }
.page .row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.page .row .sk { height: 72px; border-radius: 12px; }
.page .tbl { display: grid; gap: 8px; padding: 14px; border: 1px solid var(--hx-bd); border-radius: 12px; background: var(--hx-card); }
.page .tbl .sk { height: 11px; }
@container (max-width: 560px) { .page { padding: 16px; } .page .row { grid-template-columns: 1fr 1fr; } .page .row .sk:last-child { display: none; } }

/* ======================= Éléments communs des headers ======================= */
.hd { position: relative; z-index: 20; display: flex; align-items: center; background: var(--hx-card); color: var(--hx-tx); }
.hd img.logo { object-fit: contain; flex: none; }
.ib { display: inline-grid; place-items: center; position: relative; color: var(--hx-mut); border-radius: 8px; flex: none; }
.ib:hover, .ib[aria-expanded="true"] { background: var(--hx-hov); color: var(--hx-tx); }
.badge { position: absolute; top: 3px; inset-inline-end: 3px; min-width: 16px; height: 16px; padding: 0 4px; border-radius: 99px; background: var(--hx-bad); color: #fff; font-size: 10px; font-weight: 700; line-height: 16px; text-align: center; }
.kbd { padding: 1px 6px; border: 1px solid var(--hx-bd-s); border-radius: 5px; font-size: 11px; color: var(--hx-mut); background: var(--hx-card); white-space: nowrap; }
.av { display: inline-grid; place-items: center; flex: none; border-radius: 50%; background: var(--hx-sec); color: var(--hx-on-sec); font-weight: 700; user-select: none; }
.tab { white-space: nowrap; }
.tab svg.ic { flex: none; }
.pw { position: relative; display: inline-flex; flex: none; }
.menu { position: absolute; top: calc(100% + 6px); inset-inline-end: 0; z-index: 60; min-width: 190px; padding: 4px; border: 1px solid var(--hx-bd); border-radius: 12px; background: var(--hx-card); box-shadow: var(--hx-sh); color: var(--hx-tx); animation: pop .12s ease-out; text-align: start; }
.menu.start { inset-inline-end: auto; inset-inline-start: 0; }
.menu.up { top: auto; bottom: calc(100% + 8px); }
.menu .it { display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 10px; border-radius: 8px; text-align: start; color: var(--hx-tx); white-space: nowrap; }
.menu .it:hover { background: var(--hx-hov); }
.menu .it.on { color: var(--hx-pri); font-weight: 600; }
.menu .it .ck { margin-inline-start: auto; opacity: 0; }
.menu .it.on .ck { opacity: 1; }
.menu .sec { padding: 8px 10px 4px; font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--hx-mut); }
.menu .hr { height: 1px; margin: 4px 0; background: var(--hx-bd); }
.menu.wide { width: 320px; padding: 0; overflow: hidden; }
.menu .mh { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border-bottom: 1px solid var(--hx-bd); font-weight: 700; }
.menu .nrow { display: flex; gap: 10px; padding: 11px 14px; border-bottom: 1px solid var(--hx-bd); font-size: 13px; }
.menu .nrow i { flex: none; width: 8px; height: 8px; margin-top: 6px; border-radius: 50%; background: var(--hx-pri); }
.menu .empty { padding: 22px 14px; text-align: center; color: var(--hx-mut); }
.simtag { padding: 1px 7px; border-radius: 99px; background: var(--hx-sec-soft); color: var(--hx-sec); font-size: 10.5px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
@keyframes pop { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .menu { animation: none; } }
.mod { display: flex; align-items: center; gap: 12px; width: 100%; padding: 9px 10px; border-radius: 10px; text-align: start; }
.mod:hover { background: var(--hx-hov); }
.mod img { width: 30px; height: 28px; object-fit: contain; }
.mod b { display: block; line-height: 1.2; }
.mod small { color: var(--hx-mut); font-size: 12px; }
.mod .ck { margin-inline-start: auto; color: var(--hx-pri); }

/* Palette de recherche (simulation) */
.scrim { position: absolute; inset: 0; z-index: 80; background: rgba(8, 20, 26, .45); display: flex; justify-content: center; align-items: flex-start; padding: 56px 12px 0; }
.pal { width: min(560px, 100%); max-height: 100%; overflow: auto; border: 1px solid var(--hx-bd); border-radius: 14px; background: var(--hx-card); box-shadow: var(--hx-sh3); }
.pal .in { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-bottom: 1px solid var(--hx-bd); color: var(--hx-mut); }
.pal input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--hx-tx); }
.pal .gl { padding: 10px 14px 4px; font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--hx-mut); }
.pal .r { display: block; width: 100%; padding: 9px 14px; text-align: start; }
.pal .r:hover { background: var(--hx-hov); }
.pal .ft { display: flex; justify-content: space-between; padding: 8px 14px; border-top: 1px solid var(--hx-bd); font-size: 12px; color: var(--hx-mut); }

/* Panneau mobile (hamburger) */
.sheet { position: absolute; top: 100%; inset-inline: 0; z-index: 55; padding: 8px 12px 12px; border-bottom: 1px solid var(--hx-bd); background: var(--hx-card); box-shadow: var(--hx-sh); }
.sheet .it { display: flex; align-items: center; gap: 12px; width: 100%; padding: 11px 10px; border-radius: 8px; text-align: start; color: var(--hx-mut); font-weight: 500; }
.sheet .it[aria-current] { background: var(--hx-pri-soft); color: var(--hx-pri); font-weight: 600; }
.sheet .langs { display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 10px 2px; }
.sheet .langs button { padding: 5px 12px; border: 1px solid var(--hx-bd-s); border-radius: 99px; font-size: 12.5px; font-weight: 600; color: var(--hx-mut); }
.sheet .langs button[aria-pressed="true"] { background: var(--hx-pri); border-color: var(--hx-pri); color: var(--hx-on-pri); }

/* ======================= VERSION 1 — compact et minimaliste (48 px) ======================= */
.v1 { height: 48px; padding-inline: 12px; gap: 2px; border-bottom: 1px solid var(--hx-bd); }
.v1 .brand { display: flex; align-items: center; gap: 8px; margin-inline-end: 10px; font: 700 14.5px var(--hx-display); letter-spacing: -.01em; white-space: nowrap; }
.v1 .brand img { height: 24px; width: 28px; }
.v1 .tabs { display: flex; gap: 2px; min-width: 0; }
.v1 .tab { display: inline-flex; align-items: center; gap: 4px; height: 32px; padding: 0 10px; border-radius: 6px; color: var(--hx-mut); font-size: 13.5px; font-weight: 500; }
.v1 .tab:hover { background: var(--hx-hov); color: var(--hx-tx); }
.v1 .tab[aria-current], .v1 .tab[aria-expanded="true"] { background: var(--hx-pri-soft); color: var(--hx-pri); }
.v1 .tools { margin-inline-start: auto; display: flex; align-items: center; gap: 2px; }
.v1 .ib { width: 32px; height: 32px; }
.v1 .langb { width: auto; padding: 0 8px; font-size: 12.5px; font-weight: 700; letter-spacing: .03em; }
.v1 .av { width: 24px; height: 24px; margin-inline-start: 6px; font-size: 12px; }
.v1 .burger { display: none; }
@container (max-width: 719px) {
  .v1 .tabs, .v1 .langb-w { display: none; }
  .v1 .burger { display: inline-grid; margin-inline-end: 2px; }
  .v1 .brand { margin-inline-end: auto; }
  .v1 .tools { margin-inline-start: 0; }
}

/* ======================= VERSION 2 — SaaS structuré (64 px) ======================= */
.v2 { min-height: 64px; flex-wrap: wrap; border-bottom: 1px solid var(--hx-bd); }
.v2 .z-brand { align-self: stretch; display: flex; align-items: center; gap: 12px; padding-inline: 20px 22px; border-inline-end: 1px solid var(--hx-bd); background: color-mix(in srgb, var(--hx-bg) 70%, var(--hx-card)); }
.v2 .z-brand img { height: 34px; width: 38px; }
.v2 .bt { display: grid; line-height: 1.1; }
.v2 .bt small { font-size: 10px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: var(--hx-mut); }
.v2 .bt b { font: 700 17px var(--hx-display); letter-spacing: -.01em; }
.v2 .z-nav { align-self: stretch; display: flex; align-items: stretch; gap: 2px; padding-inline: 10px; min-width: 0; overflow-x: auto; scrollbar-width: none; }
.v2 .z-nav::-webkit-scrollbar { display: none; }
.v2 .tab { position: relative; display: inline-flex; align-items: center; gap: 8px; padding: 0 12px; color: var(--hx-mut); font-weight: 500; }
.v2 .tab:hover { color: var(--hx-tx); background: color-mix(in srgb, var(--hx-hov) 55%, transparent); }
.v2 .tab::after { content: ""; position: absolute; inset-inline: 10px; bottom: -1px; height: 3px; border-radius: 3px 3px 0 0; background: transparent; }
.v2 .tab[aria-current], .v2 .tab[aria-expanded="true"] { color: var(--hx-tx); font-weight: 600; }
.v2 .tab[aria-current]::after { background: var(--hx-pri); }
.v2 .tab[aria-current] svg.ic { color: var(--hx-pri); }
.v2 .z-tools { margin-inline-start: auto; display: flex; align-items: center; gap: 8px; padding-inline: 14px 20px; }
.v2 .sbtn { display: inline-flex; align-items: center; gap: 8px; height: 38px; width: 220px; padding: 0 8px 0 12px; border: 1px solid var(--hx-bd-s); border-radius: 10px; background: var(--hx-bg); color: var(--hx-mut); text-align: start; }
.v2 .sbtn:hover { border-color: var(--hx-mut); }
.v2 .sbtn span.tx { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.v2 .clu { display: flex; gap: 2px; padding: 3px; border: 1px solid var(--hx-bd); border-radius: 10px; }
.v2 .ib { width: 34px; height: 32px; border-radius: 7px; }
.v2 .langb { width: auto; padding: 0 8px; font-size: 12.5px; font-weight: 700; letter-spacing: .03em; }
.v2 .sep { width: 1px; height: 28px; background: var(--hx-bd); margin-inline: 6px; }
.v2 .org { display: flex; align-items: center; gap: 9px; color: var(--hx-mut); font-size: 13.5px; white-space: nowrap; }
.v2 .org .av { width: 32px; height: 32px; font-size: 13px; }
@container (max-width: 1279px) { .v2 .sbtn { width: 38px; padding: 0; justify-content: center; } .v2 .sbtn .tx, .v2 .sbtn .kbd { display: none; } }
@container (max-width: 1099px) { .v2 .org .nm { display: none; } .v2 .tab svg.ic { display: none; } .v2 .z-brand { padding-inline: 16px 18px; } .v2 .z-tools { padding-inline: 8px 14px; } }
@container (max-width: 899px) {
  .v2 .z-brand { border-inline-end: 0; background: transparent; padding-block: 8px; }
  .v2 .bt small { display: none; }
  .v2 .z-brand img { height: 30px; width: 34px; }
  .v2 .z-tools { padding-block: 8px; }
  .v2 .z-nav { order: 3; flex: 0 0 100%; height: 44px; border-top: 1px solid var(--hx-bd); padding-inline: 12px; }
  .v2 .tab svg.ic { display: block; }
  .v2 .tab::after { bottom: 0; }
}
@container (max-width: 599px) {
  .v2 .sep { display: none; }
  .v2 .z-brand { padding-inline: 12px 6px; gap: 10px; }
  .v2 .z-tools { padding-inline: 4px 10px; gap: 4px; }
  .v2 .clu { border: 0; padding: 0; }
  .v2 .tab svg.ic { display: none; }
  .v2 .tab { padding: 0 10px; }
}

/* ----- 2b : V2 + barre d'onglets basse sous 900 px (pas de 2e ligne) ----- */
@container (max-width: 899px) {
  .v2.v2b .z-nav { display: none; }
  .v2.v2b { min-height: 56px; }
  .tabbar.at900 { display: flex; }
}

/* ======================= VERSION 3 — écosystème multi-projets (56 px) ======================= */
.v3 { height: 56px; padding-inline: 12px 14px; gap: 10px; border-top: 3px solid var(--hx-accent); border-bottom: 1px solid var(--hx-bd); }
.v3 .hub { display: grid; place-items: center; width: 36px; height: 36px; border: 1px solid var(--hx-bd-s); border-radius: 10px; background: var(--hx-bg); color: var(--hx-mut); }
.v3 .hub:hover, .v3 .hub[aria-expanded="true"] { color: var(--hx-tx); border-color: var(--hx-mut); }
.v3 .prod { display: flex; align-items: center; gap: 9px; height: 32px; padding-inline-end: 12px; border-inline-end: 1px solid var(--hx-bd); white-space: nowrap; }
.v3 .prod img { height: 28px; width: 32px; }
.v3 .prod b { font: 700 16px var(--hx-display); letter-spacing: -.01em; }
.v3 .prod i { width: 7px; height: 7px; border-radius: 50%; background: var(--hx-accent); }
.v3 .pill { display: flex; gap: 2px; margin-inline: auto; padding: 3px; border: 1px solid var(--hx-bd); border-radius: 99px; background: var(--hx-bg); min-width: 0; }
.v3 .tab { display: inline-flex; align-items: center; gap: 7px; height: 32px; padding: 0 14px; border-radius: 99px; color: var(--hx-mut); font-weight: 500; }
.v3 .tab:hover { color: var(--hx-tx); }
.v3 .tab[aria-current], .v3 .tab[aria-expanded="true"] { background: var(--hx-card); color: var(--hx-pri); font-weight: 600; box-shadow: 0 1px 3px rgba(16, 32, 43, .18), 0 0 0 1px var(--hx-bd); }
.v3 .tools { display: flex; align-items: center; gap: 6px; }
.v3 .ib { width: 36px; height: 36px; border-radius: 50%; }
.v3 .cmd { display: inline-flex; align-items: center; gap: 8px; height: 36px; padding: 0 8px 0 12px; border: 1px solid var(--hx-bd-s); border-radius: 99px; background: var(--hx-bg); color: var(--hx-mut); }
.v3 .cmd:hover { border-color: var(--hx-mut); color: var(--hx-tx); }
.v3 .org { display: flex; align-items: center; gap: 8px; color: var(--hx-mut); font-size: 13.5px; }
.v3 .av { width: 34px; height: 34px; font-size: 13px; }
.tabbar { display: none; position: absolute; inset-inline: 0; bottom: 0; z-index: 30; padding: 6px 4px 8px; border-top: 1px solid var(--hx-bd); background: var(--hx-card); }
.tabbar .tb { position: relative; display: flex; flex: 1 1 0; flex-direction: column; align-items: center; gap: 2px; min-width: 0; width: 100%; min-height: 44px; padding: 4px 2px; font-size: 10.5px; color: var(--hx-mut); }
.tabbar .pw { flex: 1 1 0; min-width: 0; }
.tabbar .lb { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tabbar .tb[aria-current], .tabbar .tb[aria-expanded="true"] { color: var(--hx-pri); font-weight: 600; }
@container (max-width: 1279px) { .v3 .cmd .tx, .v3 .org .nm { display: none; } .v3 .cmd { padding: 0; width: 36px; justify-content: center; } }
@container (max-width: 1059px) { .v3 .tab svg.ic { display: none; } .v3 .tab { padding: 0 12px; } }
@container (max-width: 859px) {
  .v3 .pill { display: none; }
  .v3 .prod { border-inline-end: 0; margin-inline-end: auto; }
  .tabbar { display: flex; }
  .v3 .cmd .kbd { display: none; }
}
`;
