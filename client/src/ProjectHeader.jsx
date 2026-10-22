import { useState } from "react";
import { usePerms } from "./perms.js";
import { api } from "./api.js";
import { DateField, Icon, Menu, Spin, useInstant } from "./ui.jsx";
import { PRIORITY, PROJECT_STATUS } from "./labels.js";
import "./members.css";
import { confirmDialog } from "./confirm.jsx";

/** Nom du projet, modifiable sur place (dans le fil d'Ariane du panneau de contrôle). */
export function ProjectTitle({ orgId, project, onChange }) {
  const [name, setName] = useState(project.name);
  const { canManage } = usePerms();
  const url = `/api/organizations/${orgId}/projects/${project.id}`;
  const inst = useInstant();
  const saving = inst.busy("name");
  async function save() {
    const v = name.trim();
    if (!v) return setName(project.name);
    if (v === project.name) return;
    await inst.run("name", async () => {
      try {
        onChange(await api(url, "PATCH", { name: v }));
      } catch {
        setName(project.name);
      }
    });
  }
  return (
    <>
    <input
      className="ptitle"
      aria-label="Nom du projet"
      aria-busy={saving || undefined}
      readOnly={!canManage || saving}
      size={Math.max(6, name.length)}
      value={name}
      onChange={(e) => setName(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
    />
    {saving && <span className="fv-spin"><Spin size={14} className="ib" /></span>}
    </>
  );
}

/** Ligne discrète sous le panneau de contrôle : statut, priorité, échéance, description, menu ⋯. */
// `tasks` : tâches du projet déjà chargées (sous-tâches et jalons compris), pour les avertissements.
export default function ProjectHeader({ orgId, project, tasks = null, onChange, onDeleted }) {
  const { canManage, canDelete } = usePerms();
  const [err, setErr] = useState("");
  const [desc, setDesc] = useState(project.description ?? "");
  const [showDesc, setShowDesc] = useState(!!project.description);
  const url = `/api/organizations/${orgId}/projects/${project.id}`;

  const inst = useInstant();
  const save = (changes) => inst.run(Object.keys(changes)[0], async () => {
    try {
      onChange(await api(url, "PATCH", changes));
      setErr("");
    } catch (e) {
      setErr(e.message);
    }
  });

  // Clore (terminer) un projet qui a encore des tâches ouvertes : on prévient, sans bloquer. Elles restent ouvertes,
  // mais ne comptent plus en retard et ne déclenchent plus de rappels (règle du serveur, util.js).
  async function changeStatus(status) {
    const open = (tasks ?? []).filter((t) => !t.parentId && !t.isMilestone && t.status !== "done").length;
    if (status === "done" && open > 0) {
      const ok = await confirmDialog({
        tone: "warn", icon: "alert", title: "Terminer le projet ?",
        text: `${open} tâche${open > 1 ? "s sont" : " est"} encore ouverte${open > 1 ? "s" : ""}. Elle${open > 1 ? "s" : ""} restera ouverte${open > 1 ? "s" : ""}, mais ne comptera plus en retard et ne déclenchera plus de rappels.`,
        ok: "Terminer quand même",
      });
      if (!ok) return;
    }
    save({ status });
  }

  async function remove() {
    // Tout ce que la suppression efface : sous-tâches et jalons compris.
    const all = tasks ? tasks.length : project.allCount ?? project.taskCount ?? 0;
    await confirmDialog({ tone: "danger", icon: "alert", title: "Supprimer le projet ?", text: "Toutes ses tâches, commentaires, fichiers, feuilles de temps et invitations seront supprimés. Cette action est définitive.", ...(all ? { list: [`${all} tâche${all > 1 ? "s" : ""} (sous-tâches et jalons compris)`] } : {}), field: { label: "Pour confirmer, tapez le nom du projet", match: project.name }, ok: "Supprimer le projet",
      run: async () => {
      await api(url, "DELETE");
      onDeleted();
      },
    });
  }

  return (
    <>
      <div className="pmeta-row">
        {project.visibility === "private" && <span className="pm-chip" title="Visible uniquement par ses membres, les responsables et les administrateurs"><Icon name="lock" size={13} />Privé</span>}
        <select aria-label="Statut du projet" disabled={!canManage || inst.busy("status")} aria-busy={inst.busy("status") || undefined} value={project.status} onChange={(e) => changeStatus(e.target.value)}>
          {Object.entries(PROJECT_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        {inst.busy("status") && <Spin size={14} className="ib" />}
        <select aria-label="Priorité du projet" disabled={!canManage || inst.busy("priority")} aria-busy={inst.busy("priority") || undefined} value={project.priority} onChange={(e) => save({ priority: e.target.value })}>
          {Object.entries(PRIORITY).map(([v, l]) => <option key={v} value={v}>Priorité {l.toLowerCase()}</option>)}
        </select>
        {inst.busy("priority") && <Spin size={14} className="ib" />}
        <DateField label="Échéance du projet" busy={inst.busy("dueDate")} value={project.dueDate} placeholder="Échéance" onChange={(dueDate) => save({ dueDate })} />
        {(canManage || canDelete) && <Menu
          label="Plus d'actions sur le projet"
          trigger={<Icon name="more" />}
          items={[
            ...(canManage ? [{ label: showDesc ? "Masquer la description" : "Ajouter une description", icon: "list", onClick: () => setShowDesc(!showDesc) }] : []),
            ...(canDelete ? [{ label: "Supprimer le projet", icon: "trash", danger: true, onClick: remove }] : []),
          ]}
        />}
      </div>
      {showDesc && (
        <div className="pdesc">
          <textarea
            aria-label="Description"
            readOnly={!canManage || inst.busy("description")}
            aria-busy={inst.busy("description") || undefined}
            placeholder="Description du projet…"
            rows={1}
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            onBlur={() => desc.trim() !== (project.description ?? "") && save({ description: desc })}
          />
        </div>
      )}
      {err && <p className="error">{err}</p>}
    </>
  );
}
