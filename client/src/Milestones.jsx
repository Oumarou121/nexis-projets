import { api } from "./api.js";
import { Icon } from "./ui.jsx";
import { STATUS_COLOR, TASK_STATUS, isLate, shortDate } from "./labels.js";

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function relDue(d) {
  const days = Math.round((new Date(`${d}T12:00:00`) - new Date(`${iso(new Date())}T12:00:00`)) / 86400000);
  if (days === 0) return "Aujourd'hui";
  if (days === 1) return "Demain";
  if (days === -1) return "Hier";
  return days > 0 ? `Dans ${days} j` : `${-days} j de retard`;
}

/** Liste des jalons du projet (tâches marquées « jalon ») avec leur avancement global. */
export default function Milestones({ orgId, projectId, tasks, onOpen, onChange }) {
  // Terminés en bas ; le reste par échéance (sans date en dernier).
  const ms = (tasks?.filter((t) => t.isMilestone) || []).sort((a, b) => {
    if ((a.status === "done") !== (b.status === "done")) return a.status === "done" ? 1 : -1;
    return (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");
  });
  const completed = ms.filter((m) => m.status === "done").length;
  const late = ms.filter(isLate).length;
  const total = ms.length;
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

  async function toggleMilestone(task) {
    try {
      const base = `/api/organizations/${orgId}/projects/${projectId}/tasks`;
      const updated = await api(`${base}/${task.id}`, "PATCH", { isMilestone: !task.isMilestone });
      onChange?.(updated);
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <div className="ms2">
      <div className="ms-sum">
        <div className="ms-ring" style={{ "--p": progress }} aria-hidden="true"><span>{progress}%</span></div>
        <div>
          <b>{completed} sur {total}</b>
          <span className="muted"> jalon{total > 1 ? "s" : ""} atteint{completed > 1 ? "s" : ""}</span>
          <div className="ms-sub">{late > 0 ? <span className="late">{late} en retard</span> : <span className="muted">{total > 0 ? "Aucun retard" : "Aucun jalon"}</span>}</div>
        </div>
      </div>

      {ms.length === 0 ? (
        <div className="empty-tab"><Icon name="flag" size={22} /><b>Aucun jalon défini</b><span>Marquez des tâches importantes comme jalons pour suivre les grandes étapes du projet.</span></div>
      ) : (
        <ol className="ms-line">
          {ms.map((m) => {
            const done = m.status === "done";
            const lt = isLate(m);
            return (
              <li key={m.id} className={`${done ? "done-ms" : ""} ${lt ? "late-ms" : ""}`}>
                <span className="ms-node"><Icon name={done ? "check" : "flag"} size={14} /></span>
                <div className="ms-card">
                  <div className="ms-main">
                    <button type="button" className="ms-title" onClick={() => onOpen?.(m.id)}>
                      <span className={done ? "done" : ""}>{m.title}</span>
                    </button>
                    <span className="ms-meta">
                      <span className="ms-st"><i className="dot" style={{ background: STATUS_COLOR[m.status] }} />{TASK_STATUS[m.status]}</span>
                      {m.dueDate ? (
                        <span className={lt ? "late" : "muted"}><Icon name="calendar" size={13} /> {shortDate(m.dueDate)}{!done && ` · ${relDue(m.dueDate)}`}</span>
                      ) : <span className="muted">Sans échéance</span>}
                    </span>
                  </div>
                  <button type="button" className="icon-btn" title="Retirer des jalons" aria-label={`Retirer « ${m.title} » des jalons`} onClick={() => toggleMilestone(m)}><Icon name="close" size={15} /></button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
