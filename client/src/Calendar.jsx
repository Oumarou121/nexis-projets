import { useMemo, useState } from "react";
import { Avatar, Icon } from "./ui.jsx";
import { isLate, memberName } from "./labels.js";

const MAX_PER_DAY = 3;
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Calendrier mensuel (semaine du lundi) : tâches placées à leur échéance, filtre par responsable. */
export default function Calendar({ tasks, members, onOpen, onSidebar }) {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [hidden, setHidden] = useState(() => new Set());
  const [openDay, setOpenDay] = useState(null); // jour dont toutes les tâches sont dépliées

  // Une couleur par personne, stable (ordre de la liste des membres), partagée avec les rapports.
  const people = useMemo(() => {
    const list = members.map((m, i) => ({ id: m.userId, name: memberName(m), member: m, color: `var(--viz-${(i % 8) + 1})` }));
    return [...list, { id: "none", name: "Non assignée", member: null, color: "var(--viz-none)" }];
  }, [members]);
  const colorOf = (t) => (people.find((p) => p.id === (t.assigneeId ?? "none")) ?? people[people.length - 1]).color;

  const { cells, byDay } = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const lead = (first.getDay() + 6) % 7; // lundi = 0
    const start = new Date(first.getFullYear(), first.getMonth(), 1 - lead);
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const weeks = Math.ceil((lead + days) / 7);
    const cells = Array.from({ length: weeks * 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
    const byDay = new Map();
    for (const t of tasks) {
      if (!t.dueDate || hidden.has(t.assigneeId ?? "none")) continue;
      byDay.set(t.dueDate, [...(byDay.get(t.dueDate) ?? []), t]);
    }
    return { cells, byDay };
  }, [tasks, month, hidden]);

  const shift = (n) => { setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1)); setOpenDay(null); };
  const today = iso(new Date());
  const toggle = (id) => setHidden((h) => { const n = new Set(h); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const label = month.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  const monday = new Date(2024, 0, 1); // un lundi connu, pour les noms de jours

  return (
    <>
      <div className="plan-nav">
        <button type="button" className="icon-btn" aria-label="Mois précédent" onClick={() => shift(-1)}><Icon name="back" size={18} /></button>
        <button type="button" className="icon-btn" aria-label="Mois suivant" onClick={() => shift(1)}><Icon name="chevronR" size={18} /></button>
        <button type="button" className="btn" onClick={() => { setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1)); setOpenDay(null); }}>Aujourd'hui</button>
        <strong className="plan-month">{label}</strong>
      </div>
      <div className="cal2">
        <div className="cal2-main">
          <div className="cal2-dow" aria-hidden="true">
            {Array.from({ length: 7 }, (_, i) => (
              <div key={i}>{new Date(monday.getFullYear(), 0, 1 + i).toLocaleDateString("fr-FR", { weekday: "short" })}</div>
            ))}
          </div>
          <div className="cal2-grid" role="grid" aria-label={`Calendrier ${label}`}>
            {cells.map((d) => {
              const key = iso(d);
              const inMonth = d.getMonth() === month.getMonth();
              const items = byDay.get(key) ?? [];
              const expanded = openDay === key;
              const shown = expanded ? items : items.slice(0, MAX_PER_DAY);
              const we = d.getDay() === 0 || d.getDay() === 6;
              return (
                <div key={key} role="gridcell" className={`cal2-cell ${inMonth ? "" : "out"} ${we ? "we" : ""} ${key === today ? "today" : ""}`}>
                  <span className="cal2-n">{d.getDate()}</span>
                  {shown.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={`cal2-ev ${t.status === "done" ? "done" : ""}`}
                      style={{ "--ev": colorOf(t) }}
                      title={`${t.title}${isLate(t) ? " · en retard" : ""}`}
                      onClick={() => onOpen(t)}
                      onContextMenu={(e) => { if (onSidebar) { e.preventDefault(); onSidebar(t); } }}
                    >
                      {isLate(t) && <i className="cal2-late" aria-label="En retard" />}
                      <span>{t.title}</span>
                    </button>
                  ))}
                  {items.length > MAX_PER_DAY && (
                    <button type="button" className="cal2-more" onClick={() => setOpenDay(expanded ? null : key)}>
                      {expanded ? "Réduire" : `+ ${items.length - MAX_PER_DAY} autre${items.length - MAX_PER_DAY > 1 ? "s" : ""}`}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <aside className="cal2-side" aria-label="Responsables">
          <h5>Responsables</h5>
          {people.map((p) => (
            <label key={p.id} className="cal2-fl">
              <input type="checkbox" checked={!hidden.has(p.id)} onChange={() => toggle(p.id)} style={{ accentColor: p.color }} />
              <i style={{ background: p.color }} />
              <Avatar member={p.member} name={p.member ? undefined : ""} size={18} />
              <span>{p.name}</span>
            </label>
          ))}
        </aside>
      </div>
    </>
  );
}
