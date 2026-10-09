import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Avatar, Icon } from "./ui.jsx";
import { TASK_STATUS, isLate, memberName } from "./labels.js";

const DAY_MS = 86400000;
const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const fromISO = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};

/** Couleur d'une barre : en retard = rouge, sinon selon le statut. */
function barColor(t) {
  if (isLate(t)) return "var(--bad)";
  return { done: "#3fb08a", in_progress: "#4a9be8", review: "#e0a43a", todo: "#8d96a8" }[t.status] ?? "#8d96a8";
}

const ROW_H = 34;

/** Tracé d'une flèche : sort à droite de la barre bloquante, entre à gauche de la barre dépendante. */
function arrowPath(a, b) {
  const k = 8;
  if (b.l >= a.r + 2 * k) return `M${a.r} ${a.y} H${a.r + k} V${b.y} H${b.l}`;
  // Barre d'arrivée trop proche ou à gauche : on contourne entre les deux lignes.
  const ym = a.y + (b.y >= a.y ? 1 : -1) * (ROW_H / 2);
  return `M${a.r} ${a.y} H${a.r + k} V${ym} H${b.l - k} V${b.y} H${b.l}`;
}

/**
 * Planning façon Odoo : un mois en colonnes, week-ends grisés, groupes repliables par responsable
 * (une ligne par tâche, barre de la création à l'échéance) et une ligne de total par jour.
 * Les tâches sans échéance sont comptées sous le tableau.
 */
