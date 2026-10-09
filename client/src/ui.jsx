import { useEffect, useRef, useState } from "react";
import { PRIORITY, PRIORITY_COLOR, STATUS_COLOR, TASK_STATUS, isLate, memberName, shortDate } from "./labels.js";

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
export function StatusPill({ status, onChange, compact = false }) {
  const { open, setOpen, ref } = usePopover();
  return (
    <span className="pop" ref={ref}>
      <button type="button" className={`spill ${compact ? "compact" : ""}`} aria-label={`Statut : ${TASK_STATUS[status]}`} aria-haspopup="menu" aria-expanded={open} onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>
        <i style={{ background: STATUS_COLOR[status] }} />
        {!compact && TASK_STATUS[status]}
        {!compact && <Icon name="chevron" size={12} />}
      </button>
      {open && (
        <div className="menu left" role="menu">
          {Object.entries(TASK_STATUS).map(([v, l]) => (
            <button key={v} role="menuitemradio" aria-checked={v === status} type="button" className={`mi ${v === status ? "active" : ""}`} onClick={(e) => { e.stopPropagation(); setOpen(false); if (v !== status) onChange(v); }}>
              <i className="dot" style={{ background: STATUS_COLOR[v] }} />
              {l}
              {v === status && <Icon name="check" size={14} className="push" />}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

/* ---------- Priorité : étoile à la Odoo (haute/urgente = remplie) ---------- */
export function PriorityStar({ priority, onChange }) {
  const hot = priority === "high" || priority === "urgent";
  return (
    <button
      type="button"
      className={`star ${hot ? "on" : ""}`}
      style={hot ? { color: PRIORITY_COLOR[priority] } : undefined}
      aria-label={`Priorité ${PRIORITY[priority]}`}
      title={`Priorité ${PRIORITY[priority].toLowerCase()}${onChange ? " — cliquer pour changer" : ""}`}
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
  return (
    <span className={`datef ${value ? "" : "empty"} ${late ? "late" : ""}`}>
      <Icon name="calendar" size={14} />
      <span>{value ? shortDate(value) : placeholder}</span>
      <input type="date" aria-label={label} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} onClick={(e) => e.currentTarget.showPicker?.()} />
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
