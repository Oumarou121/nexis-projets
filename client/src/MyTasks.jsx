import { KpiSkeleton, MyTasksSkeleton, Skel } from "./Skeleton.jsx";
import { Fragment, useEffect, useMemo, useState } from "react";
import { api } from "./api.js";
import LabelChips from "./LabelChips.jsx";
import { ErrorState, Icon, PriorityStar, StatusPill } from "./ui.jsx";
import { PRIORITY, TASK_STATUS, taskColor, isLate, shortDate, todayISO } from "./labels.js";

const DUE = { "": "Toutes les échéances", late: "En retard", week: "7 prochains jours", none: "Sans échéance" };

function inWeek(d) {
  const end = new Date();
  end.setDate(end.getDate() + 7);
  const e = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
  return d >= todayISO() && d <= e;
}

/** Écart d'échéance lisible : « Aujourd'hui », « Demain », « Dans 3 j », « 2 j de retard ». */
function relDue(d) {
  const days = Math.round((new Date(`${d}T12:00:00`) - new Date(`${todayISO()}T12:00:00`)) / 86400000);
  if (days === 0) return "Aujourd'hui";
  if (days === 1) return "Demain";
  if (days === -1) return "Hier";
  return days > 0 ? `Dans ${days} j` : `${-days} j de retard`;
}

