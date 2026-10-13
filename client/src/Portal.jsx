import { useEffect, useMemo, useState } from "react";
import { PRIORITY, PROJECT_STATUS, taskColor, TASK_STATUS, todayISO } from "./labels.js";
import "./portal.css";

const BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const ORDER = ["in_progress", "todo", "done"];
const day = (iso) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "");

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

  useEffect(() => {
    document.title = "Projet partagé · NEXIS Projets";
    // Page privée : pas d'indexation, pas de Referer vers d'autres sites.
    for (const [name, content] of [["robots", "noindex, nofollow"], ["referrer", "no-referrer"]]) {
      const m = document.createElement("meta");
      m.name = name;
      m.content = content;
      document.head.appendChild(m);
    }
    if (!TOKEN_RE.test(token)) return setError("Ce lien n’est pas valide.");
    fetch(`${BASE}/api/portal`, { headers: { "X-Portal-Token": token } })
      .then(async (res) => {
        if (res.ok) return setData(await res.json());
        setError(res.status === 429 ? "Trop de tentatives. Réessayez dans quelques minutes." : "Ce lien n’est plus valide : il a peut-être expiré ou été révoqué. Demandez une nouvelle invitation à la personne qui vous l’a envoyée.");
      })
      .catch(() => setError("Impossible de joindre le serveur. Réessayez plus tard."));
  }, [token]);

  const groups = useMemo(() => {
    const tasks = data?.tasks ?? [];
    const subs = new Map();
    for (const t of tasks) if (t.parentId) subs.set(t.parentId, [...(subs.get(t.parentId) ?? []), t]);
    const roots = tasks.filter((t) => !t.parentId || !tasks.some((p) => p.id === t.parentId));
    // Étapes du projet (ordre du projet) ; à défaut, les catégories.
    if (data?.stages?.length) {
      return data.stages
        .map((st) => ({ status: st.id, label: st.name, items: roots.filter((t) => t.stageId === st.id).map((t) => ({ ...t, subs: subs.get(t.id) ?? [] })) }))
        .filter((g) => g.items.length > 0);
    }
    return ORDER.map((s) => ({ status: s, items: roots.filter((t) => t.status === s).map((t) => ({ ...t, subs: subs.get(t.id) ?? [] })) })).filter((g) => g.items.length > 0);
  }, [data]);

  if (error) {
    return (
      <main className="pt">
        <div className="pt-card pt-center" role="alert"><h1>Lien indisponible</h1><p>{error}</p></div>
      </main>
    );
  }
  if (!data) return <main className="pt"><p className="pt-center muted" role="status">Chargement…</p></main>;

  const { project, stats } = data;
  const pct = stats.total ? Math.round((stats.done / stats.total) * 100) : 0;
  const today = todayISO();
  const late = (t) => t.status !== "done" && t.dueDate && t.dueDate < today;
  const milestones = data.tasks.filter((t) => t.isMilestone);

  const Row = ({ t, sub }) => (
    <li className={`pt-task ${sub ? "sub" : ""}`}>
      <i className="pt-dot" style={{ background: taskColor(t) }} aria-hidden="true" />
      <span className="pt-title">{t.isMilestone && <span className="pt-ms" title="Jalon" aria-label="Jalon">◆ </span>}{t.title}</span>
      {(t.priority === "high" || t.priority === "urgent") && t.status !== "done" && <span className="pt-chip warn">{PRIORITY[t.priority]}</span>}
      {t.dueDate && <span className={`pt-due ${late(t) ? "late" : ""}`}>{late(t) ? "En retard · " : ""}{day(t.dueDate)}</span>}
    </li>
  );

  return (
    <main className="pt">
      <header className="pt-head">
        <span className="pt-brand">NEXIS Projets</span>
        <span className="pt-ro">Lecture seule</span>
      </header>
      <section className="pt-card">
        <div className="pt-top">
          <h1>{project.name}</h1>
          <span className="pt-chip">{PROJECT_STATUS[project.status] ?? project.status}</span>
        </div>
        {project.description && <p className="pt-desc">{project.description}</p>}
        <div className="pt-prog" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Avancement du projet"><i style={{ width: `${pct}%` }} /></div>
        <p className="pt-stats">
          <b>{pct} %</b> terminé · {stats.done} tâche{stats.done > 1 ? "s" : ""} sur {stats.total}
          {stats.late > 0 && <span className="late"> · {stats.late} en retard</span>}
          {project.dueDate && <> · échéance {day(project.dueDate)}</>}
        </p>
      </section>

      {milestones.length > 0 && (
        <section className="pt-card">
          <h2>Jalons</h2>
          <ul className="pt-list">{milestones.map((t) => <Row key={t.id} t={t} />)}</ul>
        </section>
      )}

      {groups.map((g) => (
        <section key={g.status} className="pt-card">
          <h2>{g.label ?? TASK_STATUS[g.status]} <span className="pt-count">{g.items.length}</span></h2>
          <ul className="pt-list">
            {g.items.map((t) => (
              <li key={t.id} className="pt-group">
                <ul className="pt-list"><Row t={t} />{t.subs.map((s) => <Row key={s.id} t={s} sub />)}</ul>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {data.tasks.length === 0 && <section className="pt-card"><p className="muted">Aucune tâche pour le moment.</p></section>}

      <footer className="pt-foot">Invitation envoyée à {data.guest.email}. Ce lien est personnel : ne le transférez pas.</footer>
    </main>
  );
}
