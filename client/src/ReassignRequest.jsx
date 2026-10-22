import { useEffect, useState } from "react";
import { api } from "./api.js";
import { usePerms } from "./perms.js";
import { memberName } from "./labels.js";
import { Icon, Spin } from "./ui.jsx";
import "./reassign.css";

/**
 * Demande de réassignation, dans la fiche tâche (mêmes règles que server/src/routes/reassign.js) :
 *   - l'assigné (non responsable) peut demander qu'on confie la tâche à quelqu'un d'autre, avec une raison et
 *     une personne suggérée ; il peut annuler sa demande tant qu'elle attend ;
 *   - un responsable du projet accepte (nouvel assigné : la suggestion par défaut) ou refuse avec un message ;
 *   - les autres voient seulement qu'une demande est en attente.
 * `onResolved(patch)` : met à jour la tâche dans la liste (assigné, demande en attente) sans la recharger.
 */
// `assignable(id)` : à qui un responsable peut confier la tâche ; `reachable()` : qui peut la recevoir (suggestion).
export default function ReassignRequest({ orgId, projectId, task, members, assignable = () => members, reachable = () => members, onResolved }) {
  const { canManage, userId } = usePerms();
  const url = `/api/organizations/${orgId}/projects/${projectId}/tasks/${task.id}/reassign-requests`;
  const [state, setState] = useState(null); // { pending, history } ; null = chargement
  const [form, setForm] = useState(null); // demande en cours de rédaction : { reason, suggestedUserId }
  const [answer, setAnswer] = useState({ assigneeId: "", note: "" });
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    api(url)
      .then((s) => {
        if (!alive) return;
        setState(s);
        setAnswer({ assigneeId: s.pending?.suggestedUserId ?? "", note: "" });
      })
      .catch(() => alive && setState({ pending: null, history: [] })); // migration absente : rien à afficher
    return () => { alive = false; };
  }, [url, task.assigneeId]);

  const nameOf = (id) => (id === userId ? "Vous" : memberName(members.find((m) => m.userId === id)) || "Membre");
  const run = async (what, fn) => {
    setBusy(what);
    try {
      await fn();
      setErr("");
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy("");
    }
  };

  if (!state) return null;
  const { pending } = state;
  const mine = task.assigneeId && task.assigneeId === userId;
  const lastAnswer = state.history[0];
  const declinedForMe = !pending && mine && lastAnswer?.status === "declined" && lastAnswer.requestedBy === userId;

  // Rien en attente : l'assigné non responsable peut demander (un responsable réassigne directement).
  if (!pending) {
    if (!mine || canManage) return null;
    if (!form) {
      return (
        <div className="ra">
          {declinedForMe && (
            <p className="ra-note">
              <Icon name="alert" size={14} /> Votre dernière demande a été refusée{lastAnswer.decisionNote ? ` : « ${lastAnswer.decisionNote} »` : "."}
            </p>
          )}
          <button type="button" className="ghost ra-ask" onClick={() => setForm({ reason: "", suggestedUserId: "" })}>
            <Icon name="users" size={14} />Demander une réassignation
          </button>
        </div>
      );
    }
    const candidates = reachable().filter((m) => m.userId !== userId);
    return (
      <form
        className="ra ra-box"
        onSubmit={(e) => {
          e.preventDefault();
          run("ask", async () => {
            const created = await api(url, "POST", { reason: form.reason, suggestedUserId: form.suggestedUserId || null });
            setState({ ...state, pending: created });
            setForm(null);
            onResolved?.({ reassignRequestedBy: userId });
          });
        }}
      >
        <b>Demander à un responsable de confier cette tâche à quelqu’un d’autre</b>
        <label className="ra-f">
          <span>Pourquoi ?</span>
          <textarea autoFocus rows={2} maxLength={500} required minLength={3} placeholder="Ex. : en congé la semaine prochaine, compétence manquante…" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
        </label>
        {candidates.length > 0 && (
          <label className="ra-f">
            <span>Personne suggérée <small className="muted">(facultatif)</small></span>
            <select value={form.suggestedUserId} onChange={(e) => setForm({ ...form, suggestedUserId: e.target.value })}>
              <option value="">Aucune préférence</option>
              {candidates.map((m) => <option key={m.userId} value={m.userId}>{memberName(m)}</option>)}
            </select>
          </label>
        )}
        {err && <p className="error" style={{ padding: 0 }}>{err}</p>}
        <div className="ra-actions">
          <button type="button" className="ghost" disabled={!!busy} onClick={() => { setForm(null); setErr(""); }}>Annuler</button>
          <button type="submit" className="btn p" disabled={!!busy || form.reason.trim().length < 3}>{busy === "ask" ? <><Spin size={14} className="ib" />Envoi…</> : "Envoyer la demande"}</button>
        </div>
      </form>
    );
  }

  const header = (
    <p className="ra-head">
      <Icon name="users" size={15} />
      <span>
        <b>{pending.requestedBy === userId ? "Vous demandez" : `${nameOf(pending.requestedBy)} demande`}</b> que cette tâche soit confiée à quelqu’un d’autre
        {pending.suggestedUserId ? <> (suggestion : <b>{nameOf(pending.suggestedUserId)}</b>)</> : null}.
      </span>
    </p>
  );

  // Responsable : accepter (choisir la personne) ou refuser.
  if (canManage) {
    const candidates = assignable(answer.assigneeId || null).filter((m) => m.userId !== pending.requestedBy);
    return (
      <div className="ra ra-box warn">
        {header}
        <blockquote className="ra-reason">{pending.reason}</blockquote>
        <div className="ra-answer">
          <label className="ra-f">
            <span>Confier à</span>
            <select value={answer.assigneeId} onChange={(e) => setAnswer({ ...answer, assigneeId: e.target.value })}>
              <option value="">Personne (à réattribuer)</option>
              {candidates.map((m) => <option key={m.userId} value={m.userId}>{memberName(m)}</option>)}
            </select>
          </label>
          <label className="ra-f">
            <span>Message <small className="muted">(facultatif)</small></span>
            <input maxLength={500} value={answer.note} placeholder="Visible par la personne qui demande" onChange={(e) => setAnswer({ ...answer, note: e.target.value })} />
          </label>
        </div>
        {err && <p className="error" style={{ padding: 0 }}>{err}</p>}
        <div className="ra-actions">
          <button type="button" className="ghost" disabled={!!busy} onClick={() => run("decline", async () => {
            const r = await api(`${url}/${pending.id}/decline`, "POST", { note: answer.note || null });
            setState({ pending: null, history: [r.request, ...state.history] });
            onResolved?.({ reassignRequestedBy: null });
          })}>{busy === "decline" ? <><Spin size={14} className="ib" />Refus…</> : "Refuser"}</button>
          <button type="button" className="btn p" disabled={!!busy} onClick={() => run("accept", async () => {
            const r = await api(`${url}/${pending.id}/accept`, "POST", { assigneeId: answer.assigneeId || null, note: answer.note || null });
            setState({ pending: null, history: [r.request, ...state.history] });
            onResolved?.({ assigneeId: r.assigneeId, reassignRequestedBy: null });
          })}>{busy === "accept" ? <><Spin size={14} className="ib" />Réassignation…</> : "Réassigner"}</button>
        </div>
      </div>
    );
  }

  // Le demandeur : sa demande attend, il peut l'annuler. Les autres : simple mention.
  return (
    <div className="ra ra-box">
      {header}
      {pending.requestedBy === userId && (
        <>
          <blockquote className="ra-reason">{pending.reason}</blockquote>
          <p className="ra-note">En attente de la réponse d’un responsable du projet. La tâche vous reste assignée d’ici là.</p>
          {err && <p className="error" style={{ padding: 0 }}>{err}</p>}
          <div className="ra-actions">
            <button type="button" className="ghost" disabled={!!busy} onClick={() => run("cancel", async () => {
              await api(`${url}/${pending.id}`, "DELETE");
              setState({ ...state, pending: null });
              onResolved?.({ reassignRequestedBy: null });
            })}>{busy === "cancel" ? <><Spin size={14} className="ib" />Annulation…</> : "Annuler ma demande"}</button>
          </div>
        </>
      )}
    </div>
  );
}
