import { useEffect, useState } from "react";
import { usePerms } from "./perms.js";
import { api } from "./api.js";
import { RowsSkeleton } from "./Skeleton.jsx";
import { Icon } from "./ui.jsx";
import { STATUS_COLOR, TASK_STATUS, isLate, shortDate } from "./labels.js";

/** Tâches qui doivent être terminées avant celle-ci. */
export default function TaskDependencies({ orgId, projectId, taskId }) {
  const { canEdit } = usePerms();
  const [dependencies, setDependencies] = useState(null);
  const [adding, setAdding] = useState(false);
  const [availableTasks, setAvailableTasks] = useState(null);
  const [selectedTask, setSelectedTask] = useState("");
  const [err, setErr] = useState("");
  const base = `/api/organizations/${orgId}/projects/${projectId}/tasks/${taskId}/dependencies`;
  const tasksBase = `/api/organizations/${orgId}/projects/${projectId}/tasks`;

  useEffect(() => {
    api(base).then(setDependencies).catch((e) => setErr(e.message));
    api(tasksBase).then(setAvailableTasks).catch((e) => { setAvailableTasks([]); setErr(e.message); });
  }, [base, tasksBase]);

  const blocking = (dependencies ?? [])
    .map((dep) => ({ dep, task: (availableTasks ?? []).find((t) => t.id === dep.dependsOnId) }))
    .filter((x) => x.task);
  const blockingIds = (dependencies ?? []).map((d) => d.dependsOnId);
  const available = (availableTasks ?? []).filter((t) => t.id !== taskId && !blockingIds.includes(t.id));

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

  const ready = !!dependencies && !!availableTasks;
  const pending = blocking.filter((x) => x.task.status !== "done").length;
  return (
    <div className="dp">
      <p className="dp-hint">Ces tâches doivent être terminées avant que celle-ci puisse avancer.</p>
      {err && <p className="error" style={{ padding: 0 }}>{err}</p>}
      {!ready && !err ? (
        <RowsSkeleton rows={2} h={56} label="Chargement des dépendances" />
      ) : ready && (
        <div className="fade-in">
          {blocking.length > 0 ? (
            <>
              <div className={`dp-state ${pending ? "wait" : "ok"}`}>
                <Icon name={pending ? "clock" : "check"} size={16} />
                {pending ? `${pending} tâche${pending > 1 ? "s" : ""} bloquante${pending > 1 ? "s" : ""} à terminer` : "Toutes les dépendances sont terminées"}
              </div>
              <ul className="dp-list">
                {blocking.map(({ dep, task }) => {
                  const lt = isLate(task);
                  return (
                    <li key={dep.id}>
                      <span className="dp-st"><i style={{ background: STATUS_COLOR[task.status] }} />{TASK_STATUS[task.status]}</span>
                      <span className={`dp-title ${task.status === "done" ? "done" : ""}`}>{task.title}</span>
                      {task.dueDate && <span className={`dp-due ${lt ? "late" : "muted"}`}>{shortDate(task.dueDate)}{lt && " · en retard"}</span>}
                      {canEdit && <button type="button" className="ib2" title="Retirer la dépendance" aria-label={`Retirer la dépendance « ${task.title} »`} onClick={() => removeDependency(dep)}><Icon name="close" size={16} /></button>}
                    </li>
                  );
                })}
              </ul>
            </>
          ) : !adding && (
            <div className="empty-tab"><Icon name="subtask" size={22} /><b>Aucune dépendance</b><span>Cette tâche peut commencer immédiatement.</span></div>
          )}
        </div>
      )}
      {adding ? (
        <div className="dp-add">
          <select aria-label="Tâche bloquante" value={selectedTask} onChange={(e) => setSelectedTask(e.target.value)}>
            <option value="">Sélectionner une tâche bloquante</option>
            {available.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
          <button disabled={!selectedTask} onClick={addDependency}>Ajouter</button>
          <button className="ghost" onClick={() => setAdding(false)}>Annuler</button>
        </div>
      ) : (
        canEdit && <button type="button" className="add-dash" disabled={!ready} onClick={() => setAdding(true)}><Icon name="plus" size={15} /> Ajouter une dépendance</button>
      )}
    </div>
  );
}
