import { useCallback, useEffect, useState } from "react";
import { api } from "./api.js";
import { Avatar, ErrorState, Icon } from "./ui.jsx";
import { DashboardSkeleton } from "./Skeleton.jsx";
import { PROJECT_STATUS, STATUS_COLOR, TASK_STATUS, memberName } from "./labels.js";

const PROJECT_COLOR = { planned: "var(--st-todo)", active: "var(--pri)", on_hold: "var(--st-review)", done: "var(--st-done)" };

/** Carte « répartition » : barre segmentée + une ligne par statut (valeur et part). */
function Breakdown({ title, hint, labels, counts, colors }) {
  const total = Object.keys(labels).reduce((s, k) => s + (counts[k] ?? 0), 0);
  return (
    <section className="db-card">
      <header><h3>{title}</h3><span>{hint}</span></header>
      {total === 0 ? (
        <div className="empty-tab"><Icon name="chart" size={22} /><b>Rien à répartir</b><span>Aucun élément pour le moment.</span></div>
      ) : (
        <>
          <div className="db-seg" role="img" aria-label={title}>
            {Object.keys(labels).map((k) => counts[k] > 0 && <i key={k} style={{ flex: counts[k], background: colors[k] }} title={`${labels[k]} : ${counts[k]}`} />)}
          </div>
          <ul className="db-rows">
            {Object.entries(labels).map(([k, l]) => (
              <li key={k}>
                <i className="dot" style={{ background: colors[k] }} />
                <span>{l}</span>
                <b>{counts[k] ?? 0}</b>
                <small>{Math.round(((counts[k] ?? 0) / total) * 100)} %</small>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** Indicateurs de l'organisation active. `members` sert à nommer la charge par personne. */
export default function Dashboard({ orgId, members, ready = true, onShowMine }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");

  const load = useCallback(
    () => api(`/api/organizations/${orgId}/dashboard`).then((x) => { setD(x); setErr(""); }).catch((e) => setErr(e.message)),
    [orgId],
  );
  useEffect(() => { setD(null); setErr(""); load(); }, [load]);

  if (err) return <ErrorState message={err} onRetry={load} />;
  if (!d || !ready) return <DashboardSkeleton />;

  const open = d.tasksTotal - d.tasksByStatus.done;
  const rate = d.tasksTotal ? Math.round((d.tasksByStatus.done / d.tasksTotal) * 100) : 0;
  const max = Math.max(1, ...d.workload.map((w) => w.open));
  const name = (id) => {
    const m = members.find((x) => x.userId === id);
    return m ? memberName(m) : "Membre";
  };
  const kpis = [
    ["Projets actifs", d.projectsByStatus.active, "grid", ""],
    ["Tâches ouvertes", open, "list", ""],
    ["Tâches en retard", d.lateTasks, "clock", d.lateTasks > 0 ? "bad" : ""],
    ["Ouvertes sans responsable", d.unassignedOpenTasks, "flag", d.unassignedOpenTasks > 0 ? "warn" : ""],
  ];

  return (
    <div className="fade-in">
      <div className="mt-head db-head">
        <div>
          <h2>Tableau de bord</h2>
          <p>{d.projectsTotal} projet{d.projectsTotal > 1 ? "s" : ""} · {d.tasksTotal} tâche{d.tasksTotal > 1 ? "s" : ""} · {rate} % terminées</p>
        </div>
        <button type="button" className="mt-open" onClick={onShowMine}>Voir mes tâches</button>
      </div>

      <div className="rp-kpis">
        {kpis.map(([label, value, icon, tone]) => (
          <div key={label} className={`rp-kpi ${tone}`}><span className="rp-ico"><Icon name={icon} size={18} /></span><div><b>{value}</b><span>{label}</span></div></div>
        ))}
      </div>

      <div className="db-grid">
        <Breakdown title="Projets par statut" hint={`${d.projectsTotal} au total`} labels={PROJECT_STATUS} counts={d.projectsByStatus} colors={PROJECT_COLOR} />
        <Breakdown title="Tâches par statut" hint={`${rate} % terminées`} labels={TASK_STATUS} counts={d.tasksByStatus} colors={STATUS_COLOR} />
      </div>

      <section className="db-card db-wide">
        <header><h3>Charge par membre</h3><span>tâches ouvertes assignées</span></header>
        {d.workload.length === 0 ? (
          <div className="empty-tab"><Icon name="check" size={22} /><b>Aucune charge à afficher</b><span>Aucune tâche ouverte n'est assignée.</span></div>
        ) : (
          <ul className="db-load">
            {d.workload.map((w) => (
              <li key={w.userId}>
                <span className="who"><Avatar name={name(w.userId)} size={28} /><b>{name(w.userId)}</b></span>
                <div className="bar" role="img" aria-label={`${w.open} ouvertes`}>
                  <i style={{ width: `${(w.open / max) * 100}%` }} />
                </div>
                <span className="num">{w.open}</span>
                {w.late > 0 ? <em className="late-pill">{w.late} en retard</em> : <em className="ok-pill">à jour</em>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
