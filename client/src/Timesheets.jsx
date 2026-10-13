import { useEffect, useState } from "react";
import { usePerms } from "./perms.js";
import { api } from "./api.js";
import { RowsSkeleton, Skel } from "./Skeleton.jsx";
import { Avatar, BusyLabel, Icon } from "./ui.jsx";
import { memberName, todayISO } from "./labels.js";
import { confirmDialog } from "./confirm.jsx";

function minutesToHours(m) {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function hoursToMinutes(h) {
  const match = /^(\d{1,3}):?(\d{2})?$/.exec(h.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + (Number(match[2]) || 0);
}

/** Une ligne modifiable : les champs ne sont enregistrés qu'à la sortie du champ (pas à chaque frappe). */
function Entry({ entry, who, member, onSave, onRemove }) {
  const [date, setDate] = useState(entry.date);
  const [description, setDescription] = useState(entry.description ?? "");
  const [duration, setDuration] = useState(minutesToHours(entry.duration));
  const { canEdit } = usePerms();
  useEffect(() => {
    setDate(entry.date);
    setDescription(entry.description ?? "");
    setDuration(minutesToHours(entry.duration));
  }, [entry]);

  return (
    <li className="tsx-row">
      <input type="date" aria-label="Date" disabled={!canEdit} className="ti tsx-date" value={date} onChange={(e) => setDate(e.target.value)} onBlur={() => date && date !== entry.date && onSave(entry, { date })} />
      <span className="ass tsx-who"><Avatar member={member} name={member ? undefined : who} size={24} /><span>{who}</span></span>
      <input className="ti tsx-desc" readOnly={!canEdit} aria-label="Description" value={description} placeholder="Que avez-vous fait ?" onChange={(e) => setDescription(e.target.value)} onBlur={() => description !== (entry.description ?? "") && onSave(entry, { description })} />
      <input
        className="ti dur tsx-dur"
        readOnly={!canEdit}
        aria-label="Durée (HH:MM)"
        value={duration}
        onChange={(e) => setDuration(e.target.value)}
        onBlur={() => {
          const m = hoursToMinutes(duration);
          if (!m || m <= 0) return setDuration(minutesToHours(entry.duration)); // saisie invalide : on rétablit
          if (m !== entry.duration) onSave(entry, { duration: m });
        }}
      />
      {canEdit && <button type="button" className="ib2" onClick={() => onRemove(entry)} aria-label="Supprimer la ligne"><Icon name="trash" size={16} /></button>}
    </li>
  );
}

/** Feuilles de temps d'une tâche : lignes modifiables et total des heures passées. */
export default function Timesheets({ orgId, projectId, taskId, members, onBusy }) {
  const [timesheets, setTimesheets] = useState(null);
  const [err, setErr] = useState("");
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => { onBusy?.(saving); return () => onBusy?.(false); }, [saving, onBusy]); // verrouille la fiche tâche pendant l'envoi
  const blank = () => ({ date: todayISO(), description: "", duration: "01:00" });
  const [newEntry, setNewEntry] = useState(blank);
  const base = `/api/organizations/${orgId}/projects/${projectId}/tasks/${taskId}/timesheets`;
  const { canEdit } = usePerms();

  useEffect(() => {
    api(base).then(setTimesheets).catch((e) => setErr(e.message));
  }, [base]);

  const totalMinutes = (timesheets ?? []).reduce((acc, t) => acc + t.duration, 0);

  async function addEntry(e) {
    e.preventDefault();
    const duration = hoursToMinutes(newEntry.duration);
    if (!duration || duration <= 0) return setErr("Durée invalide (format HH:MM).");
    if (saving) return;
    setSaving(true);
    try {
      const created = await api(base, "POST", { date: newEntry.date, description: newEntry.description, duration });
      setTimesheets((t) => [created, ...(t ?? [])]);
      setNewEntry(blank());
      setAdding(false);
      setErr("");
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveEntry(entry, changes) {
    try {
      const updated = await api(`${base}/${entry.id}`, "PATCH", changes);
      setTimesheets((t) => t.map((x) => (x.id === entry.id ? updated : x)));
      setErr("");
    } catch (e) {
      setErr(e.message);
    }
  }

  async function removeEntry(entry) {
    await confirmDialog({ tone: "danger", icon: "trash", title: "Supprimer cette feuille de temps ?", text: "Le temps saisi sera supprimé. Cette action est définitive.", ok: "Supprimer",
      run: async () => {
      await api(`${base}/${entry.id}`, "DELETE");
      setTimesheets((t) => t.filter((x) => x.id !== entry.id));
      setErr("");
      },
    });
  }

  const memberOf = (id) => members.find((x) => x.userId === id);
  const nameOf = (id) => (memberOf(id) ? memberName(memberOf(id)) : "Inconnu");

  const count = timesheets?.length ?? 0;
  return (
    <div className="tsx">
      {!timesheets && !err ? (
        <div role="status" aria-busy="true" aria-label="Chargement des feuilles de temps">
          <div className="tsx-sum" aria-hidden="true"><Skel w={44} h={44} r={14} className="flex-none" /><div className="sk-col"><div className="sk-ln" style={{ height: 30 }}><Skel w={80} h={24} /></div><div className="sk-ln" style={{ height: 20 }}><Skel w={130} h={13} /></div></div></div>
          <RowsSkeleton rows={3} h={52} label="Chargement des lignes" />
        </div>
      ) : (
        <div className="fade-in">
          <div className="tsx-sum">
            <span className="tsx-ico"><Icon name="clock" size={20} /></span>
            <div><b>{minutesToHours(totalMinutes)}</b><span>heures passées · {count} ligne{count > 1 ? "s" : ""}</span></div>
          </div>
          {count > 0 ? (
            <>
              <div className="tsx-head" aria-hidden="true"><span>Date</span><span>Employé</span><span>Description</span><span>Durée</span><span /></div>
              <ul className="tsx-list">
                {timesheets.map((t) => <Entry key={t.id} entry={t} who={nameOf(t.userId)} member={memberOf(t.userId)} onSave={saveEntry} onRemove={removeEntry} />)}
              </ul>
            </>
          ) : !adding && (
            <div className="empty-tab"><Icon name="clock" size={22} /><b>Aucune feuille de temps</b><span>Enregistrez le temps passé sur cette tâche.</span></div>
          )}
        </div>
      )}
      {!canEdit ? null : adding ? (
        <form onSubmit={addEntry} className={`tsx-form ${saving ? "bs-inert" : ""}`} aria-busy={saving} inert={saving ? "" : undefined}>
          <input type="date" aria-label="Date" value={newEntry.date} onChange={(e) => setNewEntry({ ...newEntry, date: e.target.value })} />
          <input placeholder="Description" aria-label="Description" value={newEntry.description} onChange={(e) => setNewEntry({ ...newEntry, description: e.target.value })} className="grow" />
          <input aria-label="Durée (HH:MM)" value={newEntry.duration} onChange={(e) => setNewEntry({ ...newEntry, duration: e.target.value })} className="dur-in" placeholder="HH:MM" />
          <button type="submit" className={`bs ${saving ? "bs-run" : ""}`} disabled={saving}><BusyLabel busy={saving}>Ajouter</BusyLabel></button>
          <button type="button" className="ghost" disabled={saving} onClick={() => { setAdding(false); setErr(""); }}>Annuler</button>
        </form>
      ) : (
        <button type="button" className="add-dash" disabled={!timesheets} onClick={() => setAdding(true)}><Icon name="plus" size={15} /> Ajouter une ligne</button>
      )}
      {err && <p className="error" style={{ padding: 0 }}>{err}</p>}
    </div>
  );
}
