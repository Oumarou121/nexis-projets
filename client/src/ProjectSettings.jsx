import { useEffect, useState } from "react";
import { usePerms } from "./perms.js";
import { api } from "./api.js";
import { ColorPicker, Icon } from "./ui.jsx";
import { projectColor } from "./labels.js";

const DEFAULT_SETTINGS = {
  dependencies: false,
  milestones: false,
  recurring_tasks: false,
  timesheets: false,
  documents: false,
  visibility: "internal",
};

const VISIBILITY = [
  ["private", "Privé", "Utilisateurs internes invités"],
  ["internal", "Interne", "Tous les utilisateurs internes"],
  ["public", "Public", "Utilisateurs portail invités et tous les utilisateurs internes"],
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
export default function ProjectSettings({ orgId, project, onChange, onClose }) {
  const [settings, setSettings] = useState({ ...DEFAULT_SETTINGS, ...(project.settings ?? {}) });
  const [tab, setTab] = useState("settings");
  const [saving, setSaving] = useState(false);
  const { canEdit } = usePerms();
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!onClose) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
          <span><small>Paramètres du projet</small><strong>{project.name}</strong></span>
        </span>
        {onClose && <button type="button" className="icon-btn" aria-label="Fermer" onClick={onClose}><Icon name="close" size={18} /></button>}
      </header>
      <div className="set-body">
        <div className="set-tabs" role="tablist">
          <button role="tab" aria-selected={tab === "settings"} className={tab === "settings" ? "on" : ""} onClick={() => setTab("settings")}>Paramètres</button>
          <button role="tab" aria-selected={tab === "description"} className={tab === "description" ? "on" : ""} onClick={() => setTab("description")}>Description</button>
        </div>

        {tab === "description" ? (
          project.description
            ? <p className="panel-desc set-box">{project.description}</p>
            : <div className="set-empty"><strong>Aucune description</strong><span>Vous pouvez l'ajouter depuis le menu « ⋯ » du projet.</span></div>
        ) : (
          <>
            {err && <p className="error" style={{ padding: 0 }}>{err}</p>}
            <section className="set-box">
              <h5 className="set-h">Couleur du projet</h5>
              <ColorPicker name="set-color" disabled={saving || !canEdit} value={colorIdx} onChange={saveColor} />
            </section>
            <section className="set-box">
              <h5 className="set-h">Visibilité</h5>
              <div className="set-cards" role="radiogroup" aria-label="Visibilité">
                {VISIBILITY.map(([v, label, hint]) => (
                  <label key={v} className="set-card">
                    <input type="radio" name="visibility" value={v} checked={settings.visibility === v} disabled={saving || !canEdit} onChange={() => saveSetting("visibility", v)} />
                    <span><b>{label}</b><small>{hint}</small></span>
                  </label>
                ))}
              </div>
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
