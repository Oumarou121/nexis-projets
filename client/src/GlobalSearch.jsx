import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { TASK_STATUS, taskColor } from "./labels.js";
import { Icon } from "./ui.jsx";

/** Recherche globale (Ctrl/Cmd + K) : projets et tâches de l'organisation. */
export default function GlobalSearch({ orgId, onOpen }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [res, setRes] = useState({ projects: [], tasks: [] });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [cur, setCur] = useState(0);
  const seq = useRef(0);
  const inputRef = useRef(null);
  const needle = q.trim();

  // Raccourci clavier global.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
    else { setQ(""); setRes({ projects: [], tasks: [] }); setErr(""); setCur(0); }
  }, [open]);

  // Requête différée ; une réponse périmée n'écrase jamais la plus récente.
  useEffect(() => {
    if (!open) return;
    if (needle.length < 2) { setRes({ projects: [], tasks: [] }); setBusy(false); setErr(""); return; }
    const mine = ++seq.current;
    setBusy(true);
    const timer = setTimeout(() => {
      api(`/api/organizations/${orgId}/search?q=${encodeURIComponent(needle)}`)
        .then((r) => { if (mine === seq.current) { setRes(r); setErr(""); setCur(0); } })
        .catch((e) => { if (mine === seq.current) setErr(e.message); })
        .finally(() => { if (mine === seq.current) setBusy(false); });
    }, 250);
    return () => clearTimeout(timer);
  }, [needle, orgId, open]);

  const items = [
    ...res.projects.map((p) => ({ key: `p${p.id}`, kind: "project", p })),
    ...res.tasks.map((t) => ({ key: `t${t.id}`, kind: "task", t })),
  ];

  function pick(it) {
    if (!it) return;
    setOpen(false);
    if (it.kind === "project") onOpen(it.p.id);
    else onOpen(it.t.projectId, it.t.id);
  }

  function onKeyDown(e) {
    if (e.key === "Escape") setOpen(false);
    else if (e.key === "ArrowDown") { e.preventDefault(); setCur((c) => (items.length ? (c + 1) % items.length : 0)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setCur((c) => (items.length ? (c - 1 + items.length) % items.length : 0)); }
    else if (e.key === "Enter") { e.preventDefault(); pick(items[cur]); }
  }

  useEffect(() => { document.getElementById(`gs-${cur}`)?.scrollIntoView({ block: "nearest" }); }, [cur, items.length]);

  const row = (it, i) => (
    <li key={it.key} id={`gs-${i}`} role="option" aria-selected={i === cur} className={`gs-it ${i === cur ? "on" : ""}`} onMouseMove={() => setCur(i)} onClick={() => pick(it)}>
      {it.kind === "project" ? (
        <>
          <span className="gs-ic"><Icon name="grid" size={16} /></span>
          <span className="gs-tx"><b>{it.p.name}</b></span>
        </>
      ) : (
        <>
          <span className="gs-ic"><i className="gs-dot" style={{ background: taskColor(it.t) }} /></span>
          <span className="gs-tx"><b>{it.t.title}</b><small>{it.t.projectName} · {TASK_STATUS[it.t.status] ?? it.t.status}</small></span>
        </>
      )}
      <Icon name="chevronR" size={15} className="gs-go" />
    </li>
  );

  return (
    <>
      <span className="pop">
        <button type="button" className="icon-btn" aria-label="Rechercher (Ctrl K)" title="Rechercher (Ctrl K)" aria-haspopup="dialog" onClick={() => setOpen(true)}>
          <Icon name="search" size={18} />
        </button>
      </span>
      {open && (
        <div className="overlay center" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="dlg gs-dlg" role="dialog" aria-modal="true" aria-label="Recherche globale">
            <div className="gs-bar">
              <Icon name="search" size={18} />
              <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKeyDown} maxLength={80} placeholder="Rechercher un projet ou une tâche…" role="combobox" aria-expanded="true" aria-controls="gs-list" aria-activedescendant={items.length ? `gs-${cur}` : undefined} aria-label="Rechercher" />
              <kbd>Échap</kbd>
            </div>
            <div className="gs-body">
              {err && <p className="error">{err}</p>}
              {!err && needle.length < 2 && <p className="gs-hint">Tapez au moins 2 caractères.</p>}
              {!err && needle.length >= 2 && !busy && items.length === 0 && <p className="gs-hint">Aucun résultat pour « {needle} ».</p>}
              {items.length > 0 && (
                <ul id="gs-list" role="listbox" className="gs-list">
                  {res.projects.length > 0 && <li role="presentation" className="gs-grp">Projets</li>}
                  {items.map((it, i) => (
                    <FragmentRow key={it.key} first={it.kind === "task" && i === res.projects.length}>{row(it, i)}</FragmentRow>
                  ))}
                </ul>
              )}
              {busy && items.length === 0 && needle.length >= 2 && <p className="gs-hint">Recherche…</p>}
            </div>
            <footer className="gs-foot"><span><kbd>↑</kbd><kbd>↓</kbd> naviguer</span><span><kbd>↵</kbd> ouvrir</span></footer>
          </div>
        </div>
      )}
    </>
  );
}

function FragmentRow({ first, children }) {
  return (
    <>
      {first && <li role="presentation" className="gs-grp">Tâches</li>}
      {children}
    </>
  );
}
