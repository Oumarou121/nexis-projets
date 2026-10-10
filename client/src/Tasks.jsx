import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api.js";
import Calendar from "./Calendar.jsx";
import Gantt from "./Gantt.jsx";
import Kanban from "./Kanban.jsx";
import LabelChips from "./LabelChips.jsx";
import Milestones from "./Milestones.jsx";
import ProjectHeader, { ProjectTitle } from "./ProjectHeader.jsx";
import ProjectSettings from "./ProjectSettings.jsx";
import Reports from "./Reports.jsx";
import TaskDetail from "./TaskDetail.jsx";
import TaskSearch, { applySearch, groupTasks } from "./TaskSearch.jsx";
import TaskSidebar from "./TaskSidebar.jsx";
import { Avatar, DateField, Icon, PriorityStar, StatusPill } from "./ui.jsx";
import { PRIORITY, TASK_STATUS, isLate, memberName, projectColor, shortDate } from "./labels.js";

const VIEW_KEY = "nexis.tasks.view";
const readView = () => {
  try {
    const stored = localStorage.getItem(VIEW_KEY);
    if (stored === "list" || stored === "gantt" || stored === "reports" || stored === "calendar") return stored;
    return "kanban";
  } catch {
    return "kanban";
  }
};

const EMPTY = { title: "", description: "", labels: "", assigneeId: "", priority: "medium", dueDate: "" };
const parseLabels = (s) => s.split(",").map((x) => x.trim()).filter(Boolean);

