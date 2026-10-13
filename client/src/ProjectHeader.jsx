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
  const { canEdit } = usePerms();
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
      readOnly={!canEdit || saving}
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
export default function ProjectHeader({ orgId, project, onChange, onDeleted }) {
  const { canEdit, canDelete } = usePerms();
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

  async function remove() {
    await confirmDialog({ tone: "danger", icon: "alert", title: "Supprimer le projet ?", text: "Toutes ses tâches, commentaires, fichiers, feuilles de temps et invitations seront supprimés. Cette action est définitive.", ...(project.taskCount ? { list: [`${project.taskCount} tâche${project.taskCount > 1 ? "s" : ""}`] } : {}), field: { label: "Pour confirmer, tapez le nom du projet", match: project.name }, ok: "Supprimer le projet",
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
        <select aria-label="Statut du projet" disabled={!canEdit || inst.busy("status")} aria-busy={inst.busy("status") || undefined} value={project.status} onChange={(e) => save({ status: e.target.value })}>
          {Object.entries(PROJECT_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        {inst.busy("status") && <Spin size={14} className="ib" />}
        <select aria-label="Priorité du projet" disabled={!canEdit || inst.busy("priority")} aria-busy={inst.busy("priority") || undefined} value={project.priority} onChange={(e) => save({ priority: e.target.value })}>
          {Object.entries(PRIORITY).map(([v, l]) => <option key={v} value={v}>Priorité {l.toLowerCase()}</option>)}
        </select>
        {inst.busy("priority") && <Spin size={14} className="ib" />}
        <DateField label="Échéance du projet" busy={inst.busy("dueDate")} value={project.dueDate} placeholder="Échéance" onChange={(dueDate) => save({ dueDate })} />
        {(canEdit || canDelete) && <Menu
          label="Plus d'actions sur le projet"
          trigger={<Icon name="more" />}
          items={[
            ...(canEdit ? [{ label: showDesc ? "Masquer la description" : "Ajouter une description", icon: "list", onClick: () => setShowDesc(!showDesc) }] : []),
            ...(canDelete ? [{ label: "Supprimer le projet", icon: "trash", danger: true, onClick: remove }] : []),
          ]}
        />}
      </div>
      {showDesc && (
        <div className="pdesc">
          <textarea
            aria-label="Description"
            readOnly={!canEdit || inst.busy("description")}
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
