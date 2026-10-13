import { useEffect, useState } from "react";
import { api } from "./api.js";
import { usePerms } from "./perms.js";
import { BusyLabel, Icon, Spin } from "./ui.jsx";
import { STAGE_COLORS, stageColor } from "./labels.js";
import { confirmDialog } from "./confirm.jsx";
const COLOR_NAMES = ["Gris", "Bleu", "Violet", "Orange", "Vert", "Turquoise", "Rose", "Rouge-orangé"];

/** Pastille de couleur d'une étape + palette (8 couleurs, ou « Couleur de la catégorie »). */
function ColorPicker({ stage, disabled, onPick }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="st-swatch" onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
      <button type="button" aria-label={`Couleur de l’étape ${stage.name}`} aria-haspopup="true" aria-expanded={open} disabled={disabled} style={{ background: stageColor(stage) }} onClick={() => setOpen(!open)} />
      {open && (
        <div className="st-pal" role="radiogroup" aria-label="Couleur de l’étape">
          {Array.from({ length: STAGE_COLORS }, (_, c) => (
            <button key={c} type="button" role="radio" aria-checked={stage.color === c} aria-label={COLOR_NAMES[c]} title={COLOR_NAMES[c]} style={{ background: `var(--sc-${c})` }} onClick={() => { setOpen(false); onPick(c); }} />
          ))}
          <button type="button" className="st-auto" onClick={() => { setOpen(false); onPick(null); }}>Couleur de la catégorie</button>
        </div>
      )}
    </span>
  );
}
import "./stages.css";

// Catégorie = ce qui compte pour les retards, rapports et l'avancement (le nom, lui, est libre).
const CATEGORIES = [["todo", "À faire"], ["in_progress", "En cours"], ["done", "Terminé"]];
const MAX = 12;

/**
 * Étapes (statuts) du projet : créer, renommer, réordonner, supprimer. Le modèle par défaut de
 * l'organisation ne s'applique qu'aux NOUVEAUX projets (ce projet garde ses étapes).
 */
