import { useEffect, useState } from "react";
import { api } from "./api.js";
import { getOrg, nexisHome, setOrg } from "./session.js";
import Tasks from "./Tasks.jsx";
import MyTasks from "./MyTasks.jsx";
import Dashboard from "./Dashboard.jsx";
import Activity from "./Activity.jsx";
import { Icon, Menu, NavMenu } from "./ui.jsx";
import { THEMES, getTheme, setTheme } from "./theme.js";
import Projects from "./ProjectsHome.jsx";
import { PageSkeleton } from "./Skeleton.jsx";

const THEME_ICON = { light: "sun", dark: "moon", auto: "monitor" };

export default function App() {
  const [access, setAccess] = useState(null);
  const [orgId, setOrgId] = useState("");
  const [project, setProject] = useState(null);
  const [tab, setTab] = useState("projects");
  const [people, setPeople] = useState({ members: [], canAssign: false, ready: false });
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
    setPeople((p) => ({ ...p, ready: false }));
    api(`/api/organizations/${orgId}/members`).then((p) => setPeople({ ...p, ready: true })).catch(() => setPeople({ members: [], canAssign: false, ready: true }));
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
        <span className="brand"><span className="logo" /><span className="t">NEXIS Projets</span></span>
        {orgId && (
          <div className="nav-scroll">
            <button className={`nl ${project || tab === "projects" ? "on" : ""}`} onClick={() => goTo("projects")}>Projets</button>
            <button className={`nl ${!project && tab === "mine" ? "on" : ""}`} onClick={() => goTo("mine")}>Mes tâches</button>
            <button className={`nl ${!project && tab === "dashboard" ? "on" : ""}`} onClick={() => goTo("dashboard")}>Tableau de bord</button>
            <button className={`nl ${!project && tab === "activity" ? "on" : ""}`} onClick={() => goTo("activity")}>Activité</button>
            {inProject && (
              <NavMenu
                label="Configuration"
                items={[
                  { label: "Paramètres du projet", icon: "gear", onClick: () => sendCmd("settings") },
                  { label: "Jalons", icon: "flag", onClick: () => sendCmd("milestones") },
                ]}
              />
            )}
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
          <div className="content"><Dashboard key={orgId} orgId={orgId} members={people.members} ready={people.ready} onShowMine={() => setTab("mine")} /></div>
        ) : orgId && tab === "activity" ? (
          <div className="content"><Activity key={orgId} orgId={orgId} members={people.members} ready={people.ready} onOpenProject={openProject} /></div>
        ) : orgId && tab === "mine" ? (
          <div className="content"><MyTasks key={orgId} orgId={orgId} onOpenProject={openProject} /></div>
        ) : orgId ? (
          <Projects key={orgId} orgId={orgId} members={people.members} ready={people.ready} onOpen={setProject} />
        ) : !access && !err ? (
          <PageSkeleton />
        ) : (
          access && <p className="muted content">Aucune organisation active pour ce compte.</p>
        )}
      </main>
    </>
  );
}
