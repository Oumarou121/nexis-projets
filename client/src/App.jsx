import { useCallback, useEffect, useState } from "react";
import { api } from "./api.js";
import { getOrg, setOrg } from "./session.js";
import Tasks from "./Tasks.jsx";
import MyTasks from "./MyTasks.jsx";
import Dashboard from "./Dashboard.jsx";
import Activity from "./Activity.jsx";
import { EmptyState, ErrorState, Icon, Menu, NavMenu } from "./ui.jsx";
import { THEMES, getTheme, setTheme } from "./theme.js";
import Projects from "./ProjectsHome.jsx";
import { PageSkeleton } from "./Skeleton.jsx";
import logo from "./assets/logo.png";
import GlobalSearch from "./GlobalSearch.jsx";
import NotificationBell from "./NotificationBell.jsx";
import { PermsContext, featureOn } from "./perms.js";

const THEME_ICON = { light: "sun", dark: "moon", auto: "monitor" };

export default function App() {
  const [access, setAccess] = useState(null);
  const [orgId, setOrgId] = useState("");
  const [project, setProject] = useState(null);
  const [tab, setTab] = useState("projects");
  const [people, setPeople] = useState({ members: [], canAssign: false, ready: false });
  const [err, setErr] = useState("");
  const [theme, setThemeState] = useState(getTheme);
  const [openTaskId, setOpenTaskId] = useState(null); // tâche à ouvrir dès le chargement du projet (recherche globale)
  const [retryFn, setRetryFn] = useState(null); // relance de l'action qui a échoué (ouverture d'un projet)
  const [cmd, setCmd] = useState(null); // commande envoyée au projet ouvert (menu Configuration)

  // Charge (ou recharge, sans quitter la page) les accès du compte.
  const loadMe = useCallback(
    () =>
      api("/api/me")
        .then((a) => {
          setAccess(a);
          setErr("");
          const ids = (a.organizations ?? []).map((o) => o.organizationId);
          const saved = getOrg();
          setOrgId((cur) => (cur && ids.includes(cur) ? cur : ids.includes(saved) ? saved : ids[0] ?? ""));
        })
        .catch((e) => setErr(e.message)),
    [],
  );
  useEffect(() => { loadMe(); }, [loadMe]);

  // Membres affectables de l'organisation active (vide si NEXIS refuse la liste).
  useEffect(() => {
    if (!orgId) return;
    setProject(null);
    setPeople((p) => ({ ...p, ready: false }));
    api(`/api/organizations/${orgId}/members`).then((p) => setPeople({ ...p, ready: true })).catch(() => setPeople({ members: [], canAssign: false, ready: true }));
  }, [orgId]);

  async function openProject(id, taskId = null) {
    try {
      const p = await api(`/api/organizations/${orgId}/projects/${id}`);
      setErr("");
      setRetryFn(null);
      setOpenTaskId(taskId);
      setProject(p);
      setTab("projects");
    } catch (e) {
      setErr(e.message);
      setRetryFn(() => () => openProject(id, taskId));
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
  const orgAccess = access?.organizations?.find((o) => o.organizationId === orgId);
  const has = (p) => !!access?.platformAdmin || !!orgAccess?.permissions?.includes(p);
  const perms = { canCreate: has("projects.create"), canEdit: has("projects.update"), canDelete: has("projects.delete") };
  const inProject = !!project;
  // Tant que NEXIS n'a pas répondu, la barre garde sa forme définitive (onglets, recherche, avatar
  // invisibles mais en place) : rien ne se décale quand ils apparaissent.
  const loading = !access && !err;
  const sendCmd = (name) => setCmd({ name, n: Date.now() });

  function goTo(t) {
    setProject(null);
    setOpenTaskId(null);
    setTab(t);
  }

  return (
    <PermsContext.Provider value={perms}>
      <nav className={`nav ${orgId ? "" : "nav-empty"}`} aria-label="Menu principal">
        <span className="brand"><img className="logo" src={logo} alt="" width="44" height="34" /><span className="t">NEXIS Projets</span></span>
        {loading && (
          <div className="nav-scroll nav-ph" aria-hidden="true">
            {["Projets", "Mes tâches", "Tableau de bord", "Activité"].map((l) => <button key={l} className="nl" tabIndex={-1}>{l}</button>)}
          </div>
        )}
        {orgId && (
          <div className="nav-scroll nav-in">
            <button className={`nl ${project || tab === "projects" ? "on" : ""}`} onClick={() => goTo("projects")}>Projets</button>
            <button className={`nl ${!project && tab === "mine" ? "on" : ""}`} onClick={() => goTo("mine")}>Mes tâches</button>
            <button className={`nl ${!project && tab === "dashboard" ? "on" : ""}`} onClick={() => goTo("dashboard")}>Tableau de bord</button>
            <button className={`nl ${!project && tab === "activity" ? "on" : ""}`} onClick={() => goTo("activity")}>Activité</button>
            {inProject && (
              <NavMenu
                label="Configuration"
                items={[
                  { label: "Paramètres du projet", icon: "gear", onClick: () => sendCmd("settings") },
                  ...(featureOn(project, "milestones") ? [{ label: "Jalons", icon: "flag", onClick: () => sendCmd("milestones") }] : []),
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
          {loading && <span className="pop nav-ph" aria-hidden="true"><span className="icon-btn" /></span>}
          {orgId && <span className="nav-in"><GlobalSearch key={orgId} orgId={orgId} onOpen={openProject} /></span>}
          {orgId && <span className="nav-in"><NotificationBell key={orgId} orgId={orgId} onOpen={openProject} /></span>}
          <Menu
            label={`Thème : ${THEMES[theme]}`}
            trigger={<Icon name={THEME_ICON[theme]} size={18} />}
            items={Object.entries(THEMES).map(([v, l]) => ({ label: l, icon: THEME_ICON[v], active: v === theme, onClick: () => pickTheme(v) }))}
          />
          {loading && <span className="org-av nav-ph" aria-hidden="true" />}
          {orgName && <span className="org-av nav-in" title={orgName} aria-hidden="true">{orgName[0].toUpperCase()}</span>}
        </div>
      </nav>
      <main className="page">
        {err && (orgId ? <div className="content"><ErrorState compact message={err} onRetry={retryFn ?? loadMe} /></div> : <ErrorState message={err} onRetry={loadMe} />)}
        {orgId && project ? (
          <Tasks key={project.id} orgId={orgId} project={project} onProjectChange={setProject} openTaskId={openTaskId} command={cmd} {...people} onBack={() => setProject(null)} onNav={goTo} />
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
          access && <EmptyState title="Aucune organisation active" text="Ce compte n’est rattaché à aucune organisation active dans NEXIS. Demandez à un administrateur de vous y ajouter, puis actualisez." onAction={loadMe} />
        )}
      </main>
    </PermsContext.Provider>
  );
}
