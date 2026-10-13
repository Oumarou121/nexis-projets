import { useEffect, useState } from "react";
import { usePerms } from "./perms.js";
import { api } from "./api.js";
import { ColorPicker, Icon, Spin } from "./ui.jsx";
import { projectColor } from "./labels.js";
import ProjectMembers from "./ProjectMembers.jsx";
import ProjectSharing from "./ProjectSharing.jsx";
import ProjectStages from "./ProjectStages.jsx";
import "./members.css";
import { confirmDialog } from "./confirm.jsx";

const DEFAULT_SETTINGS = {
  dependencies: false,
  milestones: false,
  recurring_tasks: false,
  timesheets: false,
  documents: false,
};

// Appliquée par le serveur. « Public » = comme « Interne » pour l'organisation + invités externes en lecture seule.
const VISIBILITY = [
  ["private", "Privé", "Seulement les membres du projet", true],
  ["internal", "Interne", "Tous les utilisateurs de l'organisation", true],
  ["public", "Public", "Partageable en lecture seule avec des invités externes par e-mail", true],
];

const OPTIONS = {
  "Gestion des tâches": [
    ["dependencies", "Dépendances entre tâches", "Définir l'ordre dans lequel les tâches doivent être réalisées"],
    ["milestones", "Jalons", "Suivre les grandes étapes à atteindre pour réussir"],
    ["recurring_tasks", "Tâches récurrentes", "Répéter automatiquement les tâches"],
  ],
  "Gestion du temps": [["timesheets", "Feuilles de temps", "Enregistrer le temps passé sur les tâches"]],
  "Documents et analyse": [["documents", "Documents", "Classer et partager vos documents avec vos clients"]],
};

