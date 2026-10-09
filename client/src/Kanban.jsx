import { useEffect, useRef, useState } from "react";
import LabelChips from "./LabelChips.jsx";
import { Avatar, Icon, Menu, PriorityStar, StatusBar, StatusPill } from "./ui.jsx";
import { TASK_STATUS, isLate, labelColor, shortDate } from "./labels.js";

/** Création rapide en haut de colonne (comme le « + » d'Odoo) : Entrée ajoute, Échap annule. */
function QuickAdd({ onAdd, onCancel }) {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  useEffect(() => ref.current?.focus(), []);

  async function submit(e) {
    e.preventDefault();
    if (title.trim().length < 2 || busy) return;
    setBusy(true);
    const ok = await onAdd(title.trim());
    setBusy(false);
    if (ok) { setTitle(""); ref.current?.focus(); }
  }

  return (
    <form className="kadd" onSubmit={submit} onKeyDown={(e) => e.key === "Escape" && onCancel()}>
      <input ref={ref} aria-label="Titre de la nouvelle tâche" placeholder="Titre de la tâche…" value={title} onChange={(e) => setTitle(e.target.value)} />
      <div className="row">
        <button disabled={busy || title.trim().length < 2}>Ajouter</button>
        <button type="button" className="ghost" onClick={onCancel}>Annuler</button>
      </div>
    </form>
  );
}

/** Bande de couleur à gauche de la carte : première étiquette, sinon priorité haute / urgente. */
function stripeOf(t) {
  if (t.labels?.length) return labelColor(t.labels[0]);
  if (t.priority === "urgent") return "var(--bad)";
  if (t.priority === "high") return "var(--warn)";
  return "transparent";
}

/**
 * Tableau Kanban à la Odoo : colonnes sans fond, cartes plates collées, bande de couleur à gauche.
 * Au tactile (pas de glisser-déposer HTML5), la pastille de statut de chaque carte ouvre un menu.
 */
export default function Kanban({ tasks, members, canAssign, onMove, onChange, onRemove, onOpen, onSidebar, onQuickAdd, subStats }) {
  const [dragId, setDragId] = useState(null);
  const [overCol, setOverCol] = useState(null);
  const [adding, setAdding] = useState(null);
  const who = (id) => members.find((m) => m.userId === id);

  function drop(e, status) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain") || dragId;
    const task = tasks.find((t) => t.id === id);
    setDragId(null);
    setOverCol(null);
    if (task) onMove(task, status);
  }

  return (
    <div className="kanban">
      {Object.entries(TASK_STATUS).map(([status, label]) => {
        const col = tasks.filter((t) => t.status === status);
        return (
          <section
            key={status}
            className={`kcol ${overCol === status ? "over" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setOverCol(status); }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOverCol(null); }}
            onDrop={(e) => drop(e, status)}
            aria-label={`${label} (${col.length})`}
          >
            <header className="kcol-head">
              <strong>{label}</strong>
              <button type="button" className="icon-btn" aria-label={`Ajouter une tâche dans « ${label} »`} onClick={() => setAdding(status)}><Icon name="plus" /></button>
            </header>
            <StatusBar tasks={col} />
            <div className="kcount" aria-hidden="true">{col.length}</div>
            <div className="kcol-body">
              {adding === status && (
                <QuickAdd onCancel={() => setAdding(null)} onAdd={(title) => onQuickAdd(title, status)} />
              )}
              {col.map((t) => {
                const sub = subStats.get(t.id);
                const member = who(t.assigneeId);
                const late = isLate(t);
                return (
                  <article
                    key={t.id}
                    className={`kcard p-${t.priority} ${dragId === t.id ? "dragging" : ""}`}
                    style={{ "--stripe": stripeOf(t) }}
                    draggable
                    onDragStart={(e) => { e.dataTransfer.setData("text/plain", t.id); e.dataTransfer.effectAllowed = "move"; setDragId(t.id); }}
                    onDragEnd={() => { setDragId(null); setOverCol(null); }}
                  >
                    <button className="ktitle" onClick={() => onOpen(t)}>
                      <span className={t.status === "done" ? "done" : ""}>{t.title}</span>
                    </button>
                    <Menu
                      className="k-menu"
                      label={`Actions pour ${t.title}`}
                      trigger={<Icon name="more" />}
                      items={[
                        { label: "Ouvrir", icon: "expand", onClick: () => onOpen(t) },
                        { label: "Aperçu rapide", icon: "list", onClick: () => onSidebar?.(t) },
                        { label: "Supprimer", icon: "trash", danger: true, onClick: () => onRemove(t) },
                      ]}
                    />
                    {t.description && <p className="kdesc">{t.description}</p>}
                    {t.labels?.length > 0 && <LabelChips labels={t.labels} />}
                    {t.dueDate && (
                      <p className={`kdate ${late ? "late" : ""}`} title={`Échéance ${t.dueDate}`}>
                        {shortDate(t.dueDate)}{late ? " · en retard" : ""}
                      </p>
                    )}
                    <div className="k-foot">
                      <PriorityStar priority={t.priority} onChange={(priority) => onChange(t, { priority })} />
                      <div className="k-meta">
                        {sub && <span title="Sous-tâches terminées"><Icon name="subtask" size={13} />{sub.done}/{sub.total}</span>}
                        {t.commentCount > 0 && <span title="Commentaires"><Icon name="comment" size={13} />{t.commentCount}</span>}
                        {t.attachmentCount > 0 && <span title="Pièces jointes"><Icon name="clip" size={13} />{t.attachmentCount}</span>}
                      </div>
                      <div className="k-right">
                        {t.assigneeId && (canAssign
                          ? <Avatar member={member} name={member ? undefined : "Ancien membre"} size={22} />
                          : <Avatar name="Assignée" size={22} title="Assignée" />)}
                        <StatusPill compact status={t.status} onChange={(s) => onMove(t, s)} />
                      </div>
                    </div>
                  </article>
                );
              })}
              {col.length === 0 && adding !== status && <p className="kempty">Glissez une tâche ici</p>}
            </div>
          </section>
        );
      })}
    </div>
  );
}
