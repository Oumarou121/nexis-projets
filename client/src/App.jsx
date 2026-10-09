import { useCallback, useEffect, useState } from "react";
import { api } from "./api.js";
import { getOrg, nexisHome, setOrg } from "./session.js";
import Tasks from "./Tasks.jsx";
import MyTasks from "./MyTasks.jsx";
import Dashboard from "./Dashboard.jsx";
import Activity from "./Activity.jsx";
import { Icon, Menu, NavMenu } from "./ui.jsx";
import { THEMES, getTheme, setTheme } from "./theme.js";
import { PRIORITY, PROJECT_STATUS, shortDate } from "./labels.js";

const EMPTY_PROJECT = { name: "", priority: "medium", dueDate: "" };

/** Fenêtre « Créer un projet » (comme le bouton Nouveau d'Odoo). */
function NewProjectDialog({ base, onClose, onCreated }) {
  const [form, setForm] = useState(EMPTY_PROJECT);
  const [err, setErr] = useState("");

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(e) {
    e.preventDefault();
    try {
      await api(base, "POST", {
        name: form.name,
        priority: form.priority,
        ...(form.dueDate ? { dueDate: form.dueDate } : {}),
      });
      onCreated();
    } catch (e2) {
      setErr(e2.message);
    }
  }

  return (
    <div className="overlay center" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="dlg" onSubmit={submit} role="dialog" aria-label="Créer un projet">
        <header>
          Créer un projet
          <button type="button" className="x" aria-label="Fermer" onClick={onClose}><Icon name="close" /></button>
        </header>
        <div>
          <input className="nm" autoFocus placeholder="Nom du projet" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div className="fld">
            <label htmlFor="np-prio">Priorité</label>
            <select id="np-prio" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              {Object.entries(PRIORITY).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="fld">
            <label htmlFor="np-due">Échéance</label>
            <input id="np-due" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          </div>
          {err && <p className="error" style={{ padding: 0 }}>{err}</p>}
        </div>
        <footer>
          <button disabled={!form.name.trim()}>Créer</button>
          <button type="button" className="ghost" onClick={onClose}>Annuler</button>
        </footer>
      </form>
    </div>
  );
}

function Projects({ orgId, onOpen }) {
  const [list, setList] = useState([]);
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const base = `/api/organizations/${orgId}/projects`;

  const load = useCallback(() => api(base).then(setList).catch((e) => setErr(e.message)), [base]);
  useEffect(() => { load(); }, [load]);

  const shown = q.trim() ? list.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase())) : list;

  return (
    <>
      <div className="cp">
        <div className="cp-title">
          <button onClick={() => setCreating(true)}><Icon name="plus" /> Nouveau</button>
          <div className="crumb"><span className="name">Projets</span></div>
        </div>
        <div className="sw">
          <div className="search">
            <Icon name="search" size={15} className="caret" />
            <input type="search" aria-label="Rechercher un projet" placeholder="Rechercher un projet…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        <span className="cp-count">{shown.length} projet{shown.length > 1 ? "s" : ""}</span>
      </div>
      {err && <p className="error">{err}</p>}
      <div className="pgrid">
        {shown.map((p) => {
          const late = p.dueDate && p.dueDate < new Date().toISOString().slice(0, 10) && p.status !== "done";
          return (
            <article key={p.id} className={`card pcard clickable p-${p.priority}`} tabIndex={0} onClick={() => onOpen(p)} onKeyDown={(e) => e.key === "Enter" && onOpen(p)}>
              <div>
                <strong>{p.name}</strong>
                {p.description && <p className="pc-desc small">{p.description}</p>}
              </div>
              <div className="pc-foot">
                <span className={`pstatus ps-${p.status}`}>{PROJECT_STATUS[p.status]}</span>
                <span className={`small ${late ? "late" : "muted"}`}>
                  <Icon name="clock" size={13} /> {p.dueDate ? shortDate(p.dueDate) : "Sans échéance"}
                </span>
              </div>
            </article>
          );
        })}
        {shown.length === 0 && !err && (
          <div className="empty" style={{ gridColumn: "1 / -1" }}>
            <b>{list.length ? "Aucun résultat" : "Aucun projet pour l'instant"}</b>
            {list.length ? "Essayez un autre mot-clé." : "Cliquez sur « Nouveau » pour créer votre premier projet."}
          </div>
        )}
      </div>
      {creating && <NewProjectDialog base={base} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); load(); }} />}
    </>
  );
}

const THEME_ICON = { light: "sun", dark: "moon", auto: "monitor" };

