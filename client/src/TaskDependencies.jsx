import { useEffect, useState } from "react";
import { api } from "./api.js";
import { Icon } from "./ui.jsx";
import { STATUS_COLOR, TASK_STATUS } from "./labels.js";

/** Tâches qui doivent être terminées avant celle-ci. */
export default function TaskDependencies({ orgId, projectId, taskId }) {
  const [dependencies, setDependencies] = useState(null);
  const [adding, setAdding] = useState(false);
  const [availableTasks, setAvailableTasks] = useState([]);
  const [selectedTask, setSelectedTask] = useState("");
  const [err, setErr] = useState("");
  const base = `/api/organizations/${orgId}/projects/${projectId}/tasks/${taskId}/dependencies`;
  const tasksBase = `/api/organizations/${orgId}/projects/${projectId}/tasks`;

  useEffect(() => {
    api(base).then(setDependencies).catch((e) => setErr(e.message));
    api(tasksBase).then(setAvailableTasks).catch((e) => setErr(e.message));
  }, [base, tasksBase]);

  const blocking = (dependencies ?? [])
    .map((dep) => ({ dep, task: availableTasks.find((t) => t.id === dep.dependsOnId) }))
    .filter((x) => x.task);
  const blockingIds = (dependencies ?? []).map((d) => d.dependsOnId);
  const available = availableTasks.filter((t) => t.id !== taskId && !blockingIds.includes(t.id));

  async function addDependency() {
    if (!selectedTask) return;
    try {
      const created = await api(base, "POST", { dependsOnId: selectedTask });
      setDependencies((d) => [created, ...(d ?? [])]);
      setSelectedTask("");
      setAdding(false);
      setErr("");
    } catch (e) {
      setErr(e.message);
    }
  }

  async function removeDependency(dep) {
    if (!window.confirm("Supprimer cette dépendance ?")) return;
    try {
      await api(`${base}/${dep.id}`, "DELETE");
      setDependencies((d) => d.filter((x) => x.id !== dep.id));
      setErr("");
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <div>
      <p className="muted small" style={{ margin: "0 0 8px" }}>Bloquée par {blocking.length > 0 ? `(${blocking.length})` : ""} : ces tâches doivent être terminées avant celle-ci.</p>
      {err && <p className="error" style={{ padding: 0 }}>{err}</p>}
      {dependencies && blocking.length === 0 && !adding && <p className="muted small">Aucune dépendance : cette tâche peut commencer immédiatement.</p>}
      {blocking.length > 0 && (
        <ul className="ms-list">
          {blocking.map(({ dep, task }) => (
            <li key={dep.id}>
              <i className="dot" style={{ background: STATUS_COLOR[task.status] }} />
              <span className={`ms-title ${task.status === "done" ? "done" : ""}`}>{task.title}</span>
              <span className="muted small ms-st">{TASK_STATUS[task.status]}</span>
              <button type="button" className="icon-btn" title="Retirer la dépendance" aria-label={`Retirer la dépendance « ${task.title} »`} onClick={() => removeDependency(dep)}><Icon name="close" size={15} /></button>
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <div className="row" style={{ marginTop: 8 }}>
          <select aria-label="Tâche bloquante" value={selectedTask} onChange={(e) => setSelectedTask(e.target.value)} style={{ flex: 1 }}>
            <option value="">Sélectionner une tâche bloquante</option>
            {available.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
          <button disabled={!selectedTask} onClick={addDependency}>Ajouter</button>
          <button className="ghost" onClick={() => setAdding(false)}>Annuler</button>
        </div>
      ) : (
        <button type="button" className="ghost" style={{ marginTop: 8 }} onClick={() => setAdding(true)}><Icon name="plus" size={14} /> Ajouter une dépendance</button>
      )}
    </div>
  );
}
