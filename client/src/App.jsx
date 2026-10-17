import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { getOrg, setOrg } from "./session.js";
import { takeDeepLink } from "./deepLink.js";
import Tasks from "./Tasks.jsx";
import MyTasks from "./MyTasks.jsx";
import Dashboard from "./Dashboard.jsx";
import Activity from "./Activity.jsx";
import { EmptyState, ErrorState, Icon, Menu, NavMenu } from "./ui.jsx";
import { THEMES, getTheme, setTheme } from "./theme.js";
import { LANGS, getLang, setLang, t } from "./i18n.js";
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
  const [lang, setLangState] = useState(getLang);
  const [openTaskId, setOpenTaskId] = useState(null); // tâche à ouvrir dès le chargement du projet (recherche globale)
  const [retryFn, setRetryFn] = useState(null); // relance de l'action qui a échoué (ouverture d'un projet)
  const deepRef = useRef(takeDeepLink()); // lien direct vers une tâche reçu par e-mail, consommé une fois
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
          const want = deepRef.current?.orgId;
          if (want && !ids.includes(want)) {
            deepRef.current = null;
            setErr("Ce lien mène à une organisation à laquelle votre compte n’a pas accès.");
          } else if (want) setOrg(want);
          setOrgId((cur) => (want ? want : cur && ids.includes(cur) ? cur : ids.includes(saved) ? saved : ids[0] ?? ""));
        })
        .catch((e) => setErr(e.message)),
    [],
  );
  useEffect(() => { loadMe(); }, [loadMe]);

  // Membres affectables de l'organisation active. `reason` explique une liste vide :
  // "forbidden" (rôle sans users.read) ou "unavailable" (NEXIS Identity injoignable). `quiet` : sans écran de chargement (Réessayer).
  const loadPeople = useCallback(
    (quiet = false) => {
      if (!orgId) return Promise.resolve();
      if (!quiet) setPeople((p) => ({ ...p, ready: false }));
      return api(`/api/organizations/${orgId}/members`)
        .then((p) => setPeople({ reason: null, ...p, ready: true }))
        .catch(() => setPeople({ members: [], canAssign: false, reason: "unavailable", ready: true }));
    },
    [orgId],
  );
  useEffect(() => {
    if (!orgId) return;
    setProject(null);
    loadPeople();
  }, [orgId, loadPeople]);

  // Lien direct : on retrouve le projet de la tâche, puis on l'ouvre sur cette tâche.
  useEffect(() => {
    const d = deepRef.current;
    if (!d || !orgId || orgId !== d.orgId) return;
    deepRef.current = null;
    api(`/api/organizations/${orgId}/tasks/${d.taskId}`)
      .then((t) => openProject(t.projectId, t.id))
      .catch(() => setErr("Cette tâche est introuvable, ou vous n’y avez plus accès."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  function pickTheme(th) {
    setTheme(th);
    setThemeState(th);
  }

  function pickLang(code) {
    setLang(code);
    setLangState(code);
  }

  const tr = (key, vars) => t(lang, key, vars);

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
      <nav className={`nav ${orgId ? "" : "nav-empty"}`} aria-label={tr("nav.main")}>
        <span className="brand"><img className="logo" src={logo} alt="" width="44" height="34" /><span className="t">Projets</span></span>
        {loading && (
          <div className="nav-scroll nav-ph" aria-hidden="true">
            {["projects", "mine", "dashboard", "activity"].map((k) => <button key={k} className="nl" tabIndex={-1}>{tr(`nav.${k}`)}</button>)}
          </div>
        )}
        {orgId && (
          <div className="nav-scroll nav-in">
            <button className={`nl ${project || tab === "projects" ? "on" : ""}`} onClick={() => goTo("projects")}>{tr("nav.projects")}</button>
            <button className={`nl ${!project && tab === "mine" ? "on" : ""}`} onClick={() => goTo("mine")}>{tr("nav.mine")}</button>
            <button className={`nl ${!project && tab === "dashboard" ? "on" : ""}`} onClick={() => goTo("dashboard")}>{tr("nav.dashboard")}</button>
            <button className={`nl ${!project && tab === "activity" ? "on" : ""}`} onClick={() => goTo("activity")}>{tr("nav.activity")}</button>
            {inProject && (
              <NavMenu
                label={tr("nav.config")}
                items={[
                  { label: tr("nav.projectSettings"), icon: "gear", onClick: () => sendCmd("settings") },
                  ...(featureOn(project, "milestones") ? [{ label: tr("nav.milestones"), icon: "flag", onClick: () => sendCmd("milestones") }] : []),
                ]}
              />
            )}
          </div>
        )}
        <div className="r">
          {orgName && access?.organizations?.length === 1 && <span className="org-name">{orgName}</span>}
          {access?.organizations?.length > 1 && (
            <select aria-label={tr("nav.organization")} value={orgId} onChange={(e) => pickOrg(e.target.value)}>
              {access.organizations.map((o) => (
                <option key={o.organizationId} value={o.organizationId}>{o.organizationSlug ?? o.organizationId}</option>
              ))}
            </select>
          )}
          <select className="lang-select" aria-label={tr("nav.language")} title={tr("nav.language")} value={lang} onChange={(e) => pickLang(e.target.value)}>
            {LANGS.map((l) => <option key={l.code} value={l.code}>{l.code.toUpperCase()}</option>)}
          </select>
          {loading && <span className="pop nav-ph" aria-hidden="true"><span className="icon-btn" /></span>}
          {orgId && <span className="nav-in"><GlobalSearch key={orgId} orgId={orgId} onOpen={openProject} /></span>}
          {orgId && <span className="nav-in"><NotificationBell key={orgId} orgId={orgId} onOpen={openProject} /></span>}
          <Menu
            label={tr("theme.label", { x: tr(`theme.${theme}`) })}
            trigger={<Icon name={THEME_ICON[theme]} size={18} />}
            items={Object.entries(THEMES).map(([v, l]) => ({ label: tr(`theme.${v}`), icon: THEME_ICON[v], active: v === theme, onClick: () => pickTheme(v) }))}
          />
          {loading && <span className="org-av nav-ph" aria-hidden="true" />}
          {orgName && <span className="org-av nav-in" title={orgName} aria-hidden="true">{orgName[0].toUpperCase()}</span>}
        </div>
      </nav>
      <main className="page">
        {err && (orgId ? <div className="content"><ErrorState compact message={err} onRetry={retryFn ?? loadMe} /></div> : <ErrorState message={err} onRetry={loadMe} />)}
        {orgId && project ? (
          <Tasks key={project.id} orgId={orgId} project={project} onProjectChange={setProject} openTaskId={openTaskId} command={cmd} {...people} onReloadPeople={() => loadPeople(true)} onBack={() => setProject(null)} onNav={goTo} />
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
