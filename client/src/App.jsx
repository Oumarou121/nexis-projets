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
import { watchNexisPrefs } from "./nexisPrefs.js";
import Projects from "./ProjectsHome.jsx";
import { PageSkeleton } from "./Skeleton.jsx";
import logo from "./assets/logo.png";
import logoDark from "./assets/logo-dark.png";
import GlobalSearch from "./GlobalSearch.jsx";
import NotificationBell from "./NotificationBell.jsx";
import { PermsContext, featureOn } from "./perms.js";

const THEME_ICON = { light: "sun", dark: "moon", auto: "monitor" };

const NAV_ITEMS = [
  { k: "projects", icon: "nvKanban" },
  { k: "mine", icon: "nvChecklist" },
  { k: "dashboard", icon: "nvDashboard" },
  { k: "activity", icon: "nvTimeline" },
];

const orgLabel = (o) => (o?.organizationName || o?.name || o?.organizationSlug || "").trim();

// Pastille de l'organisation : son logo s'il existe et se charge, sinon l'initiale du nom.
function OrgAvatar({ name, logo }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className="hd2-av nav-in" title={name} aria-hidden="true" style={logo && !broken ? { background: "transparent", overflow: "hidden" } : undefined}>
      {logo && !broken ? <img src={logo} alt="" width="32" height="32" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={() => setBroken(true)} /> : name[0].toUpperCase()}
    </span>
  );
}

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

  // Thème ou langue changés dans NEXIS Identity ou Documents pendant que cet onglet était en arrière-plan.
  useEffect(
    () =>
      watchNexisPrefs((p) => {
        if (p.theme && THEMES[p.theme]) {
          document.documentElement.dataset.theme = p.theme;
          setThemeState(p.theme);
        }
        if (p.lang && LANGS.some((l) => l.code === p.lang)) {
          document.documentElement.lang = p.lang;
          setLangState(p.lang);
        }
      }),
    [],
  );

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

  const orgAccess = access?.organizations?.find((o) => o.organizationId === orgId);
  // Nom de l'organisation (le slug ne sert que de repli) ; sans aucun nom, « nexis » comme NEXIS Documents.
  const orgName = orgLabel(orgAccess) || (orgId ? "nexis" : "");
  const orgLogo = orgAccess?.organizationLogoUrl || "";
  const has = (p) => !!orgAccess?.permissions?.includes(p);
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

  // Onglets de navigation (header sur grand écran, barre basse sous 900 px) : mêmes entrées, même état actif.
  const navOn = (k) => (k === "projects" ? !!project || tab === "projects" : !project && tab === k);
  const cfgItems = [
    { label: tr("nav.projectSettings"), icon: "gear", onClick: () => sendCmd("settings") },
    ...(project && featureOn(project, "milestones") ? [{ label: tr("nav.milestones"), icon: "flag", onClick: () => sendCmd("milestones") }] : []),
  ];

  return (
    <PermsContext.Provider value={perms}>
      <header className="hd2">
        <span className="hd2-brand"><img className="hd2-logo lg-l" src={logo} alt="" width="44" height="32" /><img className="hd2-logo lg-d" src={logoDark} alt="" width="44" height="32" /><span className="hd2-bt"><small>NEXIS</small><b>Projets</b></span></span>
        {loading && (
          <div className="hd2-nav nav-ph" aria-hidden="true">
            {NAV_ITEMS.map(({ k }) => <button key={k} className="hd2-tab" tabIndex={-1}><span>{tr(`nav.${k}`)}</span></button>)}
          </div>
        )}
        {orgId && (
          <nav className="hd2-nav nav-in" aria-label={tr("nav.main")}>
            {NAV_ITEMS.map(({ k, icon }) => (
              <button key={k} className={`hd2-tab ${navOn(k) ? "on" : ""}`} aria-current={navOn(k) ? "page" : undefined} onClick={() => goTo(k)}>
                <Icon name={icon} size={16} /><span>{tr(`nav.${k}`)}</span>
              </button>
            ))}
            {inProject && <NavMenu className="hd2-tab" icon="nvAdjust" label={tr("nav.config")} items={cfgItems} />}
          </nav>
        )}
        <div className="hd2-tools">
          {orgId && <span className="nav-in"><GlobalSearch key={orgId} orgId={orgId} onOpen={openProject} /></span>}
          <div className="hd2-clu">
            {orgId && <span className="nav-in"><NotificationBell key={orgId} orgId={orgId} onOpen={openProject} /></span>}
            <Menu
              label={tr("theme.label", { x: tr(`theme.${theme}`) })}
              trigger={<Icon name={THEME_ICON[theme]} size={18} />}
              items={Object.entries(THEMES).map(([v, l]) => ({ label: tr(`theme.${v}`), icon: THEME_ICON[v], active: v === theme, onClick: () => pickTheme(v) }))}
            />
            <select className="lang-select" aria-label={tr("nav.language")} title={tr("nav.language")} value={lang} onChange={(e) => pickLang(e.target.value)}>
              {LANGS.map((l) => <option key={l.code} value={l.code}>{l.code.toUpperCase()}</option>)}
            </select>
          </div>
          <span className="hd2-sep" aria-hidden="true" />
          <div className="hd2-org">
            {loading && <span className="hd2-av nav-ph" aria-hidden="true" />}
            {orgName && <OrgAvatar key={orgLogo || orgName} name={orgName} logo={orgLogo} />}
            {orgName && access?.organizations?.length === 1 && <span className="hd2-nm">{orgName}</span>}
            {access?.organizations?.length > 1 && (
              <select aria-label={tr("nav.organization")} value={orgId} onChange={(e) => pickOrg(e.target.value)}>
                {access.organizations.map((o) => (
                  <option key={o.organizationId} value={o.organizationId}>{orgLabel(o) || o.organizationId}</option>
                ))}
              </select>
            )}
          </div>
        </div>
      </header>
      {orgId && (
        <nav className="hd2-tabbar" aria-label={tr("nav.main")}>
          {NAV_ITEMS.map(({ k, icon }) => (
            <button key={k} className={`hd2-tb ${navOn(k) ? "on" : ""}`} aria-current={navOn(k) ? "page" : undefined} onClick={() => goTo(k)}>
              <Icon name={icon} size={22} /><span className="nl-t">{tr(`nav.${k}`)}</span>
            </button>
          ))}
          {inProject && <NavMenu className="hd2-tb" wrapClass="hd2-tbw" icon="nvAdjust" up label={tr("nav.config")} items={cfgItems} />}
        </nav>
      )}
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