/** Paramètres du projet (fenêtre) : visibilité et fonctions activables. Enregistrés dès qu'on les change. */
export default function ProjectSettings({ orgId, project, onChange, onClose, people = [], canList = false, onMembersChange, onLeave, stages = [], onStagesChange, onBusy }) {
  const [settings, setSettings] = useState({ ...DEFAULT_SETTINGS, ...(project.settings ?? {}) });
  const [tab, setTab] = useState("settings");
  const [saving, setSaving] = useState(false);
  const [tabBusy, setTabBusy] = useState(false); // action en cours dans un onglet (étapes, membres, partage)
  const anyBusy = saving || tabBusy;
  useEffect(() => { onBusy?.(anyBusy); return () => onBusy?.(false); }, [anyBusy, onBusy]);
  const { canEdit } = usePerms();
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!onClose) return;
    const onKey = (e) => e.key === "Escape" && !anyBusy && onClose(); // pas de fermeture pendant une action
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, anyBusy]);

  async function saveColor(color) {
    setSaving(true);
    try {
      onChange?.(await api(`/api/organizations/${orgId}/projects/${project.id}`, "PATCH", { color }));
      setErr("");
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  const visibility = project.visibility ?? "internal";

  async function saveVisibility(value) {
    if (value === visibility) return;
    const leavingPublic = visibility === "public" && value !== "public";
    const cfg =
      value === "private"
        ? { tone: "warn", icon: "lock", title: "Passer ce projet en privé ?", text: "Seuls ses membres (vous en faites partie), les responsables et les administrateurs pourront encore le voir. Les autres personnes le perdront de vue immédiatement.", ...(leavingPublic ? { note: "Les invitations en cours seront aussi révoquées : les invités perdront l’accès immédiatement." } : {}), ok: "Passer en privé" }
        : value === "public"
        ? { tone: "warn", icon: "globe", title: "Passer ce projet en public ?", text: "Vous pourrez inviter des personnes extérieures à l’organisation par e-mail. Elles verront, en lecture seule :", list: ["le nom et la description du projet", "ses tâches (titres, statuts, échéances)"], note: "Jamais les commentaires, pièces jointes, temps passé ni personnes assignées.", ok: "Passer en public" }
        : leavingPublic
        ? { tone: "warn", icon: "globe", title: "Quitter le niveau « public » ?", text: "Toutes les invitations en cours seront révoquées : les invités perdront l’accès immédiatement.", ok: "Quitter le public" }
        : null;
    const apply = async () => {
        const { assigneesWithoutAccess, ...updated } = await api(`/api/organizations/${orgId}/projects/${project.id}`, "PATCH", { visibility: value });
        onChange?.(updated);
        setErr("");
        // Passage en privé : des personnes avec une tâche en cours n'y ont plus accès.
        const n = assigneesWithoutAccess?.length ?? 0;
        setNotice(n > 0 ? `${n} ${n > 1 ? "personnes ont" : "personne a"} une tâche en cours dans ce projet sans en être ${n > 1 ? "membres" : "membre"} : ${n > 1 ? "elles ne la voient" : "elle ne la voit"} plus. Ajoutez-${n > 1 ? "les" : "la"} dans l'onglet « Membres » ou réassignez ${n > 1 ? "leurs tâches" : "sa tâche"}.` : "");
    };
    if (cfg) {
      setSaving(true);
      try {
        await confirmDialog({ ...cfg, run: apply });
      } finally {
        setSaving(false);
      }
      return;
    }
    setSaving(true);
    try {
      await apply();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveSetting(key, value) {
    setSaving(true);
    try {
      const result = await api(`/api/organizations/${orgId}/projects/${project.id}`, "PATCH", { settings: { ...settings, [key]: value } });
      setSettings({ ...DEFAULT_SETTINGS, ...(result.settings ?? {}) });
      setErr("");
      onChange?.(result);
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  const colorIdx = Number.isInteger(project.color) ? project.color : Number(projectColor(project.name).match(/\d/)[0]);
  return (
    <div className="dlg wide set-dlg" role="dialog" aria-label={`Paramètres du projet ${project.name}`}>
      <header>
        <span className="set-title">
          <i className="set-dot" style={{ background: `var(--pj-${colorIdx})` }} aria-hidden="true" />
          <span><small>Paramètres du projet</small><strong>{project.name}{visibility === "private" && <span className="pm-lock" style={{ marginLeft: 8 }}><Icon name="lock" size={14} />Privé</span>}{visibility === "public" && <span className="pm-lock" style={{ marginLeft: 8 }}><Icon name="globe" size={14} />Public</span>}{anyBusy && <span className="set-busy" role="status"><Spin size={14} />Enregistrement…</span>}</strong></span>
        </span>
        {onClose && <button type="button" className="icon-btn" aria-label="Fermer" disabled={anyBusy} onClick={onClose}><Icon name="close" size={18} /></button>}
      </header>
      <div className="set-body">
        <div className="set-tabs" role="tablist">
          <button role="tab" disabled={anyBusy} aria-selected={tab === "settings"} className={tab === "settings" ? "on" : ""} onClick={() => setTab("settings")}>Paramètres</button>
          <button role="tab" disabled={anyBusy} aria-selected={tab === "stages"} className={tab === "stages" ? "on" : ""} onClick={() => setTab("stages")}>Étapes</button>
          <button role="tab" disabled={anyBusy} aria-selected={tab === "members"} className={tab === "members" ? "on" : ""} onClick={() => setTab("members")}>Membres</button>
          {visibility === "public" && <button role="tab" disabled={anyBusy} aria-selected={tab === "sharing"} className={tab === "sharing" ? "on" : ""} onClick={() => setTab("sharing")}>Partage</button>}
          <button role="tab" aria-selected={tab === "description"} className={tab === "description" ? "on" : ""} onClick={() => setTab("description")}>Description</button>
        </div>

        {tab === "stages" ? (
          <ProjectStages onBusy={setTabBusy} orgId={orgId} project={project} stages={stages} onChange={onStagesChange} />
        ) : tab === "members" ? (
          <ProjectMembers onBusy={setTabBusy} orgId={orgId} project={project} people={people} canList={canList} onChange={onMembersChange} onLeave={onLeave} />
        ) : tab === "sharing" && visibility === "public" ? (
          <ProjectSharing onBusy={setTabBusy} orgId={orgId} project={project} />
        ) : tab === "description" ? (
          project.description
            ? <p className="panel-desc set-box">{project.description}</p>
            : <div className="set-empty"><strong>Aucune description</strong><span>Vous pouvez l'ajouter depuis le menu « ⋯ » du projet.</span></div>
        ) : (
          <>
            {err && <p className="error" style={{ padding: 0 }}>{err}</p>}
            {notice && <p className="muted small" role="status" style={{ padding: 0, color: "var(--warn)" }}>{notice}</p>}
            <section className="set-box">
              <h5 className="set-h">Couleur du projet</h5>
              <ColorPicker name="set-color" disabled={saving || !canEdit} value={colorIdx} onChange={saveColor} />
            </section>
            <section className="set-box">
              <h5 className="set-h">Visibilité</h5>
              <div className="set-cards" role="radiogroup" aria-label="Visibilité">
                {VISIBILITY.map(([v, label, hint, available]) => (
                  <label key={v} className={`set-card ${available ? "" : "is-off"}`}>
                    <input type="radio" name="visibility" value={v} checked={visibility === v} disabled={saving || !canEdit || !available} onChange={() => saveVisibility(v)} />
                    <span><b>{label}</b><small>{hint}</small></span>
                  </label>
                ))}
              </div>
              <p className="muted small" style={{ margin: "10px 0 0" }}>
                {visibility === "private"
                  ? "Les membres se gèrent dans l'onglet « Membres »."
                  : visibility === "public"
                    ? "Les invités externes se gèrent dans l'onglet « Partage »."
                    : "Passer en privé limite l'accès aux membres du projet (onglet « Membres »)."}
              </p>
            </section>
            <div className="set-cols">
              {Object.entries(OPTIONS).map(([title, items]) => (
                <section key={title} className="set-box">
                  <h5 className="set-h">{title}</h5>
                  {items.map(([key, label, hint]) => (
                    <label key={key} className="set-opt">
                      <span><b>{label}</b><small>{hint}</small></span>
                      <input type="checkbox" role="switch" checked={!!settings[key]} disabled={saving || !canEdit} onChange={() => saveSetting(key, !settings[key])} />
                    </label>
                  ))}
                </section>
              ))}
            </div>
            <p className="muted small" aria-live="polite" style={{ minHeight: 18, margin: "12px 0 0" }}>{saving ? "Enregistrement…" : canEdit ? "Les changements sont enregistrés automatiquement." : "Lecture seule : vous n'avez pas le droit de modifier ce projet."}</p>
          </>
        )}
      </div>
    </div>
  );
}
