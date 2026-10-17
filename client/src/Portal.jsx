import { useEffect, useMemo, useState } from "react";
import { labelColor, PRIORITY, PROJECT_STATUS, taskColor, TASK_STATUS, todayISO } from "./labels.js";
import logo from "./assets/logo.png";
import "./portal.css";

const BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const ORDER = ["in_progress", "todo", "done"];
const day = (iso) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "");

/** « 12 août » (l'année n'apparaît que si elle diffère de l'année en cours). */
const short = (iso) => {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", ...(d.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}) });
};
const initials = (email) => (email || "?").split("@")[0].split(/[._-]+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join("") || "?";
const FILTERS = [["all", "Toutes"], ["late", "En retard"], ["ms", "Jalons"]];
const RING = 2 * Math.PI * 48;

/** Ligne de tâche (ou de sous-tâche). */
function Row({ t, sub, today }) {
  const late = t.status !== "done" && t.dueDate && t.dueDate < today;
  return (
    <li className={`pt-task ${sub ? "sub" : ""}`}>
      <i className="pt-dot" style={{ background: taskColor(t) }} aria-hidden="true" />
      <span className="pt-title">{t.isMilestone && <span className="pt-ms" title="Jalon" aria-label="Jalon">◆ </span>}{t.title}</span>
      {(t.priority === "high" || t.priority === "urgent") && t.status !== "done" && <span className={`pt-pr ${t.priority}`}>{PRIORITY[t.priority]}</span>}
      {t.dueDate && <span className={`pt-due ${late ? "late" : ""}`}><b>{short(t.dueDate)}</b>{late && <span>En retard</span>}</span>}
    </li>
  );
}

/** Jeton d'invitation : dans le fragment « #/p/<jeton> » (jamais envoyé à un serveur). */
export const portalToken = () => {
  const m = /^#\/p\/([^/?]+)$/.exec(window.location.hash);
  return m ? m[1] : null;
};

/**
 * Page d'un invité externe : projet en LECTURE SEULE. Aucune session NEXIS, aucun appel à l'API de
 * l'organisation : un seul endpoint, /api/portal, avec le jeton dans l'en-tête X-Portal-Token.
 */
export default function Portal({ token }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [folded, setFolded] = useState({}); // id de groupe → true (replié) / false (déplié) ; absent = valeur par défaut

  useEffect(() => {
    document.title = "Projet partagé · Projets";
    // Page privée : pas d'indexation, pas de Referer vers d'autres sites.
    for (const [name, content] of [["robots", "noindex, nofollow"], ["referrer", "no-referrer"]]) {
      const m = document.createElement("meta");
      m.name = name;
      m.content = content;
      document.head.appendChild(m);
    }
    if (!TOKEN_RE.test(token)) return setError({ icon: "⏳", title: "Ce lien n’est plus valide", text: "Ce lien n’est pas valide. Demandez une nouvelle invitation à la personne qui vous l’a envoyée." });
    fetch(`${BASE}/api/portal`, { headers: { "X-Portal-Token": token } })
      .then(async (res) => {
        if (res.ok) return setData(await res.json());
        setError(res.status === 429
          ? { icon: "⚠", title: "Trop de tentatives", text: "Réessayez dans quelques minutes." }
          : { icon: "⏳", title: "Ce lien n’est plus valide", text: "Il a peut-être expiré ou été révoqué. Demandez une nouvelle invitation à la personne qui vous l’a envoyée." });
      })
      .catch(() => setError({ icon: "⚠", title: "Serveur injoignable", text: "Impossible de joindre le serveur. Réessayez plus tard." }));
  }, [token]);

  const groups = useMemo(() => {
    const tasks = data?.tasks ?? [];
    const subs = new Map();
    for (const t of tasks) if (t.parentId) subs.set(t.parentId, [...(subs.get(t.parentId) ?? []), t]);
    const roots = tasks.filter((t) => !t.parentId || !tasks.some((p) => p.id === t.parentId));
    const items = (pred) => roots.filter(pred).map((t) => ({ ...t, subs: subs.get(t.id) ?? [] }));
    // Étapes du projet (ordre du projet) ; à défaut, les catégories.
    if (data?.stages?.length) {
      return data.stages
        .map((st) => ({ id: st.id, label: st.name, category: st.category, color: taskColor({ stageColor: st.color, status: st.category }), items: items((t) => t.stageId === st.id) }))
        .filter((g) => g.items.length > 0);
    }
    return ORDER.map((s) => ({ id: s, label: TASK_STATUS[s], category: s, color: taskColor({ status: s }), items: items((t) => t.status === s) })).filter((g) => g.items.length > 0);
  }, [data]);

  if (error) {
    return (
      <main className="pt pt-errwrap">
        <div className="pt-box pt-center" role="alert">
          <div className="pt-erric" aria-hidden="true">{error.icon}</div>
          <h1>{error.title}</h1>
          <p>{error.text}</p>
        </div>
      </main>
    );
  }
  if (!data) return <main className="pt"><p className="pt-center muted" role="status">Chargement…</p></main>;

  const { project, stats, guest } = data;
  const pct = stats.total ? Math.round((stats.done / stats.total) * 100) : 0;
  const today = todayISO();
  const late = (t) => t.status !== "done" && !!t.dueDate && t.dueDate < today;
  const inProgress = data.tasks.filter((t) => t.status === "in_progress").length;
  const milestones = data.tasks.filter((t) => t.isMilestone).sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));

  // Recherche + filtre : une tâche mère reste affichée si l'une de ses sous-tâches correspond.
  const q = query.trim().toLowerCase();
  const active = q !== "" || filter !== "all";
  const match = (t) => (!q || t.title.toLowerCase().includes(q)) && (filter === "all" || (filter === "late" ? late(t) : t.isMilestone));
  const visible = groups
    .map((g) => ({
      ...g,
      items: g.items
        .map((t) => ({ ...t, subs: active ? t.subs.filter(match) : t.subs, self: match(t) }))
        .filter((t) => t.self || t.subs.length > 0),
    }))
    .filter((g) => g.items.length > 0);
  const isFolded = (g) => !active && (folded[g.id] ?? g.category === "done");

  const stClass = ["active", "planned", "on_hold", "done"].includes(project.status) ? project.status : "planned";

  return (
    <>
      <header className="pt-bar">
        <span className="pt-brandw"><img className="pt-logo" src={logo} alt="" width="44" height="34" /><span className="pt-brand">Projets</span></span>
        <div className="pt-right">
          <span className="pt-ro">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
            Lecture seule
          </span>
          <span className="pt-me" title={guest.email}>{initials(guest.email)}</span>
        </div>
      </header>

      <main className="pt">
        <section className="pt-head">
          <div className="pt-headtx">
            <span className="pt-st" style={{ background: `var(--pst-${stClass}-bg)`, color: `var(--pst-${stClass}-fg)` }}>{PROJECT_STATUS[project.status] ?? project.status}</span>
            <h1>{project.name}</h1>
            {project.description && <p className="pt-desc">{project.description}</p>}
          </div>
          <div className="pt-ring" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Avancement du projet">
            <svg width="120" height="120" viewBox="0 0 112 112" aria-hidden="true">
              <circle className="t" cx="56" cy="56" r="48" />
              <circle className="a" cx="56" cy="56" r="48" strokeDasharray={RING} strokeDashoffset={RING * (1 - pct / 100)} />
            </svg>
            <b>{pct} %</b>
          </div>
        </section>

        <div className="pt-kpis">
          <div className="pt-kpi"><strong>{stats.done}</strong><span>Terminée{stats.done > 1 ? "s" : ""}</span></div>
          <div className="pt-kpi"><strong>{inProgress}</strong><span>En cours</span></div>
          <div className={`pt-kpi ${stats.late > 0 ? "bad" : ""}`}><strong>{stats.late}</strong><span>En retard</span></div>
          <div className="pt-kpi"><strong>{project.dueDate ? short(project.dueDate) : "—"}</strong><span>Échéance du projet</span></div>
        </div>

        {milestones.length > 0 && (
          <section className="pt-box pt-msc">
            <h2>Jalons</h2>
            <ol className="pt-line">
              {milestones.map((t) => (
                <li key={t.id} className={`pt-m ${t.status === "done" ? "d" : ""}`}>
                  <i aria-hidden="true" />
                  {t.title}
                  <small>{t.dueDate ? short(t.dueDate) : "Sans date"}{t.status === "done" ? " · terminé" : ""}</small>
                </li>
              ))}
            </ol>
          </section>
        )}

        {data.tasks.length > 0 && (
          <div className="pt-tools">
            <div className="pt-seg" role="group" aria-label="Filtrer les tâches">
              {FILTERS.map(([k, label]) => (
                <button key={k} type="button" className={filter === k ? "on" : ""} aria-pressed={filter === k} onClick={() => setFilter(k)}>{label}</button>
              ))}
            </div>
            <label className="pt-search">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher une tâche…" aria-label="Rechercher une tâche" />
            </label>
          </div>
        )}

        {visible.map((g) => {
          const closed = isFolded(g);
          return (
            <section key={g.id} className={`pt-box pt-grp ${closed ? "c" : ""}`}>
              <button type="button" className="pt-gh" aria-expanded={!closed} onClick={() => setFolded((f) => ({ ...f, [g.id]: !closed }))}>
                <i className="pt-sw" style={{ background: g.color }} aria-hidden="true" />
                <h2>{g.label}</h2>
                <span className="pt-count">{g.items.length}</span>
                <span className="pt-sp" />
                <svg className="pt-chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
              </button>
              {!closed && (
                <ul className="pt-list">
                  {g.items.map((t) => (
                    <li key={t.id} className="pt-group">
                      <ul className="pt-list"><Row t={t} today={today} />{t.subs.map((s) => <Row key={s.id} t={s} sub today={today} />)}</ul>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
        {data.tasks.length === 0 && <section className="pt-box pt-empty"><b>Aucune tâche pour le moment</b></section>}
        {data.tasks.length > 0 && visible.length === 0 && <section className="pt-box pt-empty"><b>Aucune tâche ne correspond</b>Modifiez la recherche ou le filtre.</section>}

        <footer className="pt-foot">Invitation envoyée à {guest.email}. Ce lien est personnel : ne le transférez pas.</footer>
      </main>
    </>
  );
}
