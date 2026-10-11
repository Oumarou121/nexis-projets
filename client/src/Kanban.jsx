import { useEffect, useRef, useState } from "react";
import LabelChips from "./LabelChips.jsx";
import { Avatar, Icon, Menu, PriorityStar, StatusBar, StatusPill } from "./ui.jsx";
import { STATUS_COLOR, TASK_STATUS, isLate, shortDate } from "./labels.js";

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
            onDrop={(e) => onMove && drop(e, status)}
            aria-label={`${label} (${col.length})`}
          >
            <header className="kcol-head">
              <i className="kdot" style={{ background: STATUS_COLOR[status] }} aria-hidden="true" />
              <strong>{label}</strong>
              <span className="kcount" aria-hidden="true">{col.length}</span>
              {onQuickAdd && <button type="button" className="icon-btn" aria-label={`Ajouter une tâche dans « ${label} »`} onClick={() => setAdding(status)}><Icon name="plus" /></button>}
            </header>
            <StatusBar tasks={col} />
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
                    className={`kcard p-${t.priority} ${t.status === "done" ? "is-done" : ""} ${dragId === t.id ? "dragging" : ""}`}
                    draggable={!!onMove}
                    onDragStart={(e) => { e.dataTransfer.setData("text/plain", t.id); e.dataTransfer.effectAllowed = "move"; setDragId(t.id); }}
                    onDragEnd={() => { setDragId(null); setOverCol(null); }}
                  >
                    {t.labels?.length > 0 && <LabelChips labels={t.labels} />}
                    <div className="kt">
                      <button className="ktitle" onClick={() => onOpen(t)}>
                        <span className={t.status === "done" ? "done" : ""}>{t.title}</span>
                      </button>
                      <PriorityStar priority={t.priority} onChange={(priority) => onChange(t, { priority })} />
                      <Menu
                        className="k-menu"
                        label={`Actions pour ${t.title}`}
                        trigger={<Icon name="more" />}
                        items={[
                          { label: "Ouvrir", icon: "expand", onClick: () => onOpen(t) },
                          { label: "Aperçu rapide", icon: "list", onClick: () => onSidebar?.(t) },
                          ...(onRemove ? [{ label: "Supprimer", icon: "trash", danger: true, onClick: () => onRemove(t) }] : []),
                        ]}
                      />
                    </div>
                    {t.description && <p className="kdesc">{t.description}</p>}
                    <div className="k-foot">
                      <div className="k-meta">
                        {t.dueDate && (
                          <span className={`kdate ${late ? "late" : ""}`} title={`Échéance ${t.dueDate}`}>
                            <Icon name="clock" size={13} />{shortDate(t.dueDate)}{late ? " · en retard" : ""}
                          </span>
                        )}
                        {sub && <span title="Sous-tâches terminées"><Icon name="subtask" size={13} />{sub.done}/{sub.total}</span>}
                        {t.commentCount > 0 && <span title="Commentaires"><Icon name="comment" size={13} />{t.commentCount}</span>}
                        {t.attachmentCount > 0 && <span title="Pièces jointes"><Icon name="clip" size={13} />{t.attachmentCount}</span>}
                      </div>
                      <div className="k-right">
                        {t.assigneeId && (canAssign
                          ? <Avatar member={member} name={member ? undefined : "Ancien membre"} size={26} />
                          : <Avatar name="Assignée" size={26} title="Assignée" />)}
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
