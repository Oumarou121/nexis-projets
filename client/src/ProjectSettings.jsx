import { useEffect, useState } from "react";
import { api } from "./api.js";
import { Icon } from "./ui.jsx";

const DEFAULT_SETTINGS = {
  dependencies: false,
  milestones: false,
  recurring_tasks: false,
  timesheets: false,
  documents: false,
  visibility: "internal",
};

const VISIBILITY = [
  ["private", "Utilisateurs internes invités (privé)"],
  ["internal", "Tous les utilisateurs internes"],
  ["public", "Utilisateurs portail invités et tous les utilisateurs internes (public)"],
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
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!onClose) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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

  return (
    <div className="dlg wide" role="dialog" aria-label={`Paramètres du projet ${project.name}`}>
      <header>
        <span>Paramètres · {project.name}</span>
        {onClose && <button type="button" className="x" aria-label="Fermer" onClick={onClose}><Icon name="close" /></button>}
      </header>
      <div className="set-body">
        <div className="tabs" role="tablist" style={{ marginTop: 0, borderBottom: "1px solid var(--bd)", display: "flex" }}>
          <button role="tab" aria-selected={tab === "settings"} className={`tab ${tab === "settings" ? "on" : ""}`} onClick={() => setTab("settings")}>Paramètres</button>
          <button role="tab" aria-selected={tab === "description"} className={`tab ${tab === "description" ? "on" : ""}`} onClick={() => setTab("description")}>Description</button>
        </div>

        {tab === "description" ? (
          project.description ? <p className="panel-desc" style={{ marginTop: 16 }}>{project.description}</p> : <p className="muted" style={{ marginTop: 16 }}>Aucune description. Vous pouvez l'ajouter depuis le menu « ⋯ » du projet.</p>
        ) : (
          <>
            {err && <p className="error" style={{ padding: 0 }}>{err}</p>}
            <h5 className="set-h">Visibilité</h5>
            <div className="set-radios" role="radiogroup" aria-label="Visibilité">
              {VISIBILITY.map(([v, label]) => (
                <label key={v}>
                  <input type="radio" name="visibility" value={v} checked={settings.visibility === v} disabled={saving} onChange={() => saveSetting("visibility", v)} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            <div className="set-cols">
              {Object.entries(OPTIONS).map(([title, items]) => (
                <section key={title}>
                  <h5 className="set-h">{title}</h5>
                  {items.map(([key, label, hint]) => (
                    <label key={key} className="set-opt">
                      <input type="checkbox" checked={!!settings[key]} disabled={saving} onChange={() => saveSetting(key, !settings[key])} />
                      <span><b>{label}</b><small>{hint}</small></span>
                    </label>
                  ))}
                </section>
              ))}
            </div>
            <p className="muted small" aria-live="polite" style={{ minHeight: 18, margin: "12px 0 0" }}>{saving ? "Enregistrement…" : ""}</p>
          </>
        )}
      </div>
    </div>
  );
}
