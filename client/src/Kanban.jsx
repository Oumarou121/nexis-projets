import { useEffect, useRef, useState } from "react";
import LabelChips from "./LabelChips.jsx";
import { Avatar, BusyLabel, Icon, Menu, PriorityStar, StatusBar, StatusPill } from "./ui.jsx";
import { stageColor, TASK_STATUS, isLate, shortDate } from "./labels.js";

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
    <form className="kadd" onSubmit={submit} aria-busy={busy} onKeyDown={(e) => e.key === "Escape" && !busy && onCancel()}>
      <input ref={ref} aria-label="Titre de la nouvelle tâche" placeholder="Titre de la tâche…" readOnly={busy} value={title} onChange={(e) => setTitle(e.target.value)} />
      <div className="row">
        <button className={`bs ${busy ? "bs-run" : ""}`} disabled={busy || title.trim().length < 2}><BusyLabel busy={busy}>Ajouter</BusyLabel></button>
        <button type="button" className="ghost" disabled={busy} onClick={onCancel}>Annuler</button>
      </div>
    </form>
  );
}

/**
 * Tableau Kanban à la Odoo : colonnes sans fond, cartes plates collées, bande de couleur à gauche.
 * Au tactile (pas de glisser-déposer HTML5), la pastille de statut de chaque carte ouvre un menu.
 */
export default function Kanban({ tasks, stages, members, canAssign, onMove, onChange, onRemove, onOpen, onSidebar, onQuickAdd, subStats, isBusy = () => false }) {
  const [dragId, setDragId] = useState(null);
  const [overCol, setOverCol] = useState(null);
  const [adding, setAdding] = useState(null);
  const who = (id) => members.find((m) => m.userId === id);
  // Colonnes = étapes du projet, dans l'ordre. Sans étapes (pas encore chargées) : les 3 catégories.
  const columns = stages?.length ? stages : Object.entries(TASK_STATUS).map(([id, name]) => ({ id, name, category: id }));
  const inColumn = (t, c) => (stages?.length ? t.stageId === c.id : t.status === c.id);

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
      {columns.map((c) => {
        const status = c.id;
        const label = c.name;
        const col = tasks.filter((t) => inColumn(t, c));
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
              <i className="kdot" style={{ background: stageColor(c) }} aria-hidden="true" />
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
                    className={`kcard p-${t.priority} ${t.status === "done" ? "is-done" : ""} ${dragId === t.id ? "dragging" : ""} ${isBusy(t, "*") ? "is-busy" : ""}`}
                    draggable={!!onMove && !isBusy(t, "stage")}
                    onDragStart={(e) => { e.dataTransfer.setData("text/plain", t.id); e.dataTransfer.effectAllowed = "move"; setDragId(t.id); }}
                    onDragEnd={() => { setDragId(null); setOverCol(null); }}
                  >
                    {t.labels?.length > 0 && <LabelChips labels={t.labels} />}
                    <div className="kt">
                      <button className="ktitle" onClick={() => onOpen(t)}>
                        <span className={t.status === "done" ? "done" : ""}>{t.title}</span>
                      </button>
                      <PriorityStar priority={t.priority} busy={isBusy(t, "priority")} onChange={(priority) => onChange(t, { priority })} />
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
                        <StatusPill compact busy={isBusy(t, "stage")} stages={stages} stageId={t.stageId} status={t.status} onChange={(s) => onMove(t, s)} />
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
