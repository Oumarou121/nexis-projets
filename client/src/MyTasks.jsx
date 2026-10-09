import { Fragment, useEffect, useMemo, useState } from "react";
import { api } from "./api.js";
import LabelChips from "./LabelChips.jsx";
import { Icon, PriorityStar, StatusPill } from "./ui.jsx";
import { PRIORITY, TASK_STATUS, isLate, shortDate, todayISO } from "./labels.js";

const DUE = { "": "Toutes les échéances", late: "En retard", week: "7 prochains jours", none: "Sans échéance" };

function inWeek(d) {
  const end = new Date();
  end.setDate(end.getDate() + 7);
  const e = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
  return d >= todayISO() && d <= e;
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
      setList((l) => l.map((x) => (x.id === t.id ? { ...x, status: u.status } : x)));
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

  return (
    <>
      <div className="cp" style={{ paddingLeft: 0, paddingRight: 0 }}>
        <div className="cp-left">
          <div className="crumb2">
            <span className="up">Tâches</span>
            <span className="nm">Mes tâches</span>
          </div>
        </div>
        <div className="cp-mid">
          <div className="sw">
            <div className="search">
              <Icon name="search" size={15} className="caret" />
              <input type="search" aria-label="Rechercher une tâche" placeholder="Rechercher (titre, projet…)" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
            </div>
          </div>
        </div>
        <div className="cp-right"><span className="cp-count">{shown.length} tâche{shown.length > 1 ? "s" : ""}</span></div>
      </div>
      <div className="pmeta-row" style={{ paddingLeft: 0, paddingRight: 0 }}>
        <select aria-label="Statut" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
          <option value="">Tous les statuts</option>
          {Object.entries(TASK_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select aria-label="Priorité" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>
          <option value="">Toutes les priorités</option>
          {Object.entries(PRIORITY).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
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
          <button type="button" className="pill" style={{ color: "var(--bad)", borderColor: "var(--bad)" }} onClick={() => setF({ q: "", status: "", priority: "", due: "late", label: "" })}>
            {late} en retard
          </button>
        )}
      </div>
      {err && <p className="error" style={{ padding: 0 }}>{err}</p>}
      <div className="table-wrap">
        <table className="lt" style={{ minWidth: 720 }}>
          <thead><tr><th>Tâche</th><th>Échéance</th><th>Statut</th></tr></thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g.id}>
                <tr className={`gh ${closed.has(g.id) ? "closed" : ""}`} onClick={() => setClosed((c) => { const n = new Set(c); n.has(g.id) ? n.delete(g.id) : n.add(g.id); return n; })}>
                  <td colSpan={3}>
                    <div className="gh-in">
                      <Icon name="chevron" size={14} />{g.name} <span className="muted">({g.items.length})</span>
                      <button type="button" className="link tot" onClick={(e) => { e.stopPropagation(); onOpenProject(g.id); }}>Ouvrir le projet</button>
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
                    <td><span className={isLate(t) ? "late" : "muted"}>{t.dueDate ? `${shortDate(t.dueDate)}${isLate(t) ? " · en retard" : ""}` : "—"}</span></td>
                    <td><StatusPill status={t.status} onChange={(s) => setStatus(t, s)} /></td>
                  </tr>
                ))}
              </Fragment>
            ))}
            {list && shown.length === 0 && !err && (
              <tr><td colSpan={3} className="muted" style={{ textAlign: "center", padding: 32 }}>{list.length === 0 ? "Aucune tâche ne vous est assignée." : "Aucune tâche ne correspond aux filtres."}</td></tr>
            )}
            {!list && !err && <tr><td colSpan={3} className="muted" style={{ textAlign: "center", padding: 32 }}>Chargement…</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
