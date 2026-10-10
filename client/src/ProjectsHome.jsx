import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api.js";
import { ProjectCardsSkeleton, ProjectTimelineSkeleton, Skel } from "./Skeleton.jsx";
import { ColorPicker, Icon } from "./ui.jsx";
import { PRIORITY, PROJECT_STATUS, memberName, projectColor, todayISO } from "./labels.js";

/* ---------- Utilitaires ---------- */
const DAY = 86400000;
const dayNum = (iso) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d) / DAY;
};
const fmtDay = (iso) => new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
const initials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const VIEW_KEY = "nexis.projets.view";
const VIEWS = { timeline: "Chronologie", list: "Liste", cards: "Cartes" };
const getView = () => {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return VIEWS[v] ? v : "timeline";
  } catch {
    return "timeline";
  }
};
const saveView = (v) => {
  try {
    localStorage.setItem(VIEW_KEY, v);
  } catch {
    /* stockage indisponible : le choix vaut pour cette session */
  }
};

const isLateProject = (p) => !!p.dueDate && p.dueDate < todayISO() && p.status !== "done";
const progress = (p) => (p.taskCount ? Math.round((p.doneCount / p.taskCount) * 100) : 0);

/** Échéance en deux lignes : date, puis indication relative. */
function dueInfo(p) {
  if (!p.dueDate) return { main: "Aucune", sub: "Sans échéance", late: false };
  if (p.status === "done") return { main: fmtDay(p.dueDate), sub: "Terminé", late: false };
  const diff = dayNum(p.dueDate) - dayNum(todayISO());
  if (diff < 0) return { main: fmtDay(p.dueDate), sub: `Retard de ${-diff} j`, late: true };
  if (diff === 0) return { main: fmtDay(p.dueDate), sub: "Aujourd'hui", late: false };
  return { main: fmtDay(p.dueDate), sub: `Dans ${diff} j`, late: false };
}

/** Membres concernés par un projet (tâches ouvertes), les plus chargés d'abord. */
function team(p, members) {
  return Object.entries(p.openByAssignee ?? {})
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => {
      const m = members.find((x) => x.userId === id);
      return { id, name: m ? memberName(m) : "Membre" };
    });
}

function Team({ p, members, max = 3 }) {
  const t = team(p, members);
  if (t.length === 0) return <span className="pj-none">—</span>;
  return (
    <span className="pj-avs">
      {t.slice(0, max).map((m) => <span key={m.id} className="pj-av" title={m.name}>{initials(m.name)}</span>)}
      {t.length > max && <span className="pj-av pj-more" title={`${t.length - max} autres membres`}>+{t.length - max}</span>}
    </span>
  );
}

const StatusPill = ({ status }) => (
  <span className="pj-st" style={{ background: `var(--pst-${status}-bg)`, color: `var(--pst-${status}-fg)` }}>{PROJECT_STATUS[status]}</span>
);

/* ---------- Modal « Créer un projet » ---------- */
const EMPTY = { name: "", description: "", status: "planned", priority: "medium", dueDate: "", color: 0 };

