import { useEffect, useState } from "react";
import { api, download, upload } from "./api.js";
import LabelChips from "./LabelChips.jsx";
import TaskDependencies from "./TaskDependencies.jsx";
import Timesheets from "./Timesheets.jsx";
import { Avatar, DateField, Icon, PriorityStar } from "./ui.jsx";
import { MAX_FILE_BYTES, PRIORITY, TASK_STATUS, fileSize, fmtDuration, isLate, memberName, stageDurations } from "./labels.js";

const fmt = (iso) =>
  new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

const ACTIVITY_TYPES = { todo: "À faire", call: "Appel", email: "E-mail", meeting: "Réunion", note: "Note" };

/**
 * Fiche tâche en page pleine largeur (comme Odoo) : fil d'Ariane et pager, barre d'étapes,
 * champs sur deux colonnes, onglets, puis la discussion.
 * `pager` = { index, total, onPrev, onNext } pour passer d'une tâche à l'autre.
 */
export default function TaskDetail({ orgId, projectId, projectName, task, members, canAssign, pager, onClose, onProjects, onCount, onFileCount, subtasks, onChangeTask, onMoveTask, onAddSub, onRemoveSub }) {
  const [title, setTitle] = useState(task.title);
  useEffect(() => setTitle(task.title), [task.id, task.title]);
  const [labelText, setLabelText] = useState("");
  const [subTitle, setSubTitle] = useState("");
  const [comments, setComments] = useState(null);
  const [files, setFiles] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("description");
  const [scheduling, setScheduling] = useState(false);
  const [activities, setActivities] = useState(null);
  const [activityForm, setActivityForm] = useState({ type: "todo", summary: "", dueDate: "", assigneeId: "" });
  const base = `/api/organizations/${orgId}/projects/${projectId}/tasks/${task.id}/comments`;
  const filesBase = `/api/organizations/${orgId}/projects/${projectId}/tasks/${task.id}/attachments`;
  const activitiesBase = `/api/organizations/${orgId}/projects/${projectId}/tasks/${task.id}/activities`;
  const historyBase = `/api/organizations/${orgId}/projects/${projectId}/tasks/${task.id}/status-history`;
  const nameOf = (id) => {
    const m = members.find((x) => x.userId === id);
    return m ? memberName(m) : "Un membre";
  };

  useEffect(() => {
    api(base).then(setComments).catch((e) => setErr(e.message));
  }, [base]);

  useEffect(() => {
    api(filesBase).then(setFiles).catch((e) => setErr(e.message));
  }, [filesBase]);

  useEffect(() => {
    api(activitiesBase).then(setActivities).catch((e) => setErr(e.message));
  }, [activitiesBase]);

  // Historique des statuts : rechargé à chaque changement de statut. Une erreur (migration pas
  // encore appliquée, par exemple) masque seulement les durées, sans gêner la fiche.
  const [history, setHistory] = useState(null);
  useEffect(() => {
    let alive = true;
    api(historyBase).then((h) => alive && setHistory(h)).catch(() => alive && setHistory(null));
    return () => { alive = false; };
  }, [historyBase, task.status]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);
  const durations = stageDurations(history, now);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && !["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName) && onClose();
    window.addEventListener("keydown", onKey);
    window.scrollTo(0, 0);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, task.id]);

  async function saveTitle() {
    const v = title.trim();
    if (!v) return setTitle(task.title);
    if (v === task.title) return;
    const msg = await onChangeTask(task, { title: v });
    if (msg) { setErr(msg); setTitle(task.title); }
  }

  async function saveLabels(labels) {
    const msg = await onChangeTask(task, { labels });
    setErr(msg ?? "");
    return !msg;
  }

  async function addLabel(e) {
    e.preventDefault();
    const incoming = labelText.split(",").map((x) => x.trim()).filter(Boolean);
    if (incoming.length === 0) return;
    if (await saveLabels([...(task.labels ?? []), ...incoming])) setLabelText("");
  }

  async function addSub(e) {
    e.preventDefault();
    if (!subTitle.trim()) return;
    const msg = await onAddSub(task, subTitle);
    setErr(msg ?? "");
    if (!msg) setSubTitle("");
  }

  async function onPickFiles(e) {
    const picked = [...e.target.files];
    e.target.value = ""; // permet de rechoisir le même fichier
    if (picked.length === 0) return;
    setUploading(true);
    let next = files ?? [];
    let msg = "";
    for (const f of picked) {
      if (f.size === 0) { msg = `« ${f.name} » est vide.`; continue; }
      if (f.size > MAX_FILE_BYTES) { msg = `« ${f.name} » dépasse 10 Mo.`; continue; }
      try {
        next = [...next, await upload(filesBase, f)];
        setFiles(next);
        onFileCount(task.id, next.length);
      } catch (e2) {
        msg = e2.message;
        break;
      }
    }
    setErr(msg);
    setUploading(false);
  }

  async function openFile(f) {
    try {
      await download(`${filesBase}/${f.id}`, f.fileName);
      setErr("");
    } catch (e) {
      setErr(e.message);
    }
  }

  async function removeFile(f) {
    if (!window.confirm(`Supprimer le fichier « ${f.fileName} » ?`)) return;
    try {
      await api(`${filesBase}/${f.id}`, "DELETE");
      const next = files.filter((x) => x.id !== f.id);
      setFiles(next);
      onFileCount(task.id, next.length);
      setErr("");
    } catch (e) {
      setErr(e.message);
    }
  }

  async function send(e) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      const c = await api(base, "POST", { body: text });
      const next = [...(comments ?? []), c];
      setComments(next);
      onCount(task.id, next.length);
      setText("");
      setErr("");
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(c) {
    if (!window.confirm("Supprimer ce commentaire ?")) return;
    try {
      await api(`${base}/${c.id}`, "DELETE");
      const next = comments.filter((x) => x.id !== c.id);
      setComments(next);
      onCount(task.id, next.length);
      setErr("");
    } catch (e) {
      setErr(e.message);
    }
  }

  async function createActivity(e) {
    e.preventDefault();
    if (!activityForm.summary.trim()) return;
    try {
      const activity = await api(activitiesBase, "POST", {
        type: activityForm.type,
        summary: activityForm.summary,
        ...(activityForm.dueDate ? { dueDate: activityForm.dueDate } : {}),
        ...(activityForm.assigneeId ? { assigneeId: activityForm.assigneeId } : {}),
      });
      setActivities((a) => [activity, ...(a ?? [])]);
      setActivityForm({ type: "todo", summary: "", dueDate: "", assigneeId: "" });
      setScheduling(false);
      setErr("");
    } catch (e2) {
      setErr(e2.message);
    }
  }

  async function toggleActivityDone(activity) {
    try {
      const updated = await api(`${activitiesBase}/${activity.id}`, "PATCH", { done: !activity.done });
      setActivities((a) => a.map((x) => (x.id === activity.id ? updated : x)));
      setErr("");
    } catch (e) {
      setErr(e.message);
    }
  }

  async function removeActivity(activity) {
    if (!window.confirm("Supprimer cette activité ?")) return;
    try {
      await api(`${activitiesBase}/${activity.id}`, "DELETE");
      setActivities((a) => a.filter((x) => x.id !== activity.id));
      setErr("");
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <div className="tpage" aria-label={`Tâche ${task.title}`}>
      <div className="cp">
        <div className="cp-left">
          <div className="crumb2">
            <span className="up">
              <button type="button" className="link" onClick={onProjects}>Projets</button> /
              <button type="button" className="link" onClick={onClose}>{projectName}</button>
            </span>
            <span className="nm">{task.title}{task.isMilestone ? " · Jalon" : ""}</span>
          </div>
        </div>
        {pager && (
          <div className="cp-right pager">
            <span className="muted">{pager.index + 1} / {pager.total}</span>
            <button type="button" className="icon-btn" aria-label="Tâche précédente" disabled={pager.total < 2} onClick={pager.onPrev}><Icon name="back" size={17} /></button>
            <button type="button" className="icon-btn" aria-label="Tâche suivante" disabled={pager.total < 2} onClick={pager.onNext}><Icon name="chevronR" size={17} /></button>
          </div>
        )}
      </div>
      <div className="tp-body">
        <div className="stbar" role="group" aria-label="Statut">
          {Object.entries(TASK_STATUS).map(([v, l], i, all) => {
            const d = durations[v];
            const cur = task.status === v;
            const past = i < all.findIndex(([k]) => k === task.status);
            const tip = d ? `${cur ? "Dans cette étape depuis le" : "Dernière entrée le"} ${fmt(d.since)} · total ${fmtDuration(d.ms)}` : undefined;
            return (
              <button key={v} type="button" className={`${cur ? "on" : ""} ${past ? "past" : ""}`} aria-pressed={cur} aria-current={cur ? "step" : undefined} title={tip} onClick={async () => !cur && setErr((await onMoveTask(task, v)) ?? "")}>
                {past ? <Icon name="check" size={15} /> : <b>{i + 1}</b>}
                <span>{l}</span>
                {d && <small className="dur">{fmtDuration(d.ms)}</small>}
              </button>
            );
          })}
        </div>

        <div className="sheet">
          <div className="row" style={{ flexWrap: "nowrap", alignItems: "center" }}>
            <PriorityStar priority={task.priority} onChange={async (priority) => setErr((await onChangeTask(task, { priority })) ?? "")} />
            <h1 className={task.status === "done" ? "done" : ""}>
              <input aria-label="Titre de la tâche" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} onBlur={saveTitle} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
            </h1>
          </div>
          <div className="fgrid">
            <div className="fcol">
              <div className="frow">
                <label>Responsable</label>
                <span className="fv">
                  {canAssign ? (
                    <>
                      <Avatar member={members.find((m) => m.userId === task.assigneeId)} size={24} />
                      <select aria-label="Responsable" value={task.assigneeId ?? ""} onChange={async (e) => setErr((await onChangeTask(task, { assigneeId: e.target.value || null })) ?? "")}>
                        <option value="">Non assignée</option>
                        {members.map((m) => <option key={m.userId} value={m.userId}>{memberName(m)}</option>)}
                      </select>
                    </>
                  ) : task.assigneeId ? <><Avatar name="Assignée" size={24} />Assignée</> : <span className="muted">Non assignée</span>}
                </span>
              </div>
              <div className="frow">
                <label>Étiquettes</label>
                <div className="fv wrap">
                  <LabelChips labels={task.labels} onRemove={(l) => saveLabels((task.labels ?? []).filter((x) => x !== l))} />
                  <form onSubmit={addLabel} className="inline-add">
                    <input aria-label="Ajouter des étiquettes" placeholder="Ajouter…" value={labelText} onChange={(e) => setLabelText(e.target.value)} />
                  </form>
                </div>
              </div>
              {task.createdBy && (
                <div className="frow">
                  <label>Créée par</label>
                  <span className="fv"><Avatar name={nameOf(task.createdBy)} size={24} />{nameOf(task.createdBy)}{task.createdAt ? ` · ${new Date(task.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}` : ""}</span>
                </div>
              )}
            </div>
            <div className="fcol">
              <div className="frow">
                <label>Échéance</label>
                <span className="fv">
                  <DateField label="Échéance" value={task.dueDate} late={isLate(task)} placeholder="Définir" onChange={async (dueDate) => setErr((await onChangeTask(task, { dueDate })) ?? "")} />
                  {isLate(task) && <span className="late small">en retard</span>}
                </span>
              </div>
              <div className="frow">
                <label id="prio-l">Priorité</label>
                <div className="seg2" role="radiogroup" aria-labelledby="prio-l">
                  {Object.entries(PRIORITY).map(([v, l]) => (
                    <label key={v}>
                      <input type="radio" name="task-prio" value={v} checked={task.priority === v} onChange={async () => setErr((await onChangeTask(task, { priority: v })) ?? "")} />
                      <span>{l}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="frow">
                <label htmlFor="task-ms">Jalon</label>
                <span className="fv">
                  <span className="switch"><input id="task-ms" type="checkbox" checked={!!task.isMilestone} onChange={async () => setErr((await onChangeTask(task, { isMilestone: !task.isMilestone })) ?? "")} /><i /></span>
                  <span className="muted small">Marquer comme étape clé</span>
                </span>
              </div>
            </div>
          </div>

          <div className="tabs" role="tablist">
            <button className={tab === "description" ? "on" : ""} onClick={() => setTab("description")}>Description</button>
            <button className={tab === "subtasks" ? "on" : ""} onClick={() => setTab("subtasks")}>Sous-tâches{subtasks.length > 0 && <i>{subtasks.filter((x) => x.status === "done").length}/{subtasks.length}</i>}</button>
            <button className={tab === "dependencies" ? "on" : ""} onClick={() => setTab("dependencies")}>Dépendances</button>
            <button className={tab === "timesheets" ? "on" : ""} onClick={() => setTab("timesheets")}>Feuilles de temps</button>
            <button className={tab === "attachments" ? "on" : ""} onClick={() => setTab("attachments")}>Pièces jointes{files?.length > 0 && <i>{files.length}</i>}</button>
            <button className={tab === "activities" ? "on" : ""} onClick={() => setTab("activities")}>Activités{activities?.length > 0 && <i>{activities.length}</i>}</button>
          </div>

          <div className={`tab-content ${tab === "description" ? "on" : ""}`}>
            {task.description ? <p className="panel-desc">{task.description}</p> : <p className="muted">Aucune description pour cette tâche.</p>}
          </div>

          <div className={`tab-content ${tab === "subtasks" ? "on" : ""}`}>
            <ul className="list">
              {subtasks.map((s) => (
                <li key={s.id} className="row between">
                  <label className="row">
                    <input
                      type="checkbox"
                      checked={s.status === "done"}
                      onChange={async (e) => setErr((await onMoveTask(s, e.target.checked ? "done" : "todo")) ?? "")}
                    />
                    <span className={s.status === "done" ? "done" : ""}>{s.title}</span>
                  </label>
                  <button className="link small" onClick={() => onRemoveSub(s)}>Supprimer</button>
                </li>
              ))}
              {subtasks.length === 0 && <li className="muted small">Aucune sous-tâche.</li>}
            </ul>
            <form onSubmit={addSub} className="row">
              <input aria-label="Nouvelle sous-tâche" placeholder="Nouvelle sous-tâche" value={subTitle} onChange={(e) => setSubTitle(e.target.value)} />
              <button disabled={!subTitle.trim()}>Ajouter</button>
            </form>
          </div>

          <div className={`tab-content ${tab === "dependencies" ? "on" : ""}`}>
            <TaskDependencies orgId={orgId} projectId={projectId} taskId={task.id} />
          </div>

          <div className={`tab-content ${tab === "timesheets" ? "on" : ""}`}>
            <Timesheets orgId={orgId} projectId={projectId} taskId={task.id} members={members} />
          </div>

          <div className={`tab-content ${tab === "attachments" ? "on" : ""}`}>
            <ul className="list">
              {(files ?? []).map((f) => (
                <li key={f.id} className="row between">
                  <button className="link" onClick={() => openFile(f)}>📎 {f.fileName}</button>
                  <span className="muted small">
                    {fileSize(f.size)}{canAssign ? ` · ${nameOf(f.uploadedBy)}` : ""}{" "}
                    {f.canDelete && <button className="link small" onClick={() => removeFile(f)}>Supprimer</button>}
                  </span>
                </li>
              ))}
              {files && files.length === 0 && <li className="muted small">Aucune pièce jointe.</li>}
              {!files && !err && <li className="muted small">Chargement…</li>}
            </ul>
            <label className="row">
              <input type="file" multiple disabled={uploading || (files?.length ?? 0) >= 10} onChange={onPickFiles} aria-label="Ajouter des fichiers" />
              {uploading && <span className="muted small">Envoi…</span>}
            </label>
            <p className="muted small">10 fichiers par tâche, 10 Mo chacun.</p>
          </div>

          <div className={`tab-content ${tab === "activities" ? "on" : ""}`}>
            <div className="row between" style={{ marginBottom: "12px" }}>
              <h3>Activités planifiées</h3>
              <button onClick={() => setScheduling(true)}>Planifier une activité</button>
            </div>
            {scheduling && (
              <div className="card" style={{ marginBottom: "12px" }}>
                <form onSubmit={createActivity}>
                  <div className="fg">
                    <div><label>Type</label>
                      <select value={activityForm.type} onChange={(e) => setActivityForm({ ...activityForm, type: e.target.value })}>
                        {Object.entries(ACTIVITY_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </div>
                    <div><label>Échéance</label><input type="date" value={activityForm.dueDate} onChange={(e) => setActivityForm({ ...activityForm, dueDate: e.target.value })} /></div>
                    <div><label>Résumé</label><input value={activityForm.summary} onChange={(e) => setActivityForm({ ...activityForm, summary: e.target.value })} /></div>
                    {canAssign && <div><label>Assigné à</label>
                      <select value={activityForm.assigneeId} onChange={(e) => setActivityForm({ ...activityForm, assigneeId: e.target.value })}>
                        <option value="">Non assignée</option>
                        {members.map((m) => <option key={m.userId} value={m.userId}>{memberName(m)}</option>)}
                      </select>
                    </div>}
                  </div>
                  <div className="row" style={{ marginTop: "8px" }}>
                    <button disabled={!activityForm.summary.trim()}>Planifier</button>
                    <button type="button" className="ghost" onClick={() => setScheduling(false)}>Annuler</button>
                  </div>
                </form>
              </div>
            )}
            <ul className="activity-list">
              {(activities ?? []).map((a) => (
                <li key={a.id} className="activity-item">
                  <input
                    type="checkbox"
                    checked={a.done}
                    onChange={() => toggleActivityDone(a)}
                  />
                  <span className={`activity-type ${a.type}`}>{ACTIVITY_TYPES[a.type]}</span>
                  <span className={a.done ? "activity-done" : ""}>{a.summary}</span>
                  {a.dueDate && <span className="muted small">{a.dueDate}</span>}
                  <span className="muted small" style={{ marginLeft: "auto" }}>{a.assigneeId ? nameOf(a.assigneeId) : "—"}</span>
                  <button className="link small" onClick={() => removeActivity(a)}>Supprimer</button>
                </li>
              ))}
              {activities && activities.length === 0 && <li className="muted small">Aucune activité planifiée.</li>}
              {!activities && !err && <li className="muted small">Chargement…</li>}
            </ul>
          </div>
        </div>


        <aside className="tp-chat" aria-label="Discussion">
        <h3 style={{ margin: "4px 0 0" }}>Discussion {comments && <span className="muted small">({comments.length})</span>}</h3>
        {err && <p className="error" style={{ padding: 0 }}>{err}</p>}
        <form onSubmit={send} className="composer">
          <textarea rows={2} placeholder="Écrire un commentaire…" aria-label="Écrire un commentaire" value={text} maxLength={4000} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && send(e)} />
          <div className="row">
            <span className="muted small" style={{ marginRight: "auto" }}>Ctrl + Entrée pour envoyer</span>
            <button className="pj-ok" disabled={busy || !text.trim()}>Commenter</button>
          </div>
        </form>
        <div className="day"><span>Aujourd'hui</span></div>
        <div style={{ display: "grid", gap: 12 }}>
          {(comments ?? []).slice().reverse().map((c) => (
            <div key={c.id} className="msg">
              <Avatar name={nameOf(c.authorId)} size={32} />
              <div className="bubble">
                <header><strong>{nameOf(c.authorId)}</strong><span className="muted small">{fmt(c.createdAt)}</span></header>
                <p className="comment-body">{c.body}</p>
                {c.canDelete && <button className="link small" onClick={() => remove(c)}>Supprimer</button>}
              </div>
            </div>
          ))}
          {comments && comments.length === 0 && <p className="muted">Aucun commentaire pour l'instant.</p>}
          {!comments && !err && <p className="muted">Chargement…</p>}
        </div>
        </aside>
      </div>
    </div>
  );
}
