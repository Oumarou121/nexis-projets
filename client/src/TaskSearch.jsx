import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./ui.jsx";
import { PRIORITY, TASK_STATUS, isLate, memberName } from "./labels.js";

export const FILTERS = {
  open: ["Tâches ouvertes", (t) => t.status !== "done"],
  late: ["En retard", (t) => isLate(t)],
  urgent: ["Priorité haute ou urgente", (t) => t.priority === "high" || t.priority === "urgent"],
  unassigned: ["Non assignées", (t) => !t.assigneeId],
  done: ["Terminées", (t) => t.status === "done"],
};
export const GROUPS = { status: "Statut", priority: "Priorité", assignee: "Responsable" };

/** Applique recherche + filtres (OU au sein d'un même groupe n'existe pas ici : tous les filtres s'additionnent). */
export function applySearch(tasks, { q, filters }) {
  const needle = q.trim().toLowerCase();
  return tasks.filter(
    (t) =>
      filters.every((f) => FILTERS[f][1](t)) &&
      (!needle || t.title.toLowerCase().includes(needle) || (t.description ?? "").toLowerCase().includes(needle)),
  );
}

/** Regroupe les tâches ; renvoie [{key, label, items}]. */
export function groupTasks(tasks, groupBy, members) {
  if (!groupBy) return [{ key: "all", label: null, items: tasks }];
  const map = new Map();
  const label = (t) => {
    if (groupBy === "status") return t.stage ?? TASK_STATUS[t.status];
    if (groupBy === "priority") return PRIORITY[t.priority];
    const m = members.find((x) => x.userId === t.assigneeId);
    return t.assigneeId ? (m ? memberName(m) : "Ancien membre") : "Non assignée";
  };
  for (const t of tasks) {
    const l = label(t);
    map.set(l, [...(map.get(l) ?? []), t]);
  }
  return [...map].map(([l, items]) => ({ key: l, label: l, items }));
}

const FAV_KEY = (projectId) => `nexis.tasks.favs.${projectId}`;
const readFavs = (projectId) => {
  try {
    const v = JSON.parse(localStorage.getItem(FAV_KEY(projectId)) ?? "[]");
    return Array.isArray(v) ? v.filter((f) => f && typeof f.name === "string") : [];
  } catch {
    return [];
  }
};

/**
 * Barre de recherche d'Odoo : facettes + menu déroulant Filtres / Regrouper par / Favoris.
 * `state` = { q, filters[], groupBy } ; les favoris sont gardés dans ce navigateur, par projet.
 */
export default function TaskSearch({ projectId, state, onChange }) {
  const [open, setOpen] = useState(false);
  const [favs, setFavs] = useState(() => readFavs(projectId));
  const [favName, setFavName] = useState("");
  const box = useRef(null);

  useEffect(() => {
    if (!open) return;
    const away = (e) => !box.current?.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const saveFavs = (next) => {
    setFavs(next);
    try {
      localStorage.setItem(FAV_KEY(projectId), JSON.stringify(next));
    } catch {
      /* stockage indisponible : le favori reste valable jusqu'au rechargement */
    }
  };
  const toggle = (f) =>
    onChange({ ...state, filters: state.filters.includes(f) ? state.filters.filter((x) => x !== f) : [...state.filters, f] });
  const canSave = favName.trim() && (state.filters.length || state.groupBy || state.q.trim());
  const facets = useMemo(
    () => [
      ...state.filters.map((f) => ({ id: f, label: FILTERS[f][0], remove: () => toggle(f) })),
      ...(state.groupBy ? [{ id: "g", label: `Regroupé par ${GROUPS[state.groupBy]}`, remove: () => onChange({ ...state, groupBy: "" }) }] : []),
    ],
    [state], // eslint-disable-line react-hooks/exhaustive-deps
  );

  return (
    <div className="sw" ref={box}>
      <div className="search">
        <Icon name="search" size={15} className="caret" />
        {facets.map((f) => (
          <span key={f.id} className="fac">
            <Icon name={f.id === "g" ? "list" : "filter"} size={12} />
            {f.label}
            <button type="button" className="chip-x" aria-label={`Retirer ${f.label}`} onClick={f.remove}>×</button>
          </span>
        ))}
        <input type="search" aria-label="Rechercher une tâche" placeholder="Rechercher…" value={state.q} onChange={(e) => onChange({ ...state, q: e.target.value })} />
        <button type="button" className="chip-x caret" aria-expanded={open} aria-label="Filtres, regroupements et favoris" onClick={() => setOpen(!open)}><Icon name="chevron" size={15} /></button>
      </div>
      {open && (
        <div className="dd">
          <div>
            <h5>Filtres</h5>
            {Object.entries(FILTERS).map(([id, [label]]) => (
              <div key={id} className={state.filters.includes(id) ? "a" : ""} onClick={() => toggle(id)}>
                {state.filters.includes(id) ? "✓ " : ""}{label}
              </div>
            ))}
          </div>
          <div>
            <h5>Regrouper par</h5>
            {Object.entries(GROUPS).map(([id, label]) => (
              <div key={id} className={state.groupBy === id ? "a" : ""} onClick={() => onChange({ ...state, groupBy: state.groupBy === id ? "" : id })}>
                {state.groupBy === id ? "✓ " : ""}{label}
              </div>
            ))}
          </div>
          <div>
            <h5>Favoris</h5>
            {favs.map((f) => (
              <div key={f.name} className="favrow">
                <span onClick={() => { onChange({ q: f.q ?? "", filters: (f.filters ?? []).filter((x) => FILTERS[x]), groupBy: GROUPS[f.groupBy] ? f.groupBy : "" }); setOpen(false); }}>★ {f.name}</span>
                <button type="button" className="chip-x" aria-label={`Supprimer le favori ${f.name}`} onClick={() => saveFavs(favs.filter((x) => x.name !== f.name))}>×</button>
              </div>
            ))}
            {favs.length === 0 && <div className="muted">Aucun favori</div>}
            <hr />
            <input placeholder="Nom du favori" aria-label="Nom du favori" value={favName} onChange={(e) => setFavName(e.target.value)} />
            <button type="button" disabled={!canSave} onClick={() => { saveFavs([...favs.filter((x) => x.name !== favName.trim()), { name: favName.trim(), q: state.q, filters: state.filters, groupBy: state.groupBy }]); setFavName(""); }}>
              Enregistrer la recherche
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
