import { api } from "./api.js";
import { Icon } from "./ui.jsx";
import { STATUS_COLOR, TASK_STATUS, isLate, shortDate } from "./labels.js";

/** Liste des jalons du projet (tâches marquées « jalon ») avec leur avancement global. */
export default function Milestones({ orgId, projectId, tasks, onOpen, onChange }) {
  const ms = tasks?.filter((t) => t.isMilestone) || [];
  const completed = ms.filter((m) => m.status === "done").length;
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
    <div>
      <div className="ms-head">
        <span><b>{completed}/{total}</b> <span className="muted">jalon{total > 1 ? "s" : ""} atteint{completed > 1 ? "s" : ""}</span></span>
        <span className="prog" title={`${progress} %`}>
          <span className="track" aria-hidden="true"><i style={{ width: `${progress}%` }} /></span>
          <span>{progress} %</span>
        </span>
      </div>
      <ul className="ms-list">
        {ms.map((m) => (
          <li key={m.id}>
            <Icon name="flag" size={15} className="ms-flag" />
            <button type="button" className="link ms-title" onClick={() => onOpen?.(m.id)}>
              <span className={m.status === "done" ? "done" : ""}>{m.title}</span>
            </button>
            <span className="muted small ms-st"><i className="dot" style={{ background: STATUS_COLOR[m.status], marginRight: 6 }} />{TASK_STATUS[m.status]}</span>
            <span className={`small ms-due ${isLate(m) ? "late" : "muted"}`}>{m.dueDate ? `${shortDate(m.dueDate)}${isLate(m) ? " · en retard" : ""}` : "—"}</span>
            <button type="button" className="icon-btn" title="Retirer des jalons" aria-label={`Retirer « ${m.title} » des jalons`} onClick={() => toggleMilestone(m)}><Icon name="close" size={15} /></button>
          </li>
        ))}
        {ms.length === 0 && <li className="muted ms-empty">Aucun jalon défini. Marquez des tâches importantes comme jalons pour suivre les grandes étapes.</li>}
      </ul>
    </div>
  );
}