export default function Gantt({ tasks, dependencies = [], members, onOpen, onSidebar }) {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [closed, setClosed] = useState(() => new Set());
  const gridRef = useRef(null);
  const barRefs = useRef(new Map());
  const [arrows, setArrows] = useState([]);
  const [hover, setHover] = useState(null);

  const { days, groups, totals, skipped } = useMemo(() => {
    const start = new Date(month.getFullYear(), month.getMonth(), 1);
    const n = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const days = Array.from({ length: n }, (_, i) => new Date(start.getFullYear(), start.getMonth(), i + 1));
    const idx = (d) => Math.round((midnight(d) - start) / DAY_MS);

    const byWho = new Map();
    const totals = Array(n).fill(0);
    let skipped = 0;
    for (const t of tasks) {
      if (!t.dueDate) { skipped++; continue; }
      const due = idx(fromISO(t.dueDate));
      const created = idx(new Date(t.createdAt));
      const s = Math.min(created, due);
      const e = Math.max(created, due);
      if (e < 0 || s > n - 1) continue; // hors du mois affiché
      const from = Math.max(0, s);
      const to = Math.min(n - 1, e);
      for (let i = from; i <= to; i++) totals[i]++;
      const key = t.assigneeId ?? "none";
      byWho.set(key, [...(byWho.get(key) ?? []), { task: t, from, to, cutL: s < 0, cutR: e > n - 1 }]);
    }
    const groups = [...byWho].map(([key, rows]) => {
      const m = members.find((x) => x.userId === key);
      return { key, name: key === "none" ? "Non assignée" : m ? memberName(m) : "Ancien membre", member: m, rows };
    });
    groups.sort((a, b) => (a.key === "none") - (b.key === "none") || a.name.localeCompare(b.name, "fr"));
    return { days, groups, totals, skipped };
  }, [tasks, members, month]);

  // Position des barres mesurée dans le DOM : les lignes ont des hauteurs variables, on ne la calcule pas.
  const measure = useCallback(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const g = grid.getBoundingClientRect();
    const pos = (id) => {
      const el = barRefs.current.get(id);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { l: r.left - g.left, r: r.right - g.left, y: r.top - g.top + r.height / 2 };
    };
    const byId = new Map(tasks.map((t) => [t.id, t]));
    const next = [];
    for (const d of dependencies) {
      const from = pos(d.dependsOnId);
      const to = pos(d.taskId);
      if (!from || !to) continue; // une des deux tâches n'est pas affichée (hors mois, groupe replié, filtrée)
      const blocker = byId.get(d.dependsOnId);
      const dependent = byId.get(d.taskId);
      const conflict = blocker.status !== "done" && !!blocker.dueDate && !!dependent.dueDate && blocker.dueDate > dependent.dueDate;
      next.push({ id: d.id, from: d.dependsOnId, to: d.taskId, path: arrowPath(from, to), conflict });
    }
    setArrows(next);
  }, [tasks, dependencies]);

  useLayoutEffect(() => {
    measure();
    const grid = gridRef.current;
    if (!grid || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(grid);
    return () => ro.disconnect();
  }, [measure, groups, closed, month]);

  const todayIdx = (() => {
    const t = midnight(new Date());
    return t.getFullYear() === month.getFullYear() && t.getMonth() === month.getMonth() ? t.getDate() - 1 : -1;
  })();
  const shift = (n) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  const cols = `repeat(${days.length}, 34px)`;
  const toggle = (k) => setClosed((c) => { const x = new Set(c); x.has(k) ? x.delete(k) : x.add(k); return x; });
  const weekend = (d) => d.getDay() === 0 || d.getDay() === 6;
  const label = month.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  return (
    <>
      <div className="plan-nav">
        <button type="button" className="icon-btn" aria-label="Mois précédent" onClick={() => shift(-1)}><Icon name="back" size={18} /></button>
        <button type="button" className="icon-btn" aria-label="Mois suivant" onClick={() => shift(1)}><Icon name="chevronR" size={18} /></button>
        <button type="button" className="btn" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Aujourd'hui</button>
        <strong className="plan-month">{label}</strong>
      </div>
      <div className="plan" role="table" aria-label={`Planning ${label}`}>
        <div className="plan-grid" ref={gridRef}>
          <div className="pl-row pl-head" style={{ gridTemplateColumns: `200px ${cols}` }}>
            <div className="pl-name">Planning</div>
            {days.map((d, i) => (
              <div key={i} className={`pl-day ${weekend(d) ? "we" : ""} ${i === todayIdx ? "today" : ""}`}>
                <small>{d.toLocaleDateString("fr-FR", { weekday: "narrow" })}</small>
                {String(d.getDate()).padStart(2, "0")}
              </div>
            ))}
          </div>
          {groups.map((g) => (
            <div key={g.key}>
              <button type="button" className={`pl-row pl-group ${closed.has(g.key) ? "closed" : ""}`} style={{ gridTemplateColumns: `200px ${cols}` }} aria-expanded={!closed.has(g.key)} onClick={() => toggle(g.key)}>
                <div className="pl-name"><Icon name="chevron" size={14} /><Avatar member={g.member} name={g.member ? undefined : ""} size={20} />{g.name}<span className="muted"> ({g.rows.length})</span></div>
                {days.map((d, i) => <div key={i} className={`pl-cell ${weekend(d) ? "we" : ""}`} />)}
              </button>
              {!closed.has(g.key) && g.rows.map(({ task, from, to, cutL, cutR }) => (
                <div key={task.id} className="pl-row" style={{ gridTemplateColumns: `200px ${cols}` }}>
                  <div className="pl-name pl-task" title={task.title}>
                    <button type="button" className="link" onClick={() => onOpen(task)}><span className={task.status === "done" ? "done" : ""}>{task.title}</span></button>
                  </div>
                  {days.map((d, i) => <div key={i} className={`pl-cell ${weekend(d) ? "we" : ""} ${i === todayIdx ? "today" : ""}`} style={{ gridRow: 1, gridColumn: i + 2 }} />)}
                  <button
                    type="button"
                    ref={(el) => { if (el) barRefs.current.set(task.id, el); else barRefs.current.delete(task.id); }}
                    className={`pl-bar ${cutL ? "cl" : ""} ${cutR ? "cr" : ""}`}
                    onMouseEnter={() => setHover(task.id)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(task.id)}
                    onBlur={() => setHover(null)}
                    style={{ gridRow: 1, gridColumn: `${from + 2} / ${to + 3}`, background: barColor(task) }}
                    title={`${task.title} · ${TASK_STATUS[task.status]}${task.dueDate ? ` · échéance ${task.dueDate}` : ""}`}
                    onClick={() => onOpen(task)}
                    onContextMenu={(e) => { if (onSidebar) { e.preventDefault(); onSidebar(task); } }}
                  >
                    {task.title}
                  </button>
                </div>
              ))}
            </div>
          ))}
          {arrows.length > 0 && (
            <svg className="pl-arrows" aria-hidden="true">
              <defs>
                {[["n", "var(--mut)"], ["bad", "var(--bad)"], ["hl", "var(--teal)"]].map(([k, c]) => (
                  <marker key={k} id={`pl-head-${k}`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                    <path d="M0 0.5 L7.5 4 L0 7.5 z" style={{ fill: c }} />
                  </marker>
                ))}
              </defs>
              {arrows.map((a) => {
                const linked = hover && (a.from === hover || a.to === hover);
                const kind = linked ? "hl" : a.conflict ? "bad" : "n";
                return <path key={a.id} d={a.path} className={`pl-arrow ${kind} ${hover && !linked ? "dim" : ""}`} markerEnd={`url(#pl-head-${kind})`} />;
              })}
            </svg>
          )}
          <div className="pl-row pl-total" style={{ gridTemplateColumns: `200px ${cols}` }}>
            <div className="pl-name">Total</div>
            {totals.map((n, i) => (
              <div key={i} className={`pl-cell ${weekend(days[i]) ? "we" : ""}`}>{n > 0 && <span className="pl-count" style={{ opacity: Math.min(1, 0.35 + n * 0.15) }}>{n}</span>}</div>
            ))}
          </div>
        </div>
        {groups.length === 0 && <p className="muted pl-empty">Aucune tâche planifiée ce mois-ci.</p>}
      </div>
      {dependencies.length > 0 && (
        <p className="muted small plan-note">
          Flèche : la tâche d'arrivée attend celle de départ. <span className="late">Rouge en pointillés</span> : la tâche bloquante n'est pas terminée et son échéance est postérieure à celle de la tâche qui l'attend.
        </p>
      )}
      {skipped > 0 && <p className="muted small plan-note">{skipped} tâche{skipped > 1 ? "s" : ""} sans échéance (non affichée{skipped > 1 ? "s" : ""} dans le planning).</p>}
    </>
  );
}
