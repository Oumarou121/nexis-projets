import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./confirm.css";

// Remplace window.confirm : `await confirmDialog({ ... })` (résultat : false si annulé, true si confirmé).
// Avec `run: async (valeur) => {...}` (appel serveur) : le bouton devient une barre circulaire, le modal ne peut plus
// être fermé tant que l'action dure, puis il se ferme ; si `run` échoue, l'erreur s'affiche dans le modal.
// Résultat : false (annulé), true (confirmé) ou, avec `select`, la valeur choisie (chaîne non vide).
const ICONS = {
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  alert: "M12 3.5L2.5 20h19L12 3.5zM12 10v4.5M12 17.5h.01",
  lock: "M7 11V8a5 5 0 0110 0v3M6 11h12a1 1 0 011 1v7a1 1 0 01-1 1H6a1 1 0 01-1-1v-7a1 1 0 011-1z",
  globe: "M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z",
  user: "M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2.5 20a6.5 6.5 0 0113 0M17 8h5",
  layers: "M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5",
  undo: "M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3",
  link: "M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1",
};

function ConfirmModal({ opts, done }) {
  const { tone = "danger", icon = "trash", title, text, chip, list, note, field, select, ok = "Confirmer", cancel = "Annuler" } = opts;
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [pick, setPick] = useState(select?.options?.[0]?.value ?? "");
  const box = useRef(null);
  const cancelBtn = useRef(null);
  const okBtn = useRef(null);
  const gated = !!field && typed.trim().toLowerCase() !== String(field.match).toLowerCase();
  const confirmValue = () => (select ? pick || true : true);
  const cancelIt = () => { if (!busy) done(false); };
  async function confirmIt() {
    if (busy) return;
    if (!opts.run) return done(confirmValue());
    setBusy(true);
    setErr("");
    try {
      await opts.run(confirmValue());
      done(true);
    } catch (e) {
      setErr(e?.message || "L’action a échoué.");
      setBusy(false);
    }
  }

  useEffect(() => {
    const prev = document.activeElement;
    // Destructif : le focus part sur « Annuler » (jamais sur l'action irréversible).
    (tone === "danger" ? cancelBtn : okBtn).current?.focus();
    return () => prev?.focus?.();
  }, [tone]);

  function onKey(e) {
    if (e.key === "Escape") { e.stopPropagation(); cancelIt(); return; }
    if (e.key !== "Tab") return;
    const els = [...box.current.querySelectorAll("button:not(:disabled), input, select")];
    if (!els.length) return;
    const first = els[0], last = els[els.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  return (
    <div className="cf-ov" onMouseDown={(e) => e.target === e.currentTarget && cancelIt()} onKeyDown={onKey}>
      <div ref={box} className={`cf cf-${tone}`} role="alertdialog" aria-modal="true" aria-busy={busy} aria-labelledby="cf-t" aria-describedby="cf-d">
        <div className="cf-head">
          <span className="cf-ic"><svg viewBox="0 0 24 24" aria-hidden="true"><path d={ICONS[icon] ?? ICONS.alert} /></svg></span>
          <div>
            <h3 className="cf-title" id="cf-t">{title}</h3>
            {text && <p className="cf-text" id="cf-d">{text}</p>}
          </div>
        </div>
        {chip && <div className="cf-chip">{chip[0]}{chip[1] && <small>{chip[1]}</small>}</div>}
        {list && <ul className="cf-list">{list.map((x) => <li key={x}>{x}</li>)}</ul>}
        {note && <p className="cf-text cf-note">{note}</p>}
        {field && (
          <div className="cf-field">
            <label htmlFor="cf-f">{field.label} (<b>{field.match}</b>)</label>
            <input id="cf-f" value={typed} disabled={busy} autoComplete="off" placeholder={field.match} onChange={(e) => setTyped(e.target.value)} />
          </div>
        )}
        {select && (
          <div className="cf-field">
            <label htmlFor="cf-s">{select.label}</label>
            <select id="cf-s" value={pick} disabled={busy} onChange={(e) => setPick(e.target.value)}>
              {select.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        )}
        {err && <p className="cf-err" role="alert">{err}</p>}
        <div className="cf-foot">
          <button type="button" ref={cancelBtn} className="cf-b" disabled={busy} onClick={cancelIt}>{cancel}</button>
          <button type="button" ref={okBtn} className={`cf-b cf-ok ${busy ? "cf-run" : ""}`} disabled={gated || busy} onClick={confirmIt} aria-label={busy ? "Action en cours" : undefined}>
            <span className="cf-lbl">{ok}</span>
            {busy && <svg className="cf-spin" viewBox="0 0 24 24" role="progressbar" aria-label="Action en cours"><circle className="cf-track" cx="12" cy="12" r="9" /><circle className="cf-arc" cx="12" cy="12" r="9" /></svg>}
          </button>
        </div>
      </div>
    </div>
  );
}

let root = null;
let host = null;

export function confirmDialog(opts) {
  return new Promise((resolve) => {
    if (!host) {
      host = document.createElement("div");
      document.body.appendChild(host);
      root = createRoot(host);
    }
    const done = (v) => { root.render(null); resolve(v); };
    root.render(<ConfirmModal opts={opts} done={done} />);
  });
}
