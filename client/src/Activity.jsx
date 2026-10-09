import { useCallback, useEffect, useState } from "react";
import { api } from "./api.js";
import { Avatar } from "./ui.jsx";
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
  return [...new Set(parts)].join(", ");
}

const hour = (iso) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
const dayLabel = (iso) => new Date(iso).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

/** Journal d'activité de l'organisation (plus récent d'abord). */
export default function Activity({ orgId, members, onOpenProject }) {
  const [list, setList] = useState(null);
  const [more, setMore] = useState(false);
  const [err, setErr] = useState("");
  const base = `/api/organizations/${orgId}/activity`;
  const nameOf = (id) => {
    const m = members.find((x) => x.userId === id);
    return m ? memberName(m) : "un membre";
  };

  const load = useCallback(
    (before) =>
      api(`${base}?limit=${PAGE}${before ? `&before=${encodeURIComponent(before)}` : ""}`)
        .then((rows) => {
          setList((l) => (before ? [...(l ?? []), ...rows] : rows));
          setMore(rows.length === PAGE);
          setErr("");
        })
        .catch((e) => setErr(e.message)),
    [base],
  );
  useEffect(() => { load(); }, [load]);

  // Regroupe par jour (le journal arrive déjà du plus récent au plus ancien).
  const days = [];
  for (const e of list ?? []) {
    const k = dayLabel(e.createdAt);
    if (days.at(-1)?.k !== k) days.push({ k, items: [] });
    days.at(-1).items.push(e);
  }

  return (
    <>
      <div className="crumb2" style={{ margin: "14px 0 10px" }}>
        <span className="up">Reporting</span>
        <span className="nm">Journal d’activité</span>
      </div>
      {err && <p className="error" style={{ padding: 0 }}>{err}</p>}
      {days.map((day) => (
        <section key={day.k} className="act-day">
          <h4>{day.k}</h4>
          <ul className="act-list">
            {day.items.map((e) => {
              const extra = summary(e, nameOf);
              const who = e.actorId ? nameOf(e.actorId) : "—";
              return (
                <li key={e.id} className="act-row">
                  <Avatar name={who} size={30} />
                  <div className="act-text">
                    <div>
                      <strong>{who}</strong> {VERB[e.action]} {KIND[e.entityType]}{" "}
                      {e.action !== "delete" && e.projectId && e.entityType === "project" ? (
                        <button className="link" onClick={() => onOpenProject(e.projectId)}>« {e.label} »</button>
                      ) : (
                        <>« {e.label} »</>
                      )}
                      {e.entityType === "task" && e.details?.project && <span className="muted"> (projet {e.details.project})</span>}
                    </div>
                    {extra && <p className="muted small">{extra}</p>}
                  </div>
                  <span className="muted small">{hour(e.createdAt)}</span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {list && list.length === 0 && !err && <p className="muted">Aucune activité pour le moment.</p>}
      {more && <button className="ghost" onClick={() => load(list[list.length - 1].createdAt)}>Charger plus</button>}
    </>
  );
}