/** Toutes les tâches assignées à l'utilisateur dans l'organisation active, groupées par projet. */
export default function MyTasks({ orgId, onOpenProject }) {
  const [list, setList] = useState(null);
  const [err, setErr] = useState("");
  const [f, setF] = useState({ q: "", status: "", priority: "", due: "", label: "" });
  const [closed, setClosed] = useState(() => new Set());
  const base = `/api/organizations/${orgId}/my-tasks`;

  useEffect(() => {
    api(base).then(setList).catch((e) => setErr(e.message));
  }, [base]);

  async function setStatus(t, status) {
    try {
      const u = await api(`/api/organizations/${orgId}/projects/${t.projectId}/tasks/${t.id}`, "PATCH", { status });
      setList((l) => l.map((x) => (x.id === t.id ? { ...x, status: u.status, stageId: u.stageId, stage: u.stage, stageColor: u.stageColor } : x)));
      setErr("");
    } catch (e) {
      setErr(e.message);
    }
  }

  const allLabels = useMemo(() => [...new Set((list ?? []).flatMap((t) => t.labels ?? []))].sort(), [list]);
  const late = useMemo(() => (list ?? []).filter(isLate).length, [list]);
  const shown = useMemo(() => {
    const q = f.q.trim().toLowerCase();
    return (list ?? []).filter((t) => {
      if (f.status && t.status !== f.status) return false;
      if (f.priority && t.priority !== f.priority) return false;
      if (f.label && !t.labels?.includes(f.label)) return false;
      if (f.due === "late" && !isLate(t)) return false;
      if (f.due === "week" && !(t.dueDate && t.status !== "done" && inWeek(t.dueDate))) return false;
      if (f.due === "none" && t.dueDate) return false;
      if (q && !`${t.title} ${t.projectName} ${t.description ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [list, f]);

  const groups = useMemo(() => {
    const m = new Map();
    for (const t of shown) m.set(t.projectId, { id: t.projectId, name: t.projectName, items: [...(m.get(t.projectId)?.items ?? []), t] });
    return [...m.values()];
  }, [shown]);

  const open = (list ?? []).filter((t) => t.status !== "done").length;
  const week = (list ?? []).filter((t) => t.dueDate && t.status !== "done" && inWeek(t.dueDate)).length;
  const done = (list ?? []).filter((t) => t.status === "done").length;
  const filtered = f.q || f.status || f.priority || f.due || f.label;

  return (
    <>
      <div className="mt-head">
        <div>
          <h2>Mes tâches</h2>
          {list ? <p>{open} à traiter · {shown.length} affichée{shown.length > 1 ? "s" : ""}</p> : <p><Skel w={190} h={14} className="sk-inline" /></p>}
        </div>
      </div>
      {!list && !err ? <KpiSkeleton /> : (
      <div className="rp-kpis fade-in">
        {[
          ["À traiter", open, "list", ""],
          ["En retard", late, "clock", late ? "bad" : ""],
          ["7 prochains jours", week, "calendar", ""],
          ["Terminées", done, "check", "ok"],
        ].map(([label, value, icon, tone]) => (
          <div key={label} className={`rp-kpi ${tone}`}><span className="rp-ico"><Icon name={icon} size={18} /></span><div><b>{value}</b><span>{label}</span></div></div>
        ))}
      </div>
      )}
      <div className="mt-filters">
        <div className="mt-search">
          <Icon name="search" size={16} />
          <input type="search" aria-label="Rechercher une tâche" placeholder="Rechercher (titre, projet…)" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
        </div>
        <select aria-label="Statut" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
          <option value="">Tous les statuts</option>
          {Object.entries(TASK_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select aria-label="Priorité" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>
          <option value="">Toutes les priorités</option>
          {Object.entries(PRIORITY).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        {!list && (
          <select aria-label="Étiquette" disabled><option>Toutes les étiquettes</option></select>
        )}
        {allLabels.length > 0 && (
          <select aria-label="Étiquette" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })}>
            <option value="">Toutes les étiquettes</option>
            {allLabels.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        )}
        <select aria-label="Échéance" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })}>
          {Object.entries(DUE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        {late > 0 && f.due !== "late" && (
          <button type="button" className="mt-late" onClick={() => setF({ q: "", status: "", priority: "", due: "late", label: "" })}>{late} en retard</button>
        )}
        {filtered && <button type="button" className="mt-clear" onClick={() => setF({ q: "", status: "", priority: "", due: "", label: "" })}>Effacer les filtres</button>}
      </div>
      {err && <div className="mt-err"><ErrorState compact message={err} /></div>}
      {!list && !err ? <MyTasksSkeleton /> : (
      <div className="table-wrap lt-wrap fade-in">
        <table className="lt mt-table">
          <thead><tr><th>Tâche</th><th>Échéance</th><th>Statut</th></tr></thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g.id}>
                <tr className={`gh ${closed.has(g.id) ? "closed" : ""}`} onClick={() => setClosed((c) => { const n = new Set(c); n.has(g.id) ? n.delete(g.id) : n.add(g.id); return n; })}>
                  <td colSpan={3}>
                    <div className="gh-in">
                      <Icon name="chevron" size={14} /><b>{g.name}</b> <span className="gcount">{g.items.length}</span>
                      <button type="button" className="mt-open tot" onClick={(e) => { e.stopPropagation(); onOpenProject(g.id); }}>Ouvrir le projet</button>
                    </div>
                  </td>
                </tr>
                {!closed.has(g.id) && g.items.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <div className="ttl">
                        <PriorityStar priority={t.priority} />
                        <button type="button" className="link" onClick={() => onOpenProject(t.projectId)}>
                          <span className={t.status === "done" ? "done" : ""}>{t.title}</span>
                        </button>
                        <LabelChips labels={t.labels} />
                      </div>
                    </td>
                    <td className="mt-due">
                      {t.dueDate ? (
                        <>
                          <span className={isLate(t) ? "late" : ""}>{shortDate(t.dueDate)}</span>
                          {t.status !== "done" && <small className={isLate(t) ? "late" : "muted"}>{relDue(t.dueDate)}</small>}
                        </>
                      ) : <span className="muted">—</span>}
                    </td>
                    <td><StatusPill status={t.status} label={t.stage} color={taskColor(t)} onChange={(s) => setStatus(t, s)} /></td>
                  </tr>
                ))}
              </Fragment>
            ))}
            {list && shown.length === 0 && !err && (
              <tr className="empty-row"><td colSpan={3}><div className="empty-tab"><Icon name="check" size={22} /><b>{list.length === 0 ? "Rien à faire pour le moment" : "Aucun résultat"}</b><span>{list.length === 0 ? "Aucune tâche ne vous est assignée." : "Aucune tâche ne correspond aux filtres."}</span></div></td></tr>
            )}
          </tbody>
        </table>
      </div>
      )}
    </>
  );
}
