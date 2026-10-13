import "./stages.css";
import "./confirm.css";
import { useEffect, useRef, useState } from "react";
import { usePerms } from "./perms.js";
import { PRIORITY, PRIORITY_COLOR, STATUS_COLOR, stageColor, TASK_STATUS, isLate, memberName, shortDate } from "./labels.js";

/* ---------- Icônes (SVG, héritent de currentColor) ---------- */
const PATHS = {
  kanban: "M4 5h4v14H4zM10 5h4v9h-4zM16 5h4v11h-4z",
  list: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
  gantt: "M4 6h8M8 12h10M6 18h9",
  calendar: "M5 6h14a1 1 0 011 1v12a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1zM4 10h16M8 3v4M16 3v4",
  chart: "M5 20V10M12 20V4M19 20v-7",
  plus: "M12 5v14M5 12h14",
  search: "M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-4.3-4.3",
  chevron: "M6 9l6 6 6-6",
  chevronR: "M9 6l6 6-6 6",
  close: "M6 6l12 12M18 6L6 18",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  comment: "M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z",
  clip: "M20 11l-8.5 8.5a5 5 0 01-7-7L13 4a3.5 3.5 0 015 5l-8.5 8.5a2 2 0 01-3-3L14 7",
  subtask: "M5 4v8a3 3 0 003 3h8M13 11l4 4-4 4",
  clock: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2",
  flag: "M5 21V4M5 4h11l-2 4 2 4H5",
  gear: "M12 15a3 3 0 100-6 3 3 0 000 6zM19 12a7 7 0 00-.1-1.2l2-1.5-2-3.4-2.4 1a7 7 0 00-2-1.2L14 3h-4l-.4 2.7a7 7 0 00-2 1.2l-2.4-1-2 3.4 2 1.5A7 7 0 005 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.4-1a7 7 0 002 1.2L10 21h4l.4-2.7a7 7 0 002-1.2l2.4 1 2-3.4-2-1.5c.1-.4.2-.8.2-1.2z",
  download: "M12 4v11M7.5 11l4.5 4.5 4.5-4.5M5 20h14",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  expand: "M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7",
  filter: "M4 5h16l-6 8v6l-4-2v-4z",
  check: "M5 12.5l4.5 4.5L19 7.5",
  back: "M15 18l-6-6 6-6",
  home: "M4 11l8-7 8 7v8a1 1 0 01-1 1h-4v-6H9v6H5a1 1 0 01-1-1z",
  inbox: "M4 13l2-8h12l2 8M4 13v6h16v-6M4 13h5a3 3 0 006 0h5",
  pulse: "M3 12h4l3-8 4 16 3-8h4",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  sun: "M12 16a4 4 0 100-8 4 4 0 000 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  moon: "M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z",
  monitor: "M4 5h16a1 1 0 011 1v9a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1zM8 20h8M12 16v4",
  users: "M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2.5 20a6.5 6.5 0 0113 0M16 4.3a3.5 3.5 0 010 6.4M18 14a6.5 6.5 0 013.5 6",
  globe: "M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z",
  bell: "M6 17V11a6 6 0 1112 0v6l2 2H4zM10 21a2 2 0 004 0",
  alert: "M12 3.5L2.5 20h19L12 3.5zM12 10v4.5M12 17.5h.01",
  refresh: "M20 5v5h-5M4 19v-5h5M5.6 9A7 7 0 0118.4 7.6L20 10M18.4 15A7 7 0 015.6 16.4L4 14",
  lock: "M7 11V8a5 5 0 0110 0v3M6 11h12a1 1 0 011 1v7a1 1 0 01-1 1H6a1 1 0 01-1-1v-7a1 1 0 011-1z",
};

