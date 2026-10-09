import { useEffect, useState } from "react";
import { api } from "./api.js";
import { Avatar } from "./ui.jsx";
import { PROJECT_STATUS, STATUS_COLOR, TASK_STATUS, memberName } from "./labels.js";

const PROJECT_COLOR = { planned: "#9ca3af", active: "#22c55e", on_hold: "#f59e0b", done: "#3b82f6" };

function Stat({ label, value, tone, dot }) {
  return (
    <div className={`card stat ${tone ?? ""}`}>
      <strong>{value}</strong>
      <span className="muted small">{dot && <i className="dot" style={{ background: dot, marginRight: 6 }} />}{label}</span>
    </div>
  );
}

/** Indicateurs de l'organisation active. `members` sert à nommer la charge par personne. */
export default function Dashboard({ orgId, members, onShowMine }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api(`/api/organizations/${orgId}/dashboard`).then(setD).catch((e) => setErr(e.message));
  }, [orgId]);

  if (err) return <p className="error" style={{ padding: 0 }}>{err}</p>;
  if (!d) return <p className="muted">Chargement…</p>;

  const open = d.tasksTotal - d.tasksByStatus.done;
  const max = Math.max(1, ...d.workload.map((w) => w.open));
  const name = (id) => {
    const m = members.find((x) => x.userId === id);
    return m ? memberName(m) : "Membre";
  };

  return (
    <>
      <div className="crumb2" style={{ margin: "14px 0 10px" }}>
        <span className="up">Reporting</span>
        <span className="nm">Tableau de bord</span>
      </div>
      <div className="stats">
        <Stat label="Projets actifs" value={d.projectsByStatus.active} />
        <Stat label="Tâches ouvertes" value={open} />
        <Stat label="Tâches en retard" value={d.lateTasks} tone={d.lateTasks > 0 ? "bad" : ""} />
        <Stat label="Ouvertes sans responsable" value={d.unassignedOpenTasks} />
      </div>

      <h3>Projets par statut</h3>
      <div className="stats">
        {Object.entries(PROJECT_STATUS).map(([k, l]) => <Stat key={k} label={l} value={d.projectsByStatus[k]} dot={PROJECT_COLOR[k]} />)}
      </div>

      <h3>Tâches par statut</h3>
      <div className="stats">
        {Object.entries(TASK_STATUS).map(([k, l]) => <Stat key={k} label={l} value={d.tasksByStatus[k]} dot={STATUS_COLOR[k]} />)}
      </div>

      <h3>Charge par membre <span className="muted small">(tâches ouvertes)</span></h3>
      <ul className="list">
        {d.workload.map((w) => (
          <li key={w.userId} className="card load">
            <span className="ass"><Avatar name={name(w.userId)} size={24} />{name(w.userId)}</span>
            <div className="bar"><i style={{ width: `${(w.open / max) * 100}%` }} /></div>
            <span>{w.open}{w.late > 0 && <span className="late"> · {w.late} en retard</span>}</span>
          </li>
        ))}
        {d.workload.length === 0 && <li className="muted">Aucune tâche ouverte assignée.</li>}
      </ul>
      <button className="link" onClick={onShowMine}>Voir mes tâches →</button>
    </>
  );
}