/** Tâches d'un projet. `members` vient de NEXIS Identity ; `canAssign` = droit de les lister. */
export default function Tasks({ orgId, project: initial, members, canAssign, command, onBack, onNav }) {
  const [project, setProject] = useState(initial);
  const [list, setList] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [err, setErr] = useState("");
  const [view, setViewState] = useState(readView);
  const [openId, setOpenId] = useState(null);
  const [labelFilter, setLabelFilter] = useState("");
  const [search, setSearch] = useState({ q: "", filters: [], groupBy: "" });
  const [creating, setCreating] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showMilestones, setShowMilestones] = useState(false);
  const [sidebarTask, setSidebarTask] = useState(null);
  const [closedGroups, setClosedGroups] = useState(() => new Set());
  const base = `/api/organizations/${orgId}/projects/${project.id}/tasks`;

  // Commandes du menu Configuration (Paramètres, Jalons).
  useEffect(() => {
    if (command?.name === "settings") setShowSettings(true);
    if (command?.name === "milestones") setShowMilestones(true);
  }, [command]);
  const who = (id) => members.find((m) => m.userId === id);

  const load = useCallback(() => api(base).then(setList).catch((e) => setErr(e.message)), [base]);
  useEffect(() => { load(); }, [load]);

  // Dépendances de tout le projet (flèches du Gantt). Rechargées à l'ouverture de la vue et au
  // retour d'une fiche tâche, où on peut en ajouter ou en retirer. Échec : pas de flèches.
  const [deps, setDeps] = useState([]);
  const depsBase = `/api/organizations/${orgId}/projects/${project.id}/dependencies`;
  useEffect(() => {
    if (view !== "gantt" || openId) return;
    let alive = true;
    api(depsBase).then((d) => alive && setDeps(d)).catch(() => alive && setDeps([]));
    return () => { alive = false; };
  }, [view, openId, depsBase]);

  async function onCreate(e) {
    e.preventDefault();
    try {
      await api(base, "POST", {
        title: form.title,
        ...(form.description.trim() ? { description: form.description } : {}),
        priority: form.priority,
        ...(parseLabels(form.labels).length ? { labels: parseLabels(form.labels) } : {}),
        ...(form.assigneeId ? { assigneeId: form.assigneeId } : {}),
        ...(form.dueDate ? { dueDate: form.dueDate } : {}),
      });
      setForm(EMPTY);
      setErr("");
      setCreating(false);
      load();
    } catch (e2) {
      setErr(e2.message);
    }
  }

  // N'envoie que le champ modifié (affecter exige un droit en plus, pas changer un statut).
  async function change(task, changes) {
    try {
      const updated = await api(`${base}/${task.id}`, "PATCH", changes);
      setList((l) => l.map((t) => (t.id === task.id ? { ...t, ...updated } : t)));
      setErr("");
      return null;
    } catch (e) {
      setErr(e.message);
      return e.message;
    }
  }

  // Création rapide depuis une colonne Kanban : titre + statut de la colonne.
  async function quickAdd(title, status) {
    try {
      const created = await api(base, "POST", { title, status });
      setList((l) => [...l, { ...created, commentCount: 0, attachmentCount: 0 }]);
      setErr("");
      return true;
    } catch (e) {
      setErr(e.message);
      return false;
    }
  }

  // Sous-tâches : un seul niveau, le parent ne change plus après la création.
  async function addSub(parent, title) {
    try {
      const created = await api(base, "POST", { title, parentId: parent.id });
      setList((l) => [...l, { ...created, commentCount: 0, attachmentCount: 0 }]);
      setErr("");
      return null;
    } catch (e) {
      return e.message;
    }
  }

  const setCount = useCallback(
    (id, n) => setList((l) => l.map((t) => (t.id === id ? { ...t, commentCount: n } : t))),
    [],
  );
  const setFileCount = useCallback(
    (id, n) => setList((l) => l.map((t) => (t.id === id ? { ...t, attachmentCount: n } : t))),
    [],
  );
  const top = useMemo(() => list.filter((t) => !t.parentId), [list]);
  const subsOf = useMemo(() => {
    const m = new Map();
    for (const t of list) if (t.parentId) m.set(t.parentId, [...(m.get(t.parentId) ?? []), t]);
    return m;
  }, [list]);
  const subStats = useMemo(() => {
    const m = new Map();
    for (const [id, subs] of subsOf) m.set(id, { done: subs.filter((s) => s.status === "done").length, total: subs.length });
    return m;
  }, [subsOf]);
  const allLabels = useMemo(() => [...new Set(top.flatMap((t) => t.labels ?? []))].sort(), [top]);
  const shown = applySearch(labelFilter ? top.filter((t) => t.labels?.includes(labelFilter)) : top, search);
  const groups = groupTasks(shown, search.groupBy, members);
  const closeDetail = useCallback(() => setOpenId(null), []);
  const openTask = list.find((t) => t.id === openId);

  function setView(v) {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* stockage indisponible : la préférence n'est simplement pas gardée */
    }
  }

  // Déplacement entre colonnes : affiché tout de suite, annulé si le serveur refuse.
  async function move(task, status) {
    if (task.status === status) return;
    const previous = task.status;
    setList((l) => l.map((t) => (t.id === task.id ? { ...t, status } : t)));
    try {
      const updated = await api(`${base}/${task.id}`, "PATCH", { status });
      setList((l) => l.map((t) => (t.id === task.id ? { ...t, ...updated } : t)));
      setErr("");
      return null;
    } catch (e) {
      setList((l) => l.map((t) => (t.id === task.id ? { ...t, status: previous } : t)));
      setErr(e.message);
      return e.message;
    }
  }

  async function remove(task) {
    if (!window.confirm(`Supprimer la tâche « ${task.title} » ?`)) return;
    try {
      await api(`${base}/${task.id}`, "DELETE");
      setList((l) => l.filter((t) => t.id !== task.id && t.parentId !== task.id));
    } catch (e) {
      setErr(e.message);
    }
  }

  const assigneeSelect = (value, onChange, label) => (
    <select aria-label={label} value={value ?? ""} onChange={onChange}>
      <option value="">Non assignée</option>
      {members.map((m) => <option key={m.userId} value={m.userId}>{memberName(m)}</option>)}
    </select>
  );

  // Progression d'une tâche : sous-tâches terminées, sinon 100 % si terminée.
  const progressOf = (t) => {
    const st = subStats.get(t.id);
    return st ? Math.round((st.done / st.total) * 100) : t.status === "done" ? 100 : 0;
  };
  const avgProgress = (items) => (items.length ? Math.round(items.reduce((n, t) => n + progressOf(t), 0) / items.length) : 0);
  const Progress = ({ value }) => (
    <span className="prog" title={`${value} %`}>
      <span className="track" aria-hidden="true"><i style={{ width: `${value}%` }} /></span>
      <span>{value} %</span>
    </span>
  );

  const row = (t) => (
    <tr key={t.id}>
      <td>
        <div className="ttl">
          <PriorityStar priority={t.priority} onChange={(priority) => change(t, { priority })} />
          <button className="link" onClick={() => setOpenId(t.id)}>
            <span className={t.status === "done" ? "done" : ""}>{t.title}</span>
          </button>
          <LabelChips labels={t.labels} />
          {subStats.get(t.id) && <span className="ctr" title="Sous-tâches terminées"><Icon name="subtask" size={13} />{subStats.get(t.id).done}/{subStats.get(t.id).total}</span>}
          {t.commentCount > 0 && <span className="ctr"><Icon name="comment" size={13} />{t.commentCount}</span>}
          {t.attachmentCount > 0 && <span className="ctr"><Icon name="clip" size={13} />{t.attachmentCount}</span>}
        </div>
      </td>
      <td>
        {canAssign ? (
          <div className="ass">
            <Avatar member={who(t.assigneeId)} size={24} />
            <select aria-label="Assignée à" value={t.assigneeId ?? ""} onChange={(e) => change(t, { assigneeId: e.target.value || null })}>
              <option value="">Non assignée</option>
              {members.map((m) => <option key={m.userId} value={m.userId}>{memberName(m)}</option>)}
            </select>
          </div>
        ) : t.assigneeId ? <Avatar name="Assignée" size={24} /> : <span className="muted">—</span>}
      </td>
      <td>
        <DateField label="Échéance" value={t.dueDate} late={isLate(t)} placeholder="—" onChange={(dueDate) => change(t, { dueDate })} />
      </td>
      <td><Progress value={progressOf(t)} /></td>
      <td><StatusPill status={t.status} onChange={(s) => move(t, s)} /></td>
      <td className="acts">
        <button className="icon-btn" onClick={() => setSidebarTask(t)} aria-label={`Aperçu rapide ${t.title}`} title="Aperçu rapide"><Icon name="expand" /></button>
        <button className="icon-btn" onClick={() => remove(t)} aria-label={`Supprimer ${t.title}`} title="Supprimer"><Icon name="trash" /></button>
      </td>
    </tr>
  );

  if (openTask) {
    const at = shown.findIndex((t) => t.id === openTask.id);
    const go = (step) => setOpenId(shown[(at + step + shown.length) % shown.length].id);
    return (
      <TaskDetail
        key={openTask.id}
        orgId={orgId}
        projectId={project.id}
        projectName={project.name}
        task={openTask}
        members={members}
        canAssign={canAssign}
        pager={at >= 0 ? { index: at, total: shown.length, onPrev: () => go(-1), onNext: () => go(1) } : null}
        onClose={closeDetail}
        onProjects={onBack}
        onCount={setCount}
        onFileCount={setFileCount}
        subtasks={subsOf.get(openTask.id) ?? []}
        onChangeTask={change}
        onMoveTask={move}
        onAddSub={addSub}
        onRemoveSub={remove}
      />
    );
  }

  return (
    <>
      <div className="pg-top"><button type="button" className="link" onClick={onBack}>Projets</button> / <span>{project.name}</span></div>
      <div className="pg-head">
        <div className="pg-title">
          <i className="pj-dot lg" style={{ background: projectColor(project.name, project.color) }} aria-hidden="true" />
          <ProjectTitle orgId={orgId} project={project} onChange={setProject} />
          <button type="button" className="pg-gear" onClick={() => setShowSettings(true)} title="Paramètres du projet" aria-label="Paramètres du projet"><Icon name="gear" size={18} /></button>
        </div>
        <div className="pg-meta">
          <span className="pg-prog"><span className="pj-pb"><i style={{ width: `${top.length ? Math.round((top.filter((t) => t.status === "done").length / top.length) * 100) : 0}%`, background: projectColor(project.name, project.color) }} /></span>{top.filter((t) => t.status === "done").length} / {top.length} tâches</span>
          <span className="pj-avs">
            {[...new Set(top.map((t) => t.assigneeId).filter(Boolean))].slice(0, 4).map((id) => {
              const m = members.find((x) => x.userId === id);
              const n = m ? memberName(m) : "Membre";
              return <span key={id} className="pj-av" title={n}>{n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}</span>;
            })}
          </span>
        </div>
        <button className="pj-new" onClick={() => setCreating(true)}><Icon name="plus" size={18} /> Nouvelle tâche</button>
      </div>
      <ProjectHeader orgId={orgId} project={project} onChange={setProject} onDeleted={onBack} />
      <div className="pg-tools">
        <div className="pg-sec" role="group" aria-label="Sections du projet">
          <button type="button" className="on" aria-current="page">Tâches</button>
          <button type="button" onClick={() => setShowMilestones(true)}>Jalons</button>
          <button type="button" onClick={() => onNav?.("dashboard")}>Tableau de bord</button>
        </div>
        <div className="cp-mid"><TaskSearch projectId={project.id} state={search} onChange={setSearch} /></div>
        <div className="cp-right">
          {allLabels.length > 0 && (
            <select style={{ flex: "none" }} aria-label="Filtrer par étiquette" value={labelFilter} onChange={(e) => setLabelFilter(e.target.value)}>
              <option value="">Toutes les étiquettes</option>
              {allLabels.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          )}
          <span className="cp-count">{shown.length} tâche{shown.length > 1 ? "s" : ""}</span>
          <div className="seg" role="tablist" aria-label="Vues">
            {[["kanban", "Kanban", "kanban"], ["list", "Liste", "list"], ["gantt", "Planning", "gantt"], ["calendar", "Calendrier", "calendar"], ["reports", "Rapports", "chart"]].map(([id, label, icon]) => (
              <button key={id} role="tab" aria-selected={view === id} className={view === id ? "on" : ""} onClick={() => setView(id)} title={label} aria-label={label}>
                <Icon name={icon} size={17} />
              </button>
            ))}
          </div>
        </div>
      </div>
      {err && <p className="error">{err}</p>}

      {view === "kanban" ? (
        <Kanban tasks={shown} subStats={subStats} members={members} canAssign={canAssign} onMove={move} onChange={change} onQuickAdd={quickAdd} onRemove={remove} onOpen={(task) => setOpenId(task.id)} onSidebar={(task) => setSidebarTask(task)} />
      ) : view === "gantt" ? (
        <Gantt tasks={shown} dependencies={deps} members={members} onMove={move} onOpen={(task) => setOpenId(task.id)} onSidebar={(task) => setSidebarTask(task)} />
      ) : view === "calendar" ? (
        <Calendar tasks={shown} members={members} onOpen={(task) => setOpenId(task.id)} onSidebar={(task) => setSidebarTask(task)} />
      ) : view === "reports" ? (
        <Reports tasks={shown} members={members} />
      ) : (
        <div className="table-wrap">
          <table className="lt">
            <thead>
              <tr><th>Tâche</th><th>Responsable</th><th>Échéance</th><th>Progression</th><th>Statut</th><th /></tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <Fragment key={g.key}>
                  {g.label && (
                    <tr className={`gh ${closedGroups.has(g.key) ? "closed" : ""}`} onClick={() => setClosedGroups((c) => { const n = new Set(c); n.has(g.key) ? n.delete(g.key) : n.add(g.key); return n; })}>
                      <td colSpan={6}>
                        <div className="gh-in">
                          <Icon name="chevron" size={14} />{g.label} <span className="muted">({g.items.length})</span>
                          <span className="tot">{g.items.filter(isLate).length > 0 && <span className="late">{g.items.filter(isLate).length} en retard · </span>}{avgProgress(g.items)} % terminé</span>
                        </div>
                      </td>
                    </tr>
                  )}
                  {!closedGroups.has(g.key) && g.items.map(row)}
                </Fragment>
              ))}
              {shown.length === 0 && !err && <tr><td colSpan={6} className="muted" style={{ textAlign: "center", padding: 32 }}>Aucune tâche.</td></tr>}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>{shown.length} tâche{shown.length > 1 ? "s" : ""}</td>
                <td>{shown.filter(isLate).length > 0 && <span className="late">{shown.filter(isLate).length} en retard</span>}</td>
                <td><Progress value={avgProgress(shown)} /></td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {creating && (
        <div className="overlay center" onMouseDown={(e) => e.target === e.currentTarget && setCreating(false)}>
          <form className="dlg" onSubmit={onCreate} role="dialog" aria-label="Nouvelle tâche">
            <header>Nouvelle tâche <button type="button" className="x" aria-label="Fermer" onClick={() => setCreating(false)}><Icon name="close" /></button></header>
            <div>
              <input className="nm" autoFocus placeholder="Titre de la tâche" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              <div className="fg">
                {canAssign && <div><label>Responsable</label>{assigneeSelect(form.assigneeId, (e) => setForm({ ...form, assigneeId: e.target.value }), "Assigner à")}</div>}
                <div><label>Priorité</label>
                  <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                    {Object.entries(PRIORITY).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div><label>Échéance</label><input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></div>
                <div><label>Étiquettes</label><input placeholder="séparées par des virgules" value={form.labels} onChange={(e) => setForm({ ...form, labels: e.target.value })} /></div>
              </div>
              <div className="fld"><label>Description</label><textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            </div>
            <footer><button disabled={!form.title.trim()}>Ajouter</button><button type="button" className="ghost" onClick={() => setCreating(false)}>Annuler</button></footer>
          </form>
        </div>
      )}
      {showSettings && (
        <div className="overlay center" onMouseDown={(e) => e.target === e.currentTarget && setShowSettings(false)}>
          <ProjectSettings orgId={orgId} project={project} onChange={setProject} onClose={() => setShowSettings(false)} />
        </div>
      )}
      {showMilestones && (
        <div className="overlay center" onMouseDown={(e) => e.target === e.currentTarget && setShowMilestones(false)}>
          <div className="dlg wide" role="dialog" aria-label="Jalons du projet">
            <header>
              Jalons du projet
              <button type="button" className="x" aria-label="Fermer" onClick={() => setShowMilestones(false)}><Icon name="close" /></button>
            </header>
            <div className="set-body">
              <Milestones orgId={orgId} projectId={project.id} tasks={top} onOpen={(id) => { setShowMilestones(false); setOpenId(id); }} onChange={(updated) => {
                setList((l) => l.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)));
              }} />
            </div>
          </div>
        </div>
      )}
      {sidebarTask && (
        <TaskSidebar
          task={{ ...sidebarTask, subtaskStats: subStats.get(sidebarTask.id) }}
          members={members}
          onClose={() => setSidebarTask(null)}
          onOpenDetail={(id) => {
            setSidebarTask(null);
            setOpenId(id);
          }}
        />
      )}
    </>
  );
}
