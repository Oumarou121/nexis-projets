import { useEffect, useState } from "react";
import { api } from "./api.js";
import { Avatar, Icon } from "./ui.jsx";
import { memberName, todayISO } from "./labels.js";

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
  useEffect(() => {
    setDate(entry.date);
    setDescription(entry.description ?? "");
    setDuration(minutesToHours(entry.duration));
  }, [entry]);

  return (
    <tr>
      <td><input type="date" aria-label="Date" className="ti" value={date} onChange={(e) => setDate(e.target.value)} onBlur={() => date && date !== entry.date && onSave(entry, { date })} /></td>
      <td><span className="ass"><Avatar member={member} name={member ? undefined : who} size={22} />{who}</span></td>
      <td><input className="ti" aria-label="Description" value={description} placeholder="Que avez-vous fait ?" onChange={(e) => setDescription(e.target.value)} onBlur={() => description !== (entry.description ?? "") && onSave(entry, { description })} /></td>
      <td style={{ textAlign: "right" }}>
        <input
          className="ti dur"
          aria-label="Durée (HH:MM)"
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          onBlur={() => {
            const m = hoursToMinutes(duration);
            if (!m || m <= 0) return setDuration(minutesToHours(entry.duration)); // saisie invalide : on rétablit
            if (m !== entry.duration) onSave(entry, { duration: m });
          }}
        />
      </td>
      <td style={{ textAlign: "right" }}><button type="button" className="icon-btn" onClick={() => onRemove(entry)} aria-label="Supprimer la ligne"><Icon name="trash" size={15} /></button></td>
    </tr>
  );
}

/** Feuilles de temps d'une tâche : lignes modifiables et total des heures passées. */
export default function Timesheets({ orgId, projectId, taskId, members }) {
  const [timesheets, setTimesheets] = useState(null);
  const [err, setErr] = useState("");
  const [adding, setAdding] = useState(false);
  const blank = () => ({ date: todayISO(), description: "", duration: "01:00" });
  const [newEntry, setNewEntry] = useState(blank);
  const base = `/api/organizations/${orgId}/projects/${projectId}/tasks/${taskId}/timesheets`;

  useEffect(() => {
    api(base).then(setTimesheets).catch((e) => setErr(e.message));
  }, [base]);

  const totalMinutes = (timesheets ?? []).reduce((acc, t) => acc + t.duration, 0);

  async function addEntry(e) {
    e.preventDefault();
    const duration = hoursToMinutes(newEntry.duration);
    if (!duration || duration <= 0) return setErr("Durée invalide (format HH:MM).");
    try {
      const created = await api(base, "POST", { date: newEntry.date, description: newEntry.description, duration });
      setTimesheets((t) => [created, ...(t ?? [])]);
      setNewEntry(blank());
      setAdding(false);
      setErr("");
    } catch (e2) {
      setErr(e2.message);
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
    if (!window.confirm("Supprimer cette feuille de temps ?")) return;
    try {
      await api(`${base}/${entry.id}`, "DELETE");
      setTimesheets((t) => t.filter((x) => x.id !== entry.id));
      setErr("");
    } catch (e) {
      setErr(e.message);
    }
  }

  const memberOf = (id) => members.find((x) => x.userId === id);
  const nameOf = (id) => (memberOf(id) ? memberName(memberOf(id)) : "Inconnu");

  return (
    <div>
      <div className="table-wrap" style={{ margin: "4px 0" }}>
        <table className="lt" style={{ minWidth: 560 }}>
          <thead>
            <tr><th>Date</th><th>Employé</th><th>Description</th><th style={{ textAlign: "right" }}>Durée</th><th /></tr>
          </thead>
          <tbody>
            {(timesheets ?? []).map((t) => <Entry key={t.id} entry={t} who={nameOf(t.userId)} member={memberOf(t.userId)} onSave={saveEntry} onRemove={removeEntry} />)}
            {timesheets && timesheets.length === 0 && !adding && <tr><td colSpan={5} className="muted" style={{ textAlign: "center", padding: 20 }}>Aucune feuille de temps.</td></tr>}
          </tbody>
          <tfoot>
            <tr><td colSpan={3}>Heures passées</td><td style={{ textAlign: "right" }}>{minutesToHours(totalMinutes)}</td><td /></tr>
          </tfoot>
        </table>
      </div>
      {adding ? (
        <form onSubmit={addEntry} className="row" style={{ marginTop: 8, flexWrap: "wrap" }}>
          <input type="date" aria-label="Date" value={newEntry.date} onChange={(e) => setNewEntry({ ...newEntry, date: e.target.value })} style={{ flex: "none" }} />
          <input placeholder="Description" aria-label="Description" value={newEntry.description} onChange={(e) => setNewEntry({ ...newEntry, description: e.target.value })} style={{ flex: "1 1 180px" }} />
          <input aria-label="Durée (HH:MM)" value={newEntry.duration} onChange={(e) => setNewEntry({ ...newEntry, duration: e.target.value })} style={{ width: 80, flex: "none", textAlign: "right" }} placeholder="HH:MM" />
          <button type="submit">Ajouter</button>
          <button type="button" className="ghost" onClick={() => { setAdding(false); setErr(""); }}>Annuler</button>
        </form>
      ) : (
        <button type="button" className="ghost" style={{ marginTop: 8 }} onClick={() => setAdding(true)}><Icon name="plus" size={14} /> Ajouter une ligne</button>
      )}
      {err && <p className="error" style={{ padding: 0 }}>{err}</p>}
    </div>
  );
}
