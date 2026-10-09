import { useState } from "react";
import { Avatar } from "./ui.jsx";
import { PRIORITY, STATUS_COLOR, TASK_STATUS, isLate, memberName, shortDate } from "./labels.js";

export default function TaskSidebar({ task, members, onClose, onOpenDetail }) {
  const [open, setOpen] = useState(true);

  function toggle() {
    setOpen(!open);
  }

  const nameOf = (id) => {
    const m = members.find((x) => x.userId === id);
    return m ? memberName(m) : "Non assigné";
  };

  return (
    <>
      <div className={`sidebar ${open ? "open" : ""}`}>
        <div className="sidebar-header">
          <h3>Détails de la tâche</h3>
          <button className="sidebar-close" onClick={toggle}>×</button>
        </div>

        <div className="sidebar-section">
          <h4>Informations</h4>
          <div className="sidebar-item">
            <span className="sidebar-item-label">Titre</span>
            <span className="sidebar-item-value">{task.title}</span>
          </div>
          <div className="sidebar-item">
            <span className="sidebar-item-label">Statut</span>
            <span className="sidebar-item-value"><i className="dot" style={{ background: STATUS_COLOR[task.status], marginRight: 6 }} />{TASK_STATUS[task.status]}</span>
          </div>
          <div className="sidebar-item">
            <span className="sidebar-item-label">Priorité</span>
            <span className={`sidebar-item-value p-${task.priority}`}>{PRIORITY[task.priority]}</span>
          </div>
          <div className="sidebar-item">
            <span className="sidebar-item-label">Échéance</span>
            <span className={`sidebar-item-value ${isLate(task) ? "late" : ""}`}>
              {task.dueDate ? `${shortDate(task.dueDate)}${isLate(task) ? " · en retard" : ""}` : "—"}
            </span>
          </div>
          <div className="sidebar-item">
            <span className="sidebar-item-label">Responsable</span>
            <span className="sidebar-item-value">{task.assigneeId ? <span className="ass"><Avatar name={nameOf(task.assigneeId)} size={22} />{nameOf(task.assigneeId)}</span> : "Non assignée"}</span>
          </div>
        </div>

        <div className="sidebar-section">
          <h4>Activité</h4>
          <div className="sidebar-item">
            <span className="sidebar-item-label">Commentaires</span>
            <span className="sidebar-item-value">{task.commentCount || 0}</span>
          </div>
          <div className="sidebar-item">
            <span className="sidebar-item-label">Pièces jointes</span>
            <span className="sidebar-item-value">{task.attachmentCount || 0}</span>
          </div>
          <div className="sidebar-item">
            <span className="sidebar-item-label">Sous-tâches</span>
            <span className="sidebar-item-value">{task.subtaskStats ? `${task.subtaskStats.done}/${task.subtaskStats.total}` : "—"}</span>
          </div>
        </div>

        <div className="sidebar-section">
          <h4>Actions rapides</h4>
          <button style={{ width: "100%", marginBottom: "8px" }} onClick={() => onOpenDetail(task.id)}>
            Ouvrir en détail
          </button>
          <button className="ghost" style={{ width: "100%" }} onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
      <div className={`sidebar-overlay ${open ? "on" : ""}`} onClick={toggle}></div>
    </>
  );
}
