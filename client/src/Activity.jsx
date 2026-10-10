import { useCallback, useEffect, useState } from "react";
import { api } from "./api.js";
import { Avatar, Icon } from "./ui.jsx";
import { ActivitySkeleton, Skel } from "./Skeleton.jsx";
import { PRIORITY, PROJECT_STATUS, TASK_STATUS, memberName } from "./labels.js";

const PAGE = 50;
const VERB = { create: "a créé", update: "a modifié", delete: "a supprimé" };
const KIND = { project: "le projet", task: "la tâche" };

/** Résumé des champs modifiés, lisible (le texte des descriptions n'est pas journalisé). */
function summary(e, nameOf) {
  const d = e.details ?? {};
  const parts = [];
  if (d.comment) parts.push("commentaire ajouté");
  if (d.attachment === "added") parts.push("pièce jointe ajoutée");
  if (d.attachment === "removed") parts.push("pièce jointe supprimée");
  if (d.subtask) parts.push("sous-tâche");
  if (d.labels) parts.push("étiquettes modifiées");
  if (d.name) parts.push(`nom → « ${d.name} »`);
  if (d.title) parts.push(`titre → « ${d.title} »`);
  if (d.description) parts.push("description");
  if (d.status) parts.push(`statut → ${(e.entityType === "task" ? TASK_STATUS : PROJECT_STATUS)[d.status] ?? d.status}`);
  if (d.priority) parts.push(`priorité → ${PRIORITY[d.priority] ?? d.priority}`);
  if ("due_date" in d) parts.push(d.due_date ? `échéance → ${d.due_date}` : "échéance retirée");
  if ("assignee_id" in d) parts.push(d.assignee_id ? `assignée à ${nameOf(d.assignee_id)}` : "désassignée");
  if (e.action === "create") {
    if (d.subtask) parts.push("sous-tâche");
    if (d.assignee_id) parts.push(`assignée à ${nameOf(d.assignee_id)}`);
  }
  return [...new Set(parts)];
}

const hour = (iso) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
const dayKey = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
const dayLabel = (iso) => {
  const d = new Date(iso);
  const diff = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 864e5);
  if (diff === 0) return "Aujourd’hui";
  if (diff === 1) return "Hier";
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
};
const ICON = { create: "plus", update: "pulse", delete: "trash" };
const FILTERS = [["", "Tout"], ["create", "Créations"], ["update", "Modifications"], ["delete", "Suppressions"]];

/** Journal d'activité de l'organisation (plus récent d'abord). */
export default function Activity({ orgId, members, ready = true, onOpenProject }) {
  const [list, setList] = useState(null);
  const [more, setMore] = useState(false);
  const [err, setErr] = useState("");
  const [kind, setKind] = useState("");
  const [busy, setBusy] = useState(false);
  const base = `/api/organizations/${orgId}/activity`;
  const nameOf = (id) => {
    const m = members.find((x) => x.userId === id);
    return m ? memberName(m) : "un membre";
  };

  const load = useCallback(
    (before) =>
      api(`${base}?limit=${PAGE}${kind ? `&action=${kind}` : ""}${before ? `&before=${encodeURIComponent(before)}` : ""}`)
        .then((rows) => {
          setList((l) => (before ? [...(l ?? []), ...rows] : rows));
          setMore(rows.length === PAGE);
          setErr("");
        })
        .catch((e) => setErr(e.message)),
    [base, kind],
  );
  useEffect(() => { load(); }, [load]);

  // Regroupe par jour (le journal arrive déjà du plus récent au plus ancien).
  const shown = list ?? [];
  const days = [];
  for (const e of shown) {
    const k = dayKey(e.createdAt);
    if (days.at(-1)?.k !== k) days.push({ k, label: dayLabel(e.createdAt), items: [] });
    days.at(-1).items.push(e);
  }

  return (
    <>
      <div className="mt-head">
        <div>
          <h2>Journal d’activité</h2>
          {list && ready ? <p>{shown.length} évènement{shown.length > 1 ? "s" : ""} affiché{shown.length > 1 ? "s" : ""}</p> : <p><Skel w={180} h={14} className="sk-inline" /></p>}
        </div>
      </div>
      <div className="mt-filters ac-filters">
        <div className="seg ac-seg" role="group" aria-label="Type d’évènement">
          {FILTERS.map(([v, l]) => <button key={v} type="button" className={kind === v ? "on" : ""} onClick={() => { setList(null); setKind(v); }}>{l}</button>)}
        </div>
      </div>
      {err && <p className="error mt-err">{err}</p>}
      {(!list || !ready) && !err ? <ActivitySkeleton /> : (
      <div className="ac-feed fade-in">
        {days.map((day) => (
          <section key={day.k} className="act-day">
            <h4>{day.label}</h4>
            <ul className="act-list">
              {day.items.map((e) => {
                const extra = summary(e, nameOf);
                const who = e.actorId ? nameOf(e.actorId) : "—";
                return (
                  <li key={e.id} className="act-row">
                    <span className={`act-ico ${e.action}`}><Icon name={ICON[e.action] ?? "pulse"} size={15} /></span>
                    <div className="act-text">
                      <div>
                        <Avatar name={who} size={20} /> <strong>{who}</strong> {VERB[e.action]} {KIND[e.entityType]}{" "}
                        {e.action !== "delete" && e.projectId && e.entityType === "project" ? (
                          <button className="link" onClick={() => onOpenProject(e.projectId)}>« {e.label} »</button>
                        ) : (
                          <b>« {e.label} »</b>
                        )}
                        {e.entityType === "task" && e.details?.project && <span className="muted"> · {e.details.project}</span>}
                      </div>
                      {extra.length > 0 && <div className="act-tags">{extra.map((t) => <span key={t}>{t}</span>)}</div>}
                    </div>
                    <time className="muted small">{hour(e.createdAt)}</time>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        {list && shown.length === 0 && !err && (
          <div className="empty-tab"><Icon name="pulse" size={22} /><b>Aucune activité</b><span>{kind ? "Aucun évènement de ce type." : "Rien n’a encore été enregistré."}</span></div>
        )}
      </div>
      )}
      {more && shown.length > 0 && <div className="ac-more"><button className="ghost" disabled={busy} onClick={async () => { setBusy(true); await load(list[list.length - 1].createdAt); setBusy(false); }}>{busy ? "Chargement…" : "Charger plus"}</button></div>}
    </>
  );
}
