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
  return { done: "var(--st-done)", in_progress: "var(--st-progress)", review: "var(--st-review)", todo: "var(--st-todo)" }[t.status] ?? "var(--st-todo)";
}

const ROW_H = 34;
const COL_W = 34;
const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const shortD = (d) => d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

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
export default function Gantt({ tasks, dependencies = [], members, onChange, onOpen, onSidebar }) {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [closed, setClosed] = useState(() => new Set());
  const gridRef = useRef(null);
  const barRefs = useRef(new Map());
  const [arrows, setArrows] = useState([]);
  const [hover, setHover] = useState(null);
  // Redimensionnement en cours : { id, edge: "l" | "r", delta } (en jours). Gardé jusqu'à la réponse du serveur.
  const [drag, setDrag] = useState(null);
  const dragRef = useRef(null);
  const justDragged = useRef(false);

  const { days, groups, totals, skipped, n: nDays } = useMemo(() => {
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
      // Début : date de début saisie, sinon création de la tâche (jamais après l'échéance).
      const s = Math.min(t.startDate ? idx(fromISO(t.startDate)) : idx(new Date(t.createdAt)), due);
      const e = due;
      if (e < 0 || s > n - 1) continue; // hors du mois affiché
      const from = Math.max(0, s);
      const to = Math.min(n - 1, e);
      for (let i = from; i <= to; i++) totals[i]++;
      const key = t.assigneeId ?? "none";
      byWho.set(key, [...(byWho.get(key) ?? []), { task: t, s, e, from, to, cutL: s < 0, cutR: e > n - 1 }]);
    }
    const groups = [...byWho].map(([key, rows]) => {
      const m = members.find((x) => x.userId === key);
      return { key, name: key === "none" ? "Non assignée" : m ? memberName(m) : "Ancien membre", member: m, rows };
    });
    groups.sort((a, b) => (a.key === "none") - (b.key === "none") || a.name.localeCompare(b.name, "fr"));
    return { days, groups, totals, skipped, n };
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
  }, [measure, groups, closed, month, drag]);

  function startResize(e, row, edge) {
    if (!onChange || e.button > 0) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = { id: row.task.id, edge, x0: e.clientX, s: row.s, e: row.e, delta: 0, task: row.task };
    setDrag({ id: row.task.id, edge, delta: 0 });
  }
  function moveResize(e) {
    const d = dragRef.current;
    if (!d) return;
    let delta = Math.round((e.clientX - d.x0) / COL_W);
    // Une tâche dure au moins un jour : le bord glissé ne dépasse pas l'autre.
    delta = d.edge === "l" ? Math.min(delta, d.e - d.s) : Math.max(delta, d.s - d.e);
    if (delta !== d.delta) {
      d.delta = delta;
      setDrag({ id: d.id, edge: d.edge, delta });
    }
  }
  async function endResize(e) {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    if (d.delta === 0) { setDrag(null); return; }
    justDragged.current = true;
    setTimeout(() => { justDragged.current = false; }, 0);
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const at = (i) => isoOf(new Date(first.getFullYear(), first.getMonth(), 1 + i));
    await onChange(d.task, d.edge === "l" ? { startDate: at(d.s + d.delta) } : { dueDate: at(d.e + d.delta) });
    setDrag(null);
  }
  const cancelResize = () => { dragRef.current = null; setDrag(null); };

  const todayIdx = (() => {
    const t = midnight(new Date());
    return t.getFullYear() === month.getFullYear() && t.getMonth() === month.getMonth() ? t.getDate() - 1 : -1;
  })();
  const shift = (n) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  const cols = `repeat(${days.length}, ${COL_W}px)`;
  const toggle = (k) => setClosed((c) => { const x = new Set(c); x.has(k) ? x.delete(k) : x.add(k); return x; });
  const weekend = (d) => d.getDay() === 0 || d.getDay() === 6;
  const label = month.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  return (
    <>
      <div className="plan-nav">
        <button type="button" className="icon-btn" aria-label="Mois précédent" onClick={() => shift(-1)}><Icon name="back" size={18} /></button>
        <button type="button" className="icon-btn" aria-label="Mois suivant" onClick={() => shift(1)}><Icon name="chevronR" size={18} /></button>
        <button type="button" className="pl-today" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Aujourd'hui</button>
        <strong className="plan-month">{label}</strong>
        <ul className="plan-legend" aria-label="Légende">
          {[["todo", "var(--st-todo)"], ["in_progress", "var(--st-progress)"], ["review", "var(--st-review)"], ["done", "var(--st-done)"], ["late", "var(--bad)"]].map(([k, c]) => (
            <li key={k}><i style={{ background: c }} />{k === "late" ? "En retard" : TASK_STATUS[k]}</li>
          ))}
        </ul>
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
              {!closed.has(g.key) && g.rows.map((row) => {
                const { task } = row;
                const d = drag?.id === task.id ? drag : null;
                const s = row.s + (d?.edge === "l" ? d.delta : 0);
                const e = row.e + (d?.edge === "r" ? d.delta : 0);
                const from = Math.max(0, s);
                const to = Math.min(nDays - 1, e);
                const cutL = s < 0;
                const cutR = e > nDays - 1;
                const first = new Date(month.getFullYear(), month.getMonth(), 1);
                const dateOf = (i) => new Date(first.getFullYear(), first.getMonth(), 1 + i);
                const range = `${shortD(dateOf(s))} → ${shortD(dateOf(e))}`;
                if (from > to) return null;
                return (
                  <div key={task.id} className="pl-row" style={{ gridTemplateColumns: `200px ${cols}` }}>
                    <div className="pl-name pl-task" title={task.title}>
                      <button type="button" className="link" onClick={() => onOpen(task)}><span className={task.status === "done" ? "done" : ""}>{task.title}</span></button>
                    </div>
                    {days.map((dd, i) => <div key={i} className={`pl-cell ${weekend(dd) ? "we" : ""} ${i === todayIdx ? "today" : ""}`} style={{ gridRow: 1, gridColumn: i + 2 }} />)}
                    <div
                      ref={(el) => { if (el) barRefs.current.set(task.id, el); else barRefs.current.delete(task.id); }}
                      className={`pl-bar ${cutL ? "cl" : ""} ${cutR ? "cr" : ""} ${d ? "dragging" : ""}`}
                      role="button"
                      tabIndex={0}
                      onMouseEnter={() => setHover(task.id)}
                      onMouseLeave={() => setHover(null)}
                      onFocus={() => setHover(task.id)}
                      onBlur={() => setHover(null)}
                      style={{ gridRow: 1, gridColumn: `${from + 2} / ${to + 3}`, background: barColor(task) }}
                      title={`${task.title} · ${TASK_STATUS[task.status]} · ${range}`}
                      onClick={() => { if (!justDragged.current) onOpen(task); }}
                      onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onOpen(task); } }}
                      onContextMenu={(ev) => { if (onSidebar) { ev.preventDefault(); onSidebar(task); } }}
                    >
                      {onChange && !cutL && (
                        <span className="pl-h l" aria-label={`Début de ${task.title}`} onPointerDown={(ev) => startResize(ev, row, "l")} onPointerMove={moveResize} onPointerUp={endResize} onPointerCancel={cancelResize} onClick={(ev) => ev.stopPropagation()} />
                      )}
                      <span className="pl-bt">{d ? range : task.title}</span>
                      {onChange && !cutR && (
                        <span className="pl-h r" aria-label={`Échéance de ${task.title}`} onPointerDown={(ev) => startResize(ev, row, "r")} onPointerMove={moveResize} onPointerUp={endResize} onPointerCancel={cancelResize} onClick={(ev) => ev.stopPropagation()} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
          {arrows.length > 0 && (
            <svg className="pl-arrows" aria-hidden="true">
              <defs>
                {[["n", "var(--mut)"], ["bad", "var(--bad)"], ["hl", "var(--pri)"]].map(([k, c]) => (
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
