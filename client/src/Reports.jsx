import { useMemo, useState } from "react";
import { Icon } from "./ui.jsx";
import { TASK_STATUS, isLate, memberName } from "./labels.js";

const CATS = Object.keys(TASK_STATUS); // ordre du flux : à faire → terminée
const MAX_SERIES = 8; // au-delà : « Autres » (jamais de teinte supplémentaire)
const KINDS = { bar: "Barres", line: "Courbes", pie: "Secteurs", table: "Tableau" };

/** Pas d'axe « rond » (1, 2, 5, 10…) pour des effectifs entiers. */
function niceMax(v) {
  if (v <= 4) return Math.max(1, v);
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 5, 10].map((m) => m * p).find((m) => m >= v);
}

/** Rectangle dont seuls les coins du haut sont arrondis (extrémité de donnée, ancrée à la base). */
function barPath(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

const polar = (cx, cy, r, a) => [cx + r * Math.cos(a - Math.PI / 2), cy + r * Math.sin(a - Math.PI / 2)];
function arcPath(cx, cy, R, r, a0, a1) {
  const big = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = polar(cx, cy, R, a0), [x1, y1] = polar(cx, cy, R, a1);
  const [x2, y2] = polar(cx, cy, r, a1), [x3, y3] = polar(cx, cy, r, a0);
  return `M${x0},${y0}A${R},${R} 0 ${big} 1 ${x1},${y1}L${x2},${y2}A${r},${r} 0 ${big} 0 ${x3},${y3}Z`;
}

/** Répartition des tâches par étape et par responsable (graphique en SVG, sans HTML injecté). */
export default function Reports({ tasks, members }) {
  const [kind, setKind] = useState("bar");
  const [stacked, setStacked] = useState(true);
  const [sort, setSort] = useState("");
  const [tip, setTip] = useState(null); // { cat | slice, x, y }

  // Une série par responsable. La couleur suit la personne (ordre de la liste des membres), pas son rang.
  const series = useMemo(() => {
    const byId = new Map();
    for (const t of tasks) {
      const id = t.assigneeId ?? "none";
      if (!byId.has(id)) byId.set(id, Array(CATS.length).fill(0));
      const i = CATS.indexOf(t.status);
      if (i >= 0) byId.get(id)[i]++;
    }
    const named = members.filter((m) => byId.has(m.userId));
    const known = new Set(named.map((m) => m.userId));
    const list = named.map((m, i) => ({ id: m.userId, name: memberName(m), counts: byId.get(m.userId), slot: i }));
    const strangers = [...byId].filter(([id]) => id !== "none" && !known.has(id));
    if (strangers.length) list.push({ id: "former", name: "Anciens membres", counts: strangers.reduce((a, [, c]) => a.map((n, i) => n + c[i]), Array(CATS.length).fill(0)), slot: -1 });
    let out = list;
    if (list.length > MAX_SERIES) {
      const head = list.slice(0, MAX_SERIES - 1);
      const rest = list.slice(MAX_SERIES - 1);
      out = [...head, { id: "others", name: "Autres", counts: rest.reduce((a, s) => a.map((n, i) => n + s.counts[i]), Array(CATS.length).fill(0)), slot: -1 }];
    }
    if (byId.has("none")) out = [...out, { id: "none", name: "Non assignée", counts: byId.get("none"), slot: -2 }];
    const total = (s) => s.counts.reduce((a, b) => a + b, 0);
    if (sort) out = [...out].sort((a, b) => (sort === "asc" ? total(a) - total(b) : total(b) - total(a)));
    return out;
  }, [tasks, members, sort]);

  const fill = (s) => (s.slot >= 0 ? `var(--viz-${s.slot + 1})` : s.slot === -2 ? "var(--viz-none)" : "var(--viz-other)");
  const totalOf = (s) => s.counts.reduce((a, b) => a + b, 0);
  const grand = series.reduce((n, s) => n + totalOf(s), 0);

  // Géométrie
  const W = 900, H = 340, L = 40, R = 16, T = 18, B = 34;
  const band = (W - L - R) / CATS.length;
  const colMax = Math.max(1, ...CATS.map((_, p) => series.reduce((n, s) => n + s.counts[p], 0)));
  const cellMax = Math.max(1, ...series.flatMap((s) => s.counts));
  const yMax = niceMax(kind === "bar" && stacked ? colMax : cellMax);
  const y = (v) => H - B - (v / yMax) * (H - B - T);
  const ticks = Array.from({ length: Math.min(yMax, 5) + 1 }, (_, i) => Math.round((i * yMax) / Math.min(yMax, 5)));

  const move = (e, payload) => {
    const r = e.currentTarget.ownerSVGElement?.getBoundingClientRect() ?? e.currentTarget.getBoundingClientRect();
    setTip({ ...payload, x: e.clientX - r.left, y: e.clientY - r.top });
  };

  const legend = series.length > 1 && (
    <ul className="viz-legend" aria-label="Légende">
      {series.map((s) => (
        <li key={s.id}><i style={{ background: fill(s) }} />{s.name}<span className="muted"> ({totalOf(s)})</span></li>
      ))}
    </ul>
  );

  function Axes() {
    return (
      <g>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="viz-grid" />
            <text x={L - 8} y={y(v) + 4} textAnchor="end" className="viz-tick">{v}</text>
          </g>
        ))}
        {CATS.map((c, p) => (
          <text key={c} x={L + p * band + band / 2} y={H - 11} textAnchor="middle" className="viz-cat">{TASK_STATUS[c]}</text>
        ))}
      </g>
    );
  }

  function Bands() {
    return CATS.map((c, p) => (
      <rect
        key={c}
        x={L + p * band}
        y={T - 6}
        width={band}
        height={H - B - T + 6}
        className={`viz-hit ${tip?.cat === p ? "on" : ""}`}
        onMouseMove={(e) => move(e, { cat: p })}
        onMouseLeave={() => setTip(null)}
      />
    ));
  }

  function Bars() {
    const inner = Math.min(72, band * 0.5);
    return (
      <>
        <Axes />
        {CATS.map((c, p) => {
          const x0 = L + p * band + (band - inner) / 2;
          let acc = 0;
          const total = series.reduce((n, s) => n + s.counts[p], 0);
          return (
            <g key={c}>
              {series.map((s, i) => {
                const v = s.counts[p];
                if (!v) return null;
                if (stacked) {
                  const top = acc + v;
                  const seg = (
                    <path key={s.id} d={barPath(x0, y(top), inner, y(acc) - y(top), top === total ? 4 : 0)} fill={fill(s)} stroke="var(--card)" strokeWidth="2" />
                  );
                  acc = top;
                  return seg;
                }
                const w = inner / series.length;
                return <path key={s.id} d={barPath(x0 + i * w, y(v), Math.max(2, w - 2), y(0) - y(v), 4)} fill={fill(s)} />;
              })}
              {stacked && total > 0 && <text x={x0 + inner / 2} y={y(total) - 6} textAnchor="middle" className="viz-val">{total}</text>}
            </g>
          );
        })}
        <Bands />
      </>
    );
  }

  function Lines() {
    return (
      <>
        <Axes />
        {series.map((s) => (
          <g key={s.id}>
            <polyline points={CATS.map((_, p) => `${L + p * band + band / 2},${y(s.counts[p])}`).join(" ")} fill="none" stroke={fill(s)} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            {CATS.map((_, p) => <circle key={p} cx={L + p * band + band / 2} cy={y(s.counts[p])} r="4" fill={fill(s)} stroke="var(--card)" strokeWidth="2" />)}
          </g>
        ))}
        <Bands />
      </>
    );
  }

  function Pie() {
    const cx = 170, cy = 165, Ro = 140, Ri = 84;
    let a = 0;
    return (
      <>
        {series.filter((s) => totalOf(s) > 0).map((s, i, arr) => {
          const span = (totalOf(s) / grand) * Math.PI * 2;
          const full = arr.length === 1;
          const d = full ? `${arcPath(cx, cy, Ro, Ri, 0, Math.PI)} ${arcPath(cx, cy, Ro, Ri, Math.PI, Math.PI * 2 - 0.0001)}` : arcPath(cx, cy, Ro, Ri, a, a + span);
          a += span;
          return (
            <path key={s.id} d={d} fill={fill(s)} stroke="var(--card)" strokeWidth="2" className={`viz-slice ${tip?.slice === s.id ? "on" : ""}`} onMouseMove={(e) => move(e, { slice: s.id })} onMouseLeave={() => setTip(null)} />
          );
        })}
        <text x={cx} y={cy - 2} textAnchor="middle" className="viz-big">{grand}</text>
        <text x={cx} y={cy + 20} textAnchor="middle" className="viz-tick">tâche{grand > 1 ? "s" : ""}</text>
      </>
    );
  }

  const tipBody = (() => {
    if (!tip) return null;
    if (tip.slice) {
      const s = series.find((x) => x.id === tip.slice);
      return s && (
        <>
          <b>{s.name}</b>
          <div><i style={{ background: fill(s) }} />{totalOf(s)} tâche{totalOf(s) > 1 ? "s" : ""} ({Math.round((totalOf(s) / grand) * 100)} %)</div>
        </>
      );
    }
    const rows = series.filter((s) => s.counts[tip.cat] > 0);
    return (
      <>
        <b>{TASK_STATUS[CATS[tip.cat]]}</b>
        {rows.map((s) => <div key={s.id}><i style={{ background: fill(s) }} />{s.name} <strong>{s.counts[tip.cat]}</strong></div>)}
        {rows.length === 0 && <div className="muted">Aucune tâche</div>}
      </>
    );
  })();

  // Indicateurs : mêmes règles que la page Projets (tâches principales, jalons exclus : ce sont des repères).
  const work = tasks.filter((t) => !t.isMilestone);
  return (
    <>
      <div className="rp-kpis">
        {[
          ["Tâches", work.length, "list", ""],
          ["Terminées", `${work.length ? Math.round((work.filter((t) => t.status === "done").length / work.length) * 100) : 0} %`, "check", "ok"],
          ["En retard", work.filter(isLate).length, "clock", work.filter(isLate).length ? "bad" : ""],
          ["Non assignées", work.filter((t) => !t.assigneeId).length, "flag", ""],
        ].map(([label, value, icon, tone]) => (
          <div key={label} className={`rp-kpi ${tone}`}><span className="rp-ico"><Icon name={icon} size={18} /></span><div><b>{value}</b><span>{label}</span></div></div>
        ))}
      </div>
      <div className="mb rp-tools">
        <div className="seg" role="tablist" aria-label="Type de graphique">
          {Object.entries(KINDS).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={kind === k} className={kind === k ? "on" : ""} onClick={() => { setKind(k); setTip(null); }}>
              <span className="lbl" style={{ display: "inline" }}>{l}</span>
            </button>
          ))}
        </div>
        {(kind === "bar" || kind === "line") && (
          <>
            {kind === "bar" && <button type="button" className={`btn ${stacked ? "on" : ""}`} aria-pressed={stacked} onClick={() => setStacked(!stacked)}>Empilé</button>}
            <button type="button" className={`btn ${sort === "desc" ? "on" : ""}`} aria-pressed={sort === "desc"} onClick={() => setSort(sort === "desc" ? "" : "desc")}>Plus chargés d'abord</button>
            <button type="button" className={`btn ${sort === "asc" ? "on" : ""}`} aria-pressed={sort === "asc"} onClick={() => setSort(sort === "asc" ? "" : "asc")}>Moins chargés d'abord</button>
          </>
        )}
      </div>
      {grand === 0 ? (
        <div className="rp-card"><div className="empty-tab"><Icon name="chart" size={22} /><b>Aucune donnée à afficher</b><span>Aucune tâche ne correspond aux filtres.</span></div></div>
      ) : kind === "table" ? (
        <div className="table-wrap lt-wrap">
          <table className="lt" style={{ minWidth: 0 }}>
            <thead><tr><th>Responsable</th>{CATS.map((c) => <th key={c} style={{ textAlign: "right" }}>{TASK_STATUS[c]}</th>)}<th style={{ textAlign: "right" }}>Total</th></tr></thead>
            <tbody>
              {series.map((s) => (
                <tr key={s.id}>
                  <td><span className="viz-name"><i style={{ background: fill(s) }} />{s.name}</span></td>
                  {s.counts.map((n, i) => <td key={i} style={{ textAlign: "right" }}>{n}</td>)}
                  <td style={{ textAlign: "right", fontWeight: 600 }}>{totalOf(s)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td>Total</td>{CATS.map((_, p) => <td key={p} style={{ textAlign: "right" }}>{series.reduce((n, s) => n + s.counts[p], 0)}</td>)}<td style={{ textAlign: "right" }}>{grand}</td></tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <div className="chw viz rp-card">
          {legend}
          <div className="viz-wrap">
            <svg viewBox={kind === "pie" ? "0 0 340 330" : `0 0 ${W} ${H}`} role="img" aria-label={`Tâches par ${kind === "pie" ? "responsable" : "étape et par responsable"} — ${grand} au total`} className={kind === "pie" ? "viz-pie" : ""}>
              {kind === "bar" ? <Bars /> : kind === "line" ? <Lines /> : <Pie />}
            </svg>
            {tip && <div className="viz-tip" style={{ left: tip.x + 12, top: tip.y + 12 }}>{tipBody}</div>}
          </div>
        </div>
      )}
    </>
  );
}