export default function ProjectStages({ orgId, project, stages, onChange, onBusy }) {
  const { canEdit, canCreate } = usePerms();
  const base = `/api/organizations/${orgId}/projects/${project.id}/stages`;
  const tplBase = `/api/organizations/${orgId}/stage-template`;
  const [list, setList] = useState(stages ?? []);
  useEffect(() => setList(stages ?? []), [stages]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState(null); // étape en cours de modification (petite barre circulaire sur sa ligne)
  useEffect(() => { onBusy?.(busy); return () => onBusy?.(false); }, [busy, onBusy]); // verrouille la fermeture du modal parent
  const [name, setName] = useState("");
  const [category, setCategory] = useState("in_progress");
  const [color, setColor] = useState(null);
  const [tpl, setTpl] = useState(null); // { stages, isDefault }

  useEffect(() => {
    let alive = true;
    api(tplBase).then((d) => alive && setTpl(d)).catch(() => alive && setTpl(null));
    return () => { alive = false; };
  }, [tplBase]);

  // Version « dans le modal » : l'erreur remonte au modal (qui reste ouvert) au lieu d'être avalée.
  const mutate = async (fn) => {
    const d = await fn();
    setList(d.stages);
    setErr("");
    onChange?.();
  };

  async function run(fn, id = null) {
    setBusy(true);
    setBusyId(id);
    try {
      const d = await fn();
      setList(d.stages);
      setErr("");
      onChange?.();
      return true;
    } catch (e) {
      setErr(e.message);
      return false;
    } finally {
      setBusy(false);
      setBusyId(null);
    }
  }

  const add = async (e) => {
    e.preventDefault();
    if (name.trim() && (await run(() => api(base, "POST", { name, category, color }), "add"))) { setName(""); setColor(null); }
  };
  const rename = (s, value) => value.trim() && value.trim() !== s.name && run(() => api(`${base}/${s.id}`, "PATCH", { name: value }), s.id);
  const recolor = (s, value) => run(() => api(`${base}/${s.id}`, "PATCH", { color: value }), s.id);
  const recategorize = (s, value) => run(() => api(`${base}/${s.id}`, "PATCH", { category: value }), s.id);
  const shift = (i, step) => {
    const ids = list.map((s) => s.id);
    [ids[i], ids[i + step]] = [ids[i + step], ids[i]];
    return run(() => api(`${base}/order`, "PUT", { ids }), list[i].id);
  };
  async function askDelete(s) {
    if (s.taskCount > 0) {
      await confirmDialog({
        tone: "danger", icon: "layers", title: `Supprimer l’étape « ${s.name} » ?`,
        text: `Elle contient ${s.taskCount} tâche${s.taskCount > 1 ? "s" : ""}. Choisissez l’étape où les déplacer.`,
        select: { label: "Étape de destination", options: list.filter((x) => x.id !== s.id).map((x) => ({ value: x.id, label: x.name })) },
        ok: "Déplacer et supprimer",
        run: (moveTo) => mutate(() => api(`${base}/${s.id}?moveTo=${encodeURIComponent(moveTo)}`, "DELETE")),
      });
      return;
    }
    await confirmDialog({ tone: "danger", icon: "trash", title: "Supprimer l’étape ?", text: "Elle ne contient aucune tâche.", chip: [s.name, `Catégorie : ${CATEGORIES.find(([v]) => v === s.category)?.[1] ?? ""}`], ok: "Supprimer", run: () => mutate(() => api(`${base}/${s.id}`, "DELETE")) });
  }

  async function saveTemplate() {
    await confirmDialog({
      tone: "info", icon: "layers", title: "Utiliser ces étapes comme modèle ?", text: "Les nouveaux projets de l’organisation démarreront avec ces étapes. Les projets existants ne changent pas.", ok: "Définir comme modèle",
      run: async () => {
        const d = await api(tplBase, "PUT", { stages: list.map(({ name: n, category: c, color: k }) => ({ name: n, category: c, color: k ?? null })) });
        setTpl({ stages: d.stages, isDefault: false });
        setErr("");
      },
    });
  }
  async function resetTemplate() {
    await confirmDialog({
      tone: "info", icon: "undo", title: "Revenir au modèle intégré ?", text: "Les nouveaux projets démarreront avec À faire, En cours, En revue et Terminée.", ok: "Revenir au modèle",
      run: async () => {
        const d = await api(tplBase, "DELETE");
        setTpl({ stages: d.stages, isDefault: true });
        setErr("");
      },
    });
  }

  return (
    <div className="st">
      <p className="st-note">
        Les étapes décrivent le circuit de vos tâches (colonnes du Kanban). La <b>catégorie</b> de chaque étape sert aux retards, aux rapports et à l’avancement : elles restent comparables même si les noms changent.
      </p>
      {err && <p className="error" style={{ padding: 0 }} role="alert">{err}</p>}

      <ol className="st-list">
        {list.map((s, i) => (
          <li key={s.id} className="st-row">
            <ColorPicker stage={s} disabled={!canEdit || busy} onPick={(c) => recolor(s, c)} />
            {canEdit ? (
              <input
                key={`${s.id}-${s.name}`}
                className="st-name"
                aria-label={`Nom de l’étape ${s.name}`}
                defaultValue={s.name}
                maxLength={30}
                disabled={busy}
                onBlur={(e) => { rename(s, e.target.value); e.target.value = s.name; }}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              />
            ) : (
              <b className="st-name-ro">{s.name}</b>
            )}
            <select aria-label={`Catégorie de ${s.name}`} value={s.category} disabled={!canEdit || busy} onChange={(e) => recategorize(s, e.target.value)}>
              {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <span className="st-count" title="Tâches dans cette étape">{busyId === s.id && <Spin size={14} className="ib" />} {s.taskCount ?? 0} tâche{(s.taskCount ?? 0) > 1 ? "s" : ""}</span>
            {canEdit && (
              <span className="st-acts">
                <button type="button" className="icon-btn" aria-label={`Monter ${s.name}`} disabled={busy || i === 0} onClick={() => shift(i, -1)}>↑</button>
                <button type="button" className="icon-btn" aria-label={`Descendre ${s.name}`} disabled={busy || i === list.length - 1} onClick={() => shift(i, 1)}>↓</button>
                <button type="button" className="icon-btn" aria-label={`Supprimer ${s.name}`} disabled={busy || list.length < 2} onClick={() => askDelete(s)}><Icon name="trash" size={15} /></button>
              </span>
            )}
          </li>
        ))}
      </ol>

      {canEdit && (
        <form className="st-add" onSubmit={add}>
          <ColorPicker stage={{ name: "nouvelle étape", category, color }} disabled={busy || list.length >= MAX} onPick={setColor} />
          <input aria-label="Nom de la nouvelle étape" placeholder={list.length >= MAX ? `${MAX} étapes au maximum` : "Nouvelle étape (ex. En attente client)"} maxLength={30} value={name} onChange={(e) => setName(e.target.value)} disabled={busy || list.length >= MAX} />
          <select aria-label="Catégorie de la nouvelle étape" value={category} onChange={(e) => setCategory(e.target.value)} disabled={busy || list.length >= MAX}>
            {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <button className={`bs ${busyId === "add" ? "bs-run" : ""}`} disabled={busy || !name.trim() || list.length >= MAX}><BusyLabel busy={busyId === "add"}>Ajouter</BusyLabel></button>
        </form>
      )}

      <section className="st-tpl">
        <h5 className="set-h">Modèle par défaut de l’organisation</h5>
        <p className="st-note" style={{ margin: "0 0 8px" }}>
          Les <b>nouveaux projets</b> démarrent avec : {tpl ? tpl.stages.map((s, i) => (<span key={i}>{i > 0 && " → "}<i className="st-dot" style={{ background: stageColor(s), display: "inline-block", marginRight: 4 }} aria-hidden="true" />{s.name}</span>)) : "…"}
          {tpl?.isDefault ? " (modèle intégré)" : ""}. Les projets existants gardent leurs étapes.
        </p>
        {canCreate ? (
          <div className="st-del-row">
            <button type="button" disabled={busy || list.length === 0} onClick={saveTemplate}>Utiliser les étapes de ce projet comme modèle</button>
            {tpl && !tpl.isDefault && <button type="button" className="ghost" disabled={busy} onClick={resetTemplate}>Revenir au modèle intégré</button>}
          </div>
        ) : (
          <p className="muted small" style={{ margin: 0 }}>Seules les personnes autorisées à créer des projets peuvent modifier le modèle.</p>
        )}
      </section>
    </div>
  );
}