function NewProjectDialog({ base, onClose, onCreated }) {
  const [form, setForm] = useState(EMPTY);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      await api(base, "POST", {
        name: form.name,
        status: form.status,
        priority: form.priority,
        color: form.color,
        ...(form.description.trim() ? { description: form.description } : {}),
        ...(form.dueDate ? { dueDate: form.dueDate } : {}),
      });
      onCreated();
    } catch (e2) {
      setErr(e2.message);
      setBusy(false);
    }
  }

  return (
    <div className="pj-ov" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="pj-md" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="pj-md-t">
        <div className="pj-mh">
          <div>
            <h2 id="pj-md-t">Créer un projet</h2>
            <p>Seul le nom est obligatoire. Le reste se règle plus tard.</p>
          </div>
          <button type="button" className="pj-x" aria-label="Fermer" onClick={onClose}><Icon name="close" size={18} /></button>
        </div>
        <div className="pj-mb">
          <div className="pj-f">
            <label htmlFor="np-name">Nom du projet</label>
            <input id="np-name" type="text" autoFocus placeholder="Ex. : Refonte du site" value={form.name} onChange={set("name")} />
          </div>
          <div className="pj-f">
            <label htmlFor="np-desc">Description <span>(facultatif)</span></label>
            <textarea id="np-desc" rows={3} placeholder="À quoi sert ce projet, pour qui ?" value={form.description} onChange={set("description")} />
          </div>
          <div className="pj-g2">
            <div className="pj-f">
              <label htmlFor="np-status">Statut</label>
              <select id="np-status" value={form.status} onChange={set("status")}>
                {Object.entries(PROJECT_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className="pj-f">
              <label htmlFor="np-due">Échéance <span>(facultatif)</span></label>
              <input id="np-due" type="date" value={form.dueDate} onChange={set("dueDate")} />
            </div>
          </div>
          <fieldset className="pj-f">
            <legend>Priorité</legend>
            <div className="pj-pr">
              {Object.entries(PRIORITY).map(([v, l]) => (
                <label key={v} className="pj-rb">
                  <input type="radio" name="np-prio" value={v} checked={form.priority === v} onChange={set("priority")} />
                  <span>{l}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="pj-f">
            <legend>Couleur du projet</legend>
            <ColorPicker value={form.color} onChange={(c) => setForm({ ...form, color: c })} />
          </fieldset>
          {err && <p className="error" role="alert" style={{ padding: 0, margin: 0 }}>{err}</p>}
        </div>
        <div className="pj-mf">
          <small>Vous pourrez inviter l'équipe et régler les options ensuite.</small>
          <button type="button" className="pj-ghost" onClick={onClose}>Annuler</button>
          <button className="pj-ok" disabled={form.name.trim().length < 2 || busy}>Créer le projet</button>
        </div>
      </form>
    </div>
  );
}

/* ---------- Vue Chronologie ---------- */
const MONTHS = 4;

function Timeline({ list, members, onOpen }) {
  const [off, setOff] = useState(0); // décalage en mois par rapport à la période par défaut
  const today = dayNum(todayISO());
  const now = new Date();
  const first = { y: now.getFullYear(), m: now.getMonth() - 1 + off }; // un mois avant le mois courant
  const monthStart = (i) => Date.UTC(first.y, first.m + i, 1) / DAY;
  const wStart = monthStart(0);
  const wEnd = monthStart(MONTHS);
  const total = wEnd - wStart;
  const x = (d) => clamp(((d - wStart) / total) * 100, 0, 100);
  const cuts = Array.from({ length: MONTHS - 1 }, (_, i) => x(monthStart(i + 1)));
  const todayPct = today >= wStart && today < wEnd ? x(today) : -10;
  const label = (i) => {
    const d = new Date(monthStart(i) * DAY);
    const name = d.toLocaleDateString("fr-FR", { month: "long", timeZone: "UTC" });
    return (name[0].toUpperCase() + name.slice(1)) + (i === 0 || d.getUTCMonth() === 0 ? ` ${d.getUTCFullYear()}` : "");
  };
  const gridStyle = { "--g1": `${cuts[0]}%`, "--g2": `${cuts[1]}%`, "--g3": `${cuts[2]}%`, "--td": `${todayPct}%` };

  return (
    <section className="pj-tl fade-in" aria-label="Chronologie des projets">
      <div className="pj-tl-hdr">
        <div className="pj-tl-ctl">
          <button type="button" className="pj-it" aria-label="Période précédente" onClick={() => setOff(off - 1)}><Icon name="back" size={16} /></button>
          <button type="button" className="pj-it" aria-label="Période suivante" onClick={() => setOff(off + 1)}><Icon name="chevronR" size={16} /></button>
          {off !== 0 && <button type="button" className="pj-it txt" onClick={() => setOff(0)}>Aujourd'hui</button>}
          <span className="pj-tl-p">Projet</span>
        </div>
        <div className="pj-tl-m" style={{ gridTemplateColumns: Array.from({ length: MONTHS }, (_, i) => `${monthStart(i + 1) - monthStart(i)}fr`).join(" ") }}>
          {Array.from({ length: MONTHS }, (_, i) => <span key={i}>{label(i)}</span>)}
        </div>
      </div>

      {list.map((p) => {
        const color = projectColor(p.name, p.color);
        const start = dayNum(p.createdAt);
        const due = p.dueDate ? dayNum(p.dueDate) : null;
        const late = isLateProject(p);
        const end = due ?? Math.max(today, start + 1);
        const bar = Math.max(end, start + 1);
        const over = late && due !== null && today > due;
        const lastDay = over ? today : bar;
        const visible = lastDay >= wStart && start < wEnd;
        const left = x(start);
        const width = Math.max(1.4, x(bar + 1) - left);
        const pct = progress(p);
        const dd = dueInfo(p);
        return (
          <div className="pj-tl-row" key={p.id}>
            <div className="pj-tl-lab">
              <button type="button" className="pj-link" onClick={() => onOpen(p)}><i className="pj-dot" style={{ background: color }} />{p.name}</button>
              <div className="pj-tl-meta">
                <StatusPill status={p.status} />
                <span className={dd.late ? "pj-late" : ""}>{p.dueDate ? `${dd.main} · ${dd.sub}` : dd.sub}</span>
              </div>
            </div>
            <div className="pj-tl-track" style={gridStyle}>
              {visible ? (
                <>
                  <div className={`pj-bar ${due === null || p.status === "on_hold" ? "dashed" : ""}`} style={{ left: `${left}%`, width: `${width}%`, borderColor: color, background: `color-mix(in srgb, ${color} 22%, transparent)` }}>
                    <b style={{ width: `${pct}%`, background: color }} />
                  </div>
                  {over && <i className="pj-over" style={{ left: `${x(due + 1)}%`, width: `${Math.max(0, x(today + 1) - x(due + 1))}%` }} title="En retard sur l'échéance" />}
                  {(p.milestoneDates ?? []).map((d) => {
                    const dn = dayNum(d);
                    return dn >= wStart && dn < wEnd ? <i key={d} className="pj-ms" style={{ left: `${x(dn)}%` }} title={`Jalon · ${fmtDay(d)}`} /> : null;
                  })}
                  <div className="pj-end" style={{ left: `${Math.min(x(lastDay + 1) + 1.2, 86)}%` }}>
                    <Team p={p} members={members} />
                    <span className="pj-pc">{pct}%</span>
                  </div>
                </>
              ) : (
                <span className="pj-off">Hors de cette période</span>
              )}
            </div>
          </div>
        );
      })}
      <div className="pj-leg">
        <span>Partie pleine : avancement</span>
        <span>Hachures : retard sur l'échéance</span>
        <span>Losange : jalon</span>
        <span>Pointillés : sans échéance ou en pause</span>
        <span>Ligne verticale : aujourd'hui</span>
      </div>
    </section>
  );
}

/* ---------- Vue Liste ---------- */
function ListView({ list, members, onOpen }) {
  return (
    <section className="pj-lt fade-in" aria-label="Liste des projets">
      <div className="pj-lh"><span>Projet</span><span>Statut</span><span>Avancement</span><span>Échéance</span><span>Équipe</span><span /></div>
      {list.map((p) => {
        const color = projectColor(p.name, p.color);
        const dd = dueInfo(p);
        const pct = progress(p);
        return (
          <article className="pj-lr" key={p.id}>
            <div>
              <button type="button" className="pj-link" onClick={() => onOpen(p)}><i className="pj-dot" style={{ background: color }} />{p.name}</button>
              {p.description && <div className="pj-ld">{p.description}</div>}
            </div>
            <div><StatusPill status={p.status} /></div>
            <div>
              <div className="pj-pb"><i style={{ width: `${pct}%`, background: color }} /></div>
              <div className="pj-pt">{p.doneCount} / {p.taskCount} tâches · {pct} %</div>
            </div>
            <div className={`pj-dd ${dd.late ? "late" : ""}`}><b>{dd.main}</b><span>{dd.sub}</span></div>
            <div><Team p={p} members={members} /></div>
            <button type="button" className="pj-it" aria-label={`Ouvrir ${p.name}`} onClick={() => onOpen(p)}><Icon name="chevronR" size={18} /></button>
          </article>
        );
      })}
    </section>
  );
}

/* ---------- Vue Cartes ---------- */
function CardsView({ list, members, onOpen, onCreate, canCreate }) {
  return (
    <section className="pj-cg fade-in" aria-label="Projets">
      {list.map((p) => {
        const color = projectColor(p.name, p.color);
        const dd = dueInfo(p);
        const pct = progress(p);
        return (
          <article className="pj-cd" key={p.id}>
            <div className="pj-ct">
              <div className="pj-mono" style={{ background: color }} aria-hidden="true">{p.name[0].toUpperCase()}</div>
              <StatusPill status={p.status} />
            </div>
            <button type="button" className="pj-cn" onClick={() => onOpen(p)}>{p.name}</button>
            <p className="pj-cp">{p.description || "Aucune description"}</p>
            <div className="pj-mid">
              <div className="pj-ring" style={{ background: `conic-gradient(${color} ${pct * 3.6}deg, var(--pj-track) 0)` }}><span>{pct}%</span></div>
              <div className="pj-mt">
                <b>{plural(p.taskCount, "tâche", "tâches")}</b>
                <span className={dd.late ? "pj-late" : ""}>{p.dueDate ? `${dd.main} · ${dd.sub}` : dd.sub}</span>
              </div>
            </div>
            <div className="pj-cf">
              <Team p={p} members={members} />
              <button type="button" className="pj-go" aria-label={`Ouvrir ${p.name}`} onClick={() => onOpen(p)}>Ouvrir</button>
            </div>
          </article>
        );
      })}
      {canCreate && <button type="button" className="pj-add" onClick={onCreate}>+ Créer un projet</button>}
    </section>
  );
}

/* ---------- Page ---------- */
export default function Projects({ orgId, onOpen, members = [], ready = true }) {
  const [list, setList] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const [view, setViewState] = useState(getView);
  const busy = (!loaded || !ready) && !err;
  const base = `/api/organizations/${orgId}/projects`;

  const load = useCallback(
    () => api(base).then((l) => { setList(l); setErr(""); }).catch((e) => setErr(e.message)).finally(() => setLoaded(true)),
    [base],
  );
  useEffect(() => { load(); }, [load]);

  const pickView = (v) => { setViewState(v); saveView(v); };
  const needle = q.trim().toLowerCase();
  const shown = needle ? list.filter((p) => p.name.toLowerCase().includes(needle)) : list;

  const stats = useMemo(() => {
    const late = list.reduce((n, p) => n + (p.lateCount ?? 0), 0);
    return { active: list.filter((p) => p.status === "active").length, late };
  }, [list]);

  return (
    <div className="pj-wrap">
      <div className="pj-head">
        <div>
          <h1>Vos projets</h1>
          {busy ? <p className="pj-sum"><Skel w={300} h={16} className="sk-inline" /></p> : <p className="pj-sum">
            {plural(list.length, "projet", "projets")}, {plural(stats.active, "actif", "actifs")}.{" "}
            {stats.late > 0 ? <b>{plural(stats.late, "tâche en retard", "tâches en retard")}</b> : "Aucune tâche en retard."}
            {stats.late > 0 && " à reprendre."}
          </p>}
        </div>
        <button className="pj-new" onClick={() => setCreating(true)}>Nouveau projet</button>
      </div>

      <div className="pj-bar0">
        <div className="pj-seg" role="group" aria-label="Affichage">
          {Object.entries(VIEWS).map(([v, l]) => (
            <button key={v} type="button" className={view === v ? "on" : ""} aria-pressed={view === v} onClick={() => pickView(v)}>{l}</button>
          ))}
        </div>
        <label className="pj-search">
          <Icon name="search" size={16} />
          <input type="search" aria-label="Rechercher un projet" placeholder="Rechercher un projet…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>

      {err && <p className="error" role="alert" style={{ padding: 0 }}>{err}</p>}

      {busy && (view === "cards" ? <ProjectCardsSkeleton /> : <ProjectTimelineSkeleton />)}
      {!busy && shown.length > 0 && view === "timeline" && <Timeline list={shown} members={members} onOpen={onOpen} />}
      {!busy && shown.length > 0 && view === "list" && <ListView list={shown} members={members} onOpen={onOpen} />}
      {!busy && (shown.length > 0 || (loaded && !err && !needle)) && view === "cards" && <CardsView list={shown} members={members} onOpen={onOpen} onCreate={() => setCreating(true)} canCreate />}

      {!busy && loaded && !err && shown.length === 0 && view !== "cards" && (
        <div className="empty">
          <b>{list.length ? "Aucun résultat" : "Aucun projet pour l'instant"}</b>
          {list.length ? "Essayez un autre mot-clé." : "Cliquez sur « Nouveau projet » pour créer le premier."}
        </div>
      )}

      {creating && <NewProjectDialog base={base} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); load(); }} />}
    </div>
  );
}