export default function App() {
  const [access, setAccess] = useState(null);
  const [orgId, setOrgId] = useState("");
  const [project, setProject] = useState(null);
  const [tab, setTab] = useState("projects");
  const [people, setPeople] = useState({ members: [], canAssign: false });
  const [err, setErr] = useState("");
  const [theme, setThemeState] = useState(getTheme);
  const [cmd, setCmd] = useState(null); // commande envoyée au projet ouvert (menu Configuration)

  useEffect(() => {
    api("/api/me")
      .then((a) => {
        setAccess(a);
        const ids = (a.organizations ?? []).map((o) => o.organizationId);
        const saved = getOrg();
        setOrgId(ids.includes(saved) ? saved : ids[0] ?? "");
      })
      .catch((e) => setErr(e.message));
  }, []);

  // Membres affectables de l'organisation active (vide si NEXIS refuse la liste).
  useEffect(() => {
    if (!orgId) return;
    setProject(null);
    api(`/api/organizations/${orgId}/members`).then(setPeople).catch(() => setPeople({ members: [], canAssign: false }));
  }, [orgId]);

  async function openProject(id) {
    try {
      setProject(await api(`/api/organizations/${orgId}/projects/${id}`));
      setTab("projects");
    } catch (e) {
      setErr(e.message);
    }
  }

  function pickOrg(id) {
    setOrg(id);
    setOrgId(id);
  }

  function pickTheme(t) {
    setTheme(t);
    setThemeState(t);
  }

  const orgName = access?.organizations?.find((o) => o.organizationId === orgId)?.organizationSlug ?? "";
  const inProject = !!project;
  const sendCmd = (name) => setCmd({ name, n: Date.now() });

  function goTo(t) {
    setProject(null);
    setTab(t);
  }

  return (
    <>
      <nav className="nav" aria-label="Menu principal">
        <span className="brand"><span className="logo" /><span className="t">Projet</span></span>
        {orgId && (
          <div className="nav-scroll">
            <button className={`nl ${project || tab === "projects" ? "on" : ""}`} onClick={() => goTo("projects")}>Projets</button>
            <button className={`nl ${!project && tab === "mine" ? "on" : ""}`} onClick={() => goTo("mine")}>Tâches</button>
            <NavMenu
              label="Reporting"
              active={!project && (tab === "dashboard" || tab === "activity")}
              items={[
                { label: "Tableau de bord", icon: "chart", onClick: () => goTo("dashboard") },
                { label: "Activité", icon: "pulse", onClick: () => goTo("activity") },
              ]}
            />
            <NavMenu
              label="Configuration"
              items={[
                { label: "Paramètres du projet", icon: "gear", disabled: !inProject, hint: inProject ? "" : "Ouvrez d'abord un projet", onClick: () => sendCmd("settings") },
                { label: "Jalons", icon: "flag", disabled: !inProject, hint: inProject ? "" : "Ouvrez d'abord un projet", onClick: () => sendCmd("milestones") },
              ]}
            />
          </div>
        )}
        <div className="r">
          {orgName && access?.organizations?.length === 1 && <span className="org-name">{orgName}</span>}
          {access?.organizations?.length > 1 && (
            <select aria-label="Organisation" value={orgId} onChange={(e) => pickOrg(e.target.value)}>
              {access.organizations.map((o) => (
                <option key={o.organizationId} value={o.organizationId}>{o.organizationSlug ?? o.organizationId}</option>
              ))}
            </select>
          )}
          <Menu
            label={`Thème : ${THEMES[theme]}`}
            trigger={<Icon name={THEME_ICON[theme]} size={18} />}
            items={Object.entries(THEMES).map(([v, l]) => ({ label: l, icon: THEME_ICON[v], active: v === theme, onClick: () => pickTheme(v) }))}
          />
          {orgName && <span className="org-av" title={orgName} aria-hidden="true">{orgName[0].toUpperCase()}</span>}
          <a className="back" href={nexisHome}><Icon name="back" size={15} /><span className="bk">NEXIS</span></a>
        </div>
      </nav>
      <main className="page">
        {err && <p className="error">{err}</p>}
        {orgId && project ? (
          <Tasks key={project.id} orgId={orgId} project={project} command={cmd} {...people} onBack={() => setProject(null)} onNav={goTo} />
        ) : orgId && tab === "dashboard" ? (
          <div className="content"><Dashboard key={orgId} orgId={orgId} members={people.members} onShowMine={() => setTab("mine")} /></div>
        ) : orgId && tab === "activity" ? (
          <div className="content"><Activity key={orgId} orgId={orgId} members={people.members} onOpenProject={openProject} /></div>
        ) : orgId && tab === "mine" ? (
          <div className="content"><MyTasks key={orgId} orgId={orgId} onOpenProject={openProject} /></div>
        ) : orgId ? (
          <Projects key={orgId} orgId={orgId} onOpen={setProject} />
        ) : (
          access && <p className="muted content">Aucune organisation active pour ce compte.</p>
        )}
      </main>
    </>
  );
}