export function Icon({ name, size = 16, className = "", ...rest }) {
  return (
    <svg className={`ic ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={name === "more" ? 3.2 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      <path d={PATHS[name]} />
    </svg>
  );
}

/* ---------- Avatar (initiales, couleur stable) ---------- */
const hue = (s) => {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
};
const initials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";

export function Avatar({ member, name, size = 24, title }) {
  const label = name ?? (member ? memberName(member) : "");
  if (!label) return <span className="av av-empty" style={{ width: size, height: size }} title="Non assignée" />;
  return (
    <span className="av" style={{ width: size, height: size, fontSize: size * 0.42, background: `hsl(${hue(label)} 55% 46%)` }} title={title ?? label}>
      {initials(label)}
    </span>
  );
}

/* ---------- Popover : se ferme au clic extérieur / Échap ---------- */
export function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const away = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return { open, setOpen, ref };
}

/** Menu générique : `trigger` = contenu du bouton, `items` = [{label, onClick, icon?, danger?, active?}]. */
export function Menu({ trigger, items, label, align = "right", className = "" }) {
  const { open, setOpen, ref } = usePopover();
  return (
    <span className={`pop ${className}`} ref={ref}>
      <button type="button" className="icon-btn" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>
        {trigger}
      </button>
      {open && (
        <div className={`menu ${align}`} role="menu">
          {items.map((it) => (
            <button key={it.label} role="menuitem" type="button" className={`mi ${it.danger ? "danger" : ""} ${it.active ? "active" : ""}`} onClick={(e) => { e.stopPropagation(); setOpen(false); it.onClick(); }}>
              {it.icon && <Icon name={it.icon} size={15} />}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

/* ---------- Statut : pastille cliquable avec menu (remplace le <select>) ---------- */
export function StatusPill({ status, stageId, stages, label, color, onChange, compact = false }) {
  const { open, setOpen, ref } = usePopover();
  const { canEdit } = usePerms();
  // Étapes du projet quand on les connaît ; sinon les 3 catégories (ex. « Mes tâches », multi-projets :
  // `label` affiche alors le nom de l'étape actuelle, et choisir une catégorie vise sa première étape).
  const byStage = !!stages?.length;
  const options = byStage
    ? stages.map((s) => ({ value: s.id, label: s.name, color: stageColor(s) }))
    : Object.entries(TASK_STATUS).map(([v, l]) => ({ value: v, label: l, color: STATUS_COLOR[v] }));
  const current = byStage ? stageId : status;
  const cur = options.find((o) => o.value === current) ?? { label: label ?? TASK_STATUS[status] ?? status, color: color ?? STATUS_COLOR[status] };
  const text = !byStage && label ? label : cur.label;
  return (
    <span className="pop" ref={ref}>
      <button type="button" className={`spill ${compact ? "compact" : ""}`} aria-label={`Statut : ${text}`} aria-haspopup="menu" aria-expanded={open} disabled={!canEdit} onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>
        <i style={{ background: cur.color }} />
        {!compact && text}
        {!compact && canEdit && <Icon name="chevron" size={12} />}
      </button>
      {open && canEdit && (
        <div className="menu left" role="menu">
          {options.map((o) => (
            <button key={o.value} role="menuitemradio" aria-checked={o.value === current} type="button" className={`mi ${o.value === current ? "active" : ""}`} onClick={(e) => { e.stopPropagation(); setOpen(false); if (o.value !== current) onChange(o.value); }}>
              <i className="dot" style={{ background: o.color }} />
              {o.label}
              {o.value === current && <Icon name="check" size={14} className="push" />}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

/* ---------- Priorité : étoile à la Odoo (haute/urgente = remplie) ---------- */
export function PriorityStar({ priority, onChange }) {
  const { canEdit } = usePerms();
  const hot = priority === "high" || priority === "urgent";
  return (
    <button
      type="button"
      className={`star ${hot ? "on" : ""}`}
      style={hot ? { color: PRIORITY_COLOR[priority] } : undefined}
      aria-label={`Priorité ${PRIORITY[priority]}`}
      disabled={!canEdit}
      title={`Priorité ${PRIORITY[priority].toLowerCase()}${onChange && canEdit ? " — cliquer pour changer" : ""}`}
      onClick={(e) => { e.stopPropagation(); onChange?.(hot ? "medium" : "high"); }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill={hot ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9 6.8 19.7l1-5.9L3.5 9.7l5.9-.8z" /></svg>
    </button>
  );
}

/* ---------- Barre de progression d'une colonne (comme Odoo) ----------
   Vert : dans les temps ou terminée · rouge : en retard · gris : sans échéance. */
export function StatusBar({ tasks }) {
  const late = tasks.filter(isLate).length;
  const none = tasks.filter((t) => !isLate(t) && !t.dueDate && t.status !== "done").length;
  const ok = tasks.length - late - none;
  const title = `${ok} dans les temps ou terminée${ok > 1 ? "s" : ""} · ${late} en retard · ${none} sans échéance`;
  return (
    <div className="sbar" role="img" aria-label={title} title={title}>
      {ok > 0 && <i style={{ flex: ok, background: "var(--ok)" }} />}
      {late > 0 && <i style={{ flex: late, background: "var(--bad)" }} />}
      {none > 0 && <i style={{ flex: none, background: "var(--bd-s)" }} />}
    </div>
  );
}

/* ---------- Date : texte court lisible, sélecteur natif en surimpression invisible ---------- */
export function DateField({ value, onChange, label, late = false, placeholder = "Définir" }) {
  const { canEdit } = usePerms();
  return (
    <span className={`datef ${value ? "" : "empty"} ${late ? "late" : ""}`}>
      <Icon name="calendar" size={14} />
      <span>{value ? shortDate(value) : placeholder}</span>
      <input type="date" aria-label={label} disabled={!canEdit} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} onClick={(e) => e.currentTarget.showPicker?.()} />
    </span>
  );
}

/* ---------- Entrée de menu avec sous-menu déroulant (Reporting, Configuration) ---------- */
export function NavMenu({ label, icon, items, active }) {
  const { open, setOpen, ref } = usePopover();
  return (
    <span className="pop" ref={ref}>
      <button type="button" className={`nl ${active ? "on" : ""}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        {icon && <Icon name={icon} size={16} />} {label} <Icon name="chevron" size={12} />
      </button>
      {open && (
        <div className="menu left" role="menu">
          {items.map((it) => (
            <button key={it.label} role="menuitem" type="button" disabled={it.disabled} title={it.hint} className={`mi ${it.active ? "active" : ""}`} onClick={() => { setOpen(false); it.onClick(); }}>
              {it.icon && <Icon name={it.icon} size={15} />}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

/* ---------- Choix de la couleur d'un projet (5 teintes du thème) ---------- */
export function ColorPicker({ value, onChange, disabled = false, name = "pj-color" }) {
  return (
    <div className="pj-sw" role="radiogroup" aria-label="Couleur du projet">
      {[0, 1, 2, 3, 4].map((i) => (
        <label key={i} className="pj-rb">
          <input type="radio" name={name} value={i} checked={value === i} disabled={disabled} aria-label={`Couleur ${i + 1}`} onChange={() => onChange(i)} />
          <span><i style={{ background: `var(--pj-${i})` }} /></span>
        </label>
      ))}
    </div>
  );
}


/* ---------- Erreur : carte stylée + bouton « Réessayer » (recharge la page) ---------- */
/** « Connexion impossible. Aucun jeton… » → titre + détail ; sinon titre générique + message. */
function splitError(message = "") {
  const m = /^(Connexion impossible)\.?\s*(.*)$/s.exec(message);
  if (m) return { title: m[1], text: m[2] || "La connexion à NEXIS n’a pas pu être établie." };
  return { title: "Un problème est survenu", text: message };
}

/** `compact` : bandeau au-dessus d'un contenu déjà affiché ; sinon grande carte centrée (page vide). */
export function ErrorState({ message, compact = false, onRetry, className = "", style }) {
  const { title, text } = splitError(message);
  const retry = onRetry ?? (() => window.location.reload());
  return (
    <div className={`es ${compact ? "es-compact" : ""} ${className}`} role="alert" style={style}>
      <span className="es-ic"><Icon name="alert" size={compact ? 18 : 26} /></span>
      <div className="es-body">
        <h2 className="es-title">{title}</h2>
        {text && <p className="es-text">{text}</p>}
      </div>
      <button type="button" className="es-retry" onClick={retry}><Icon name="refresh" size={15} />Réessayer</button>
    </div>
  );
}


/* ---------- Bouton d'action serveur : barre circulaire à la place du texte ---------- */
export function Spin({ size = 20 }) {
  return (
    <svg className="cf-spin" style={{ width: size, height: size }} viewBox="0 0 24 24" role="progressbar" aria-label="Action en cours">
      <circle className="cf-track" cx="12" cy="12" r="9" /><circle className="cf-arc" cx="12" cy="12" r="9" />
    </svg>
  );
}
/** Contenu d'un bouton : le texte reste (invisible) pour garder la largeur, la barre circulaire s'affiche par-dessus. */
export function BusyLabel({ busy, children }) {
  return <><span className={busy ? "bs-lbl bs-hid" : "bs-lbl"}>{children}</span>{busy && <Spin />}</>;
}
