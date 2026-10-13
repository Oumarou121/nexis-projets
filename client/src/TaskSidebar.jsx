import { useEffect, useState } from "react";
import { Avatar, Icon } from "./ui.jsx";
import { PRIORITY, taskColor, isLate, stageLabel, memberName, shortDate } from "./labels.js";

export default function TaskSidebar({ task, members, onClose, onOpenDetail }) {
  const [open] = useState(true);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const nameOf = (id) => {
    const m = members.find((x) => x.userId === id);
    return m ? memberName(m) : "Ancien membre";
  };
  const late = isLate(task);
  const sub = task.subtaskStats;
  const pct = sub && sub.total ? Math.round((sub.done / sub.total) * 100) : 0;

  return (
    <>
      <aside className={`sidebar ${open ? "open" : ""}`} aria-label="Aperçu de la tâche">
        <div className="sidebar-header">
          <span className="sb-kicker">Aperçu rapide</span>
          <button className="icon-btn sidebar-close" aria-label="Fermer" onClick={onClose}><Icon name="close" size={18} /></button>
        </div>

        <h3 className="sb-title">{task.title}</h3>
        <div className="sb-pills">
          <span className="sb-pill"><i className="dot" style={{ background: taskColor(task) }} />{stageLabel(task)}</span>
          <span className={`sb-pill p-${task.priority}`}><Icon name="flag" size={13} />{PRIORITY[task.priority]}</span>
        </div>

        <div className="sb-card">
          <div className="sidebar-item">
            <span className="sidebar-item-label">Échéance</span>
            <span className={`sidebar-item-value ${late ? "late" : ""}`}>
              {task.dueDate ? `${shortDate(task.dueDate)}${late ? " · en retard" : ""}` : "—"}
            </span>
          </div>
          <div className="sidebar-item">
            <span className="sidebar-item-label">Responsable</span>
            <span className="sidebar-item-value">
              {task.assigneeId ? <span className="ass"><Avatar name={nameOf(task.assigneeId)} size={24} />{nameOf(task.assigneeId)}</span> : <span className="muted">Non assignée</span>}
            </span>
          </div>
        </div>

        <div className="sb-stats">
          <div title="Commentaires"><Icon name="comment" size={16} /><b>{task.commentCount || 0}</b><span>Commentaires</span></div>
          <div title="Pièces jointes"><Icon name="clip" size={16} /><b>{task.attachmentCount || 0}</b><span>Fichiers</span></div>
          <div title="Sous-tâches"><Icon name="subtask" size={16} /><b>{sub ? `${sub.done}/${sub.total}` : "—"}</b><span>Sous-tâches</span></div>
        </div>
        {sub && sub.total > 0 && (
          <div className="sb-prog" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Sous-tâches terminées">
            <i style={{ width: `${pct}%` }} />
          </div>
        )}

        <div className="sb-actions">
          <button className="pj-ok" onClick={() => onOpenDetail(task.id)}>Ouvrir en détail</button>
          <button className="pj-ghost ghost" onClick={onClose}>Fermer</button>
        </div>
      </aside>
      <div className={`sidebar-overlay ${open ? "on" : ""}`} onClick={onClose}></div>
    </>
  );
}
