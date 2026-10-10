import { useEffect, useState } from "react";
import { api, download, upload } from "./api.js";
import { CommentsSkeleton, RowsSkeleton } from "./Skeleton.jsx";
import LabelChips from "./LabelChips.jsx";
import TaskDependencies from "./TaskDependencies.jsx";
import Timesheets from "./Timesheets.jsx";
import { Avatar, DateField, Icon, PriorityStar } from "./ui.jsx";
import { MAX_FILE_BYTES, PRIORITY, TASK_STATUS, fileSize, fmtDuration, isLate, memberName, stageDurations } from "./labels.js";

const fmt = (iso) =>
  new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

const dayKey = (iso) => new Date(iso).toLocaleDateString("fr-CA");
const dayLabel = (iso) => {
  const d = new Date(iso);
  const t = new Date();
  const y = new Date();
  y.setDate(t.getDate() - 1);
  if (d.toDateString() === t.toDateString()) return "Aujourd'hui";
  if (d.toDateString() === y.toDateString()) return "Hier";
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
};
const hour = (iso) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
const groupByDay = (list) => {
  const out = [];
  for (const c of list) {
    const k = dayKey(c.createdAt);
    const last = out[out.length - 1];
    if (last && last.k === k) last.items.push(c);
    else out.push({ k, label: dayLabel(c.createdAt), items: [c] });
  }
  return out;
};

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
  const [addingLabel, setAddingLabel] = useState(false);
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
    const fresh = incoming.filter((x) => !(task.labels ?? []).some((l) => l.toLowerCase() === x.toLowerCase()));
    if (fresh.length === 0 || (await saveLabels([...(task.labels ?? []), ...fresh]))) { setLabelText(""); setAddingLabel(false); }
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
                  {addingLabel ? (
                    <form onSubmit={addLabel} className="lb-form">
                      <input
                        autoFocus
                        aria-label="Ajouter des étiquettes"
                        placeholder="Nom, puis Entrée"
                        value={labelText}
                        onChange={(e) => setLabelText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setLabelText(""); setAddingLabel(false); } }}
                        onBlur={() => { if (!labelText.trim()) setAddingLabel(false); }}
                      />
                    </form>
                  ) : (
                    <button type="button" className="lb-add" onClick={() => setAddingLabel(true)}><Icon name="plus" size={13} />Ajouter</button>
                  )}
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
            {subtasks.length > 0 && (
              <div className="sbp">
                <span>{subtasks.filter((x) => x.status === "done").length} sur {subtasks.length} terminée{subtasks.length > 1 ? "s" : ""}</span>
                <div className="pbar" role="progressbar" aria-valuemin={0} aria-valuemax={subtasks.length} aria-valuenow={subtasks.filter((x) => x.status === "done").length}><i style={{ width: `${Math.round((subtasks.filter((x) => x.status === "done").length / subtasks.length) * 100)}%` }} /></div>
              </div>
            )}
            {subtasks.length > 0 ? (
              <ul className="ck">
                {subtasks.map((s) => (
                  <li key={s.id}>
                    <label>
                      <input type="checkbox" checked={s.status === "done"} onChange={async (e) => setErr((await onMoveTask(s, e.target.checked ? "done" : "todo")) ?? "")} />
                      <span className="bx"><Icon name="check" size={14} /></span>
                      <span className={s.status === "done" ? "done" : ""}>{s.title}</span>
                    </label>
                    <button type="button" className="ib2" aria-label={`Supprimer ${s.title}`} onClick={() => onRemoveSub(s)}><Icon name="trash" size={16} /></button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="empty-tab"><Icon name="subtask" size={22} /><b>Aucune sous-tâche</b><span>Découpez cette tâche en petites étapes à cocher.</span></div>
            )}
            <form onSubmit={addSub} className="addrow">
              <input aria-label="Nouvelle sous-tâche" placeholder="Ajouter une sous-tâche…" value={subTitle} onChange={(e) => setSubTitle(e.target.value)} />
              <button className="go" disabled={!subTitle.trim()}>Ajouter</button>
            </form>
          </div>

          <div className={`tab-content ${tab === "dependencies" ? "on" : ""}`}>
            <TaskDependencies orgId={orgId} projectId={projectId} taskId={task.id} />
          </div>

          <div className={`tab-content ${tab === "timesheets" ? "on" : ""}`}>
            <Timesheets orgId={orgId} projectId={projectId} taskId={task.id} members={members} />
          </div>

          <div className={`tab-content ${tab === "attachments" ? "on" : ""}`}>
            {files && files.length > 0 && (
              <ul className="fl">
                {files.map((f) => {
                  const ext = (f.fileName.split(".").pop() || "").toLowerCase();
                  const kind = ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext) ? "img" : ext === "pdf" ? "pdf" : ["doc", "docx", "odt", "txt", "md"].includes(ext) ? "doc" : ["xls", "xlsx", "csv", "ods"].includes(ext) ? "xls" : ["zip", "rar", "7z"].includes(ext) ? "zip" : "oth";
                  return (
                    <li key={f.id} className="fi">
                      <span className={`fx k-${kind}`} aria-hidden="true">{ext.slice(0, 4) || "fichier"}</span>
                      <div className="fm">
                        <button type="button" className="fn" onClick={() => openFile(f)} title="Télécharger">{f.fileName}</button>
                        <span className="fs">{fileSize(f.size)}{canAssign && f.uploadedBy ? ` · ${nameOf(f.uploadedBy)}` : ""}</span>
                      </div>
                      <button type="button" className="ib2" aria-label={`Télécharger ${f.fileName}`} onClick={() => openFile(f)}><Icon name="download" size={16} /></button>
                      {f.canDelete && <button type="button" className="ib2" aria-label={`Supprimer ${f.fileName}`} onClick={() => removeFile(f)}><Icon name="trash" size={16} /></button>}
                    </li>
                  );
                })}
              </ul>
            )}
            {files && files.length === 0 && <div className="empty-tab"><Icon name="clip" size={22} /><b>Aucune pièce jointe</b><span>Ajoutez des documents, images ou maquettes.</span></div>}
            {!files && !err && <RowsSkeleton rows={2} h={64} label="Chargement des pièces jointes" />}
            {(files?.length ?? 0) < 10 ? (
              <label className={`drop ${uploading ? "busy" : ""}`}>
                <input type="file" multiple disabled={uploading} onChange={onPickFiles} aria-label="Ajouter des fichiers" />
                <Icon name="clip" size={18} />
                <span><b>{uploading ? "Envoi en cours…" : "Ajouter des fichiers"}</b><small>Cliquez pour choisir · 10 Mo maximum par fichier</small></span>
              </label>
            ) : (
              <p className="muted small">Limite atteinte : 10 fichiers par tâche.</p>
            )}
            {files && files.length > 0 && <p className="fcount">{files.length} / 10 fichiers</p>}
          </div>

          <div className={`tab-content ${tab === "activities" ? "on" : ""}`}>
            <div className="ta-head">
              <div>
                <h3>Activités planifiées</h3>
                <p className="muted small">{activities ? (activities.length === 0 ? "Aucune activité" : `${activities.filter((x) => !x.done).length} à faire · ${activities.filter((x) => x.done).length} terminée(s)`) : "Chargement…"}</p>
              </div>
              <button className="pj-ok ta-add" onClick={() => setScheduling(true)}><Icon name="plus" size={16} /> Planifier une activité</button>
            </div>
            {scheduling && (
              <div className="ta-form">
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
            <ul className="ta-list">
              {(activities ?? []).map((a) => {
                const late = !a.done && isLate({ dueDate: a.dueDate, status: "todo" });
                return (
                  <li key={a.id} className={`ta-item ${a.done ? "is-done" : ""}`}>
                    <button
                      type="button"
                      className={`ta-check ${a.done ? "on" : ""}`}
                      role="checkbox"
                      aria-checked={a.done}
                      aria-label={a.done ? "Marquer comme à faire" : "Marquer comme terminée"}
                      onClick={() => toggleActivityDone(a)}
                    >
                      {a.done && <Icon name="check" size={14} />}
                    </button>
                    <div className="ta-main">
                      <p className="ta-sum">{a.summary}</p>
                      <div className="ta-meta">
                        <span className={`activity-type ${a.type}`}>{ACTIVITY_TYPES[a.type]}</span>
                        {a.dueDate && <span className={`ta-due ${late ? "late" : ""}`}><Icon name="calendar" size={13} /> {a.dueDate}{late ? " · en retard" : ""}</span>}
                      </div>
                    </div>
                    {a.assigneeId ? <Avatar name={nameOf(a.assigneeId)} size={28} /> : <Avatar name="" size={28} />}
                    <button type="button" className="icon-btn ta-del" aria-label="Supprimer l'activité" onClick={() => removeActivity(a)}><Icon name="trash" size={16} /></button>
                  </li>
                );
              })}
              {activities && activities.length === 0 && (
                <li className="ta-empty">
                  <Icon name="clock" size={22} />
                  <strong>Rien de prévu</strong>
                  <span>Planifiez un appel, un e-mail ou une réunion liés à cette tâche.</span>
                </li>
              )}
              {!activities && !err && <li className="sk-li"><RowsSkeleton rows={2} h={40} label="Chargement des activités" /></li>}
            </ul>
          </div>
        </div>


        <aside className="tp-chat" aria-label="Discussion">
        <h3>Discussion {comments && <span className="tc-count">{comments.length}</span>}</h3>
        {err && <p className="error" style={{ padding: 0 }}>{err}</p>}
        <form onSubmit={send} className="composer">
          <textarea rows={2} placeholder="Écrire un commentaire…" aria-label="Écrire un commentaire" value={text} maxLength={4000} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && send(e)} />
          <div className="row">
            <span className="muted small" style={{ marginRight: "auto" }}>{text.length > 3500 ? `${text.length} / 4000` : "Ctrl + Entrée pour envoyer"}</span>
            <button className="pj-ok" disabled={busy || !text.trim()}>Commenter</button>
          </div>
        </form>
        <div className="tc-feed">
          {groupByDay((comments ?? []).slice().reverse()).map((g) => (
            <section key={g.k} className="tc-day">
              <div className="day"><span>{g.label}</span></div>
              {g.items.map((c) => (
                <div key={c.id} className="msg">
                  <Avatar name={nameOf(c.authorId)} size={32} />
                  <div className="bubble">
                    <header>
                      <strong>{nameOf(c.authorId)}</strong>
                      <span className="muted small">{hour(c.createdAt)}</span>
                      {c.canDelete && <button type="button" className="icon-btn tc-del" aria-label="Supprimer le commentaire" onClick={() => remove(c)}><Icon name="trash" size={14} /></button>}
                    </header>
                    <p className="comment-body">{c.body}</p>
                  </div>
                </div>
              ))}
            </section>
          ))}
          {comments && comments.length === 0 && (
            <div className="tc-empty">
              <Icon name="comment" size={22} />
              <strong>Aucun commentaire</strong>
              <span>Lancez la discussion : posez une question ou donnez une mise à jour.</span>
            </div>
          )}
          {!comments && !err && <CommentsSkeleton />}
        </div>
        </aside>
      </div>
    </div>
  );
}
