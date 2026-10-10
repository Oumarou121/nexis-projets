/**
 * Squelettes de chargement. Chaque composite réutilise les classes du vrai contenu
 * (mêmes cartes, mêmes hauteurs de ligne) : la page ne bouge pas quand les données arrivent.
 */

/** Bloc animé. `w`/`h` en px ou en chaîne CSS ; `r` = rayon. */
export function Skel({ w = "100%", h = 14, r, className = "", style }) {
  return <span className={`sk ${className}`} style={{ width: w, height: h, borderRadius: r, ...style }} aria-hidden="true" />;
}

/** Zone annoncée aux lecteurs d'écran comme « en cours de chargement ». */
export function SkelRegion({ label = "Chargement…", className = "", children }) {
  return <div className={className} role="status" aria-busy="true" aria-label={label}>{children}</div>;
}

/** Même gabarit que `.rp-kpis` (4 cartes de chiffres). */
export function KpiSkeleton({ count = 4 }) {
  return (
    <div className="rp-kpis" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rp-kpi">
          <Skel w={40} h={40} r={12} className="flex-none" />
          <div className="sk-col"><div className="sk-ln" style={{ height: 29 }}><Skel w={46} h={22} /></div><div className="sk-ln" style={{ height: 20 }}><Skel w={92} h={13} /></div></div>
        </div>
      ))}
    </div>
  );
}

/** Titre de page (`.mt-head`) : même hauteur que le titre + sous-titre réels. */
export function HeadSkeleton({ sub = 210 }) {
  return (
    <div className="mt-head" aria-hidden="true">
      <div><h2 className="sk-h2"><Skel w={200} h={26} r={10} className="sk-inline" /></h2><p><Skel w={sub} h={14} className="sk-inline" /></p></div>
    </div>
  );
}

/** Lignes d'un tableau `.lt` : en-têtes réels, cellules en squelette. */
export function TableSkeleton({ heads, rows = 6, widths, className = "", tableClass = "", group = false }) {
  return (
    <div className={`table-wrap lt-wrap ${className}`} aria-hidden="true">
      <table className={`lt ${tableClass}`}>
        <thead><tr>{heads.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
        <tbody>
          {group && <tr className="sk-gh"><td colSpan={heads.length}><Skel w={120} h={16} /></td></tr>}
          {Array.from({ length: rows }, (_, r) => (
            <tr key={r} className="sk-row">
              {heads.map((_, c) => <td key={c}><Skel w={widths?.[c] ?? (c === 0 ? `${55 + ((r * 13) % 35)}%` : 80)} h={14} /></td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Carte de répartition du tableau de bord. */
function DbCardSkeleton({ rows }) {
  return (
    <section className="db-card" aria-hidden="true">
      <header><Skel w={150} h={20} /><Skel w={80} h={13} /></header>
      <Skel h={12} r={99} style={{ marginBottom: 16 }} />
      <ul className="db-rows">
        {Array.from({ length: rows }, (_, i) => (
          <li key={i} className="sk-dbrow"><Skel w={10} h={10} r="50%" /><Skel w={`${40 + ((i * 17) % 30)}%`} h={14} /><Skel w={22} h={14} /><Skel w={36} h={12} /></li>
        ))}
      </ul>
    </section>
  );
}

export function DashboardSkeleton() {
  return (
    <SkelRegion label="Chargement du tableau de bord">
      <HeadSkeleton sub={260} />
      <KpiSkeleton />
      <div className="db-grid"><DbCardSkeleton rows={4} /><DbCardSkeleton rows={4} /></div>
      <section className="db-card db-wide" aria-hidden="true">
        <header><Skel w={160} h={20} /><Skel w={150} h={13} /></header>
        <ul className="db-load">
          {Array.from({ length: 4 }, (_, i) => (
            <li key={i}>
              <span className="who"><Skel w={28} h={28} r="50%" /><Skel w={110} h={14} /></span>
              <Skel h={10} r={99} /><Skel w={20} h={14} /><Skel w={80} h={22} r={99} />
            </li>
          ))}
        </ul>
      </section>
    </SkelRegion>
  );
}

/** Journal d'activité : jours + lignes de même gabarit que `.act-row`. */
export function ActivitySkeleton({ days = 2, rows = 4 }) {
  return (
    <SkelRegion label="Chargement du journal" className="ac-feed">
      {Array.from({ length: days }, (_, d) => (
        <section key={d} className="act-day" aria-hidden="true">
          <h4><Skel w={110} h={15} /></h4>
          <ul className="act-list">
            {Array.from({ length: rows }, (_, i) => (
              <li key={i} className="act-row">
                <Skel w={32} h={32} r={10} className="flex-none" />
                <div className="act-text sk-col"><div className="sk-ln" style={{ height: 22 }}><Skel w={`${50 + ((i * 11 + d * 7) % 35)}%`} h={15} /></div><Skel w="30%" h={22} r={99} style={{ marginTop: 6 }} /></div>
                <Skel w={36} h={13} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </SkelRegion>
  );
}

export function MyTasksSkeleton() {
  return (
    <>
      <TableSkeleton tableClass="mt-table" group heads={["Tâche", "Échéance", "Statut"]} widths={[null, 70, 96]} rows={5} />
    </>
  );
}

/** Cartes de la page Projets (`.pj-cg` > `.pj-cd`). */
export function ProjectCardsSkeleton({ count = 6 }) {
  return (
    <section className="pj-cg" role="status" aria-busy="true" aria-label="Chargement des projets">
      {Array.from({ length: count }, (_, i) => (
        <article key={i} className="pj-cd" aria-hidden="true">
          <div className="pj-ct"><Skel w={40} h={40} r={12} /><Skel w={64} h={24} r={99} /></div>
          <Skel w="60%" h={20} />
          <div className="sk-col" style={{ minHeight: 40 }}><Skel h={14} /><Skel w="70%" h={14} style={{ marginTop: 6 }} /></div>
          <div className="pj-mid"><Skel w={56} h={56} r="50%" /><div className="sk-col"><Skel w={80} h={15} /><Skel w={120} h={13} style={{ marginTop: 6 }} /></div></div>
          <div className="pj-cf"><Skel w={80} h={28} r={99} /><Skel w={70} h={32} r={99} /></div>
        </article>
      ))}
    </section>
  );
}

export function ProjectBentoSkeleton() {
  return (
    <section className="pj-bento" aria-hidden="true">
      <div className="pj-t k"><Skel w={40} h={40} /><Skel w={110} h={14} /></div>
      <div className="pj-t c"><Skel w={40} h={40} /><Skel w={110} h={14} /></div>
      <div className="pj-t w"><Skel w={180} h={16} /><Skel h={18} /><Skel h={18} /><Skel h={18} /></div>
    </section>
  );
}

/** Vues d'un projet. */
export function KanbanSkeleton() {
  return (
    <div className="kanban" role="status" aria-busy="true" aria-label="Chargement des tâches">
      {[3, 2, 3, 1].map((n, c) => (
        <div key={c} className="kcol" aria-hidden="true">
          <div className="kcol-head"><Skel w={90} h={16} /><Skel w={22} h={20} r={99} /></div>
          <div className="kcol-body">
            {Array.from({ length: n }, (_, i) => <Skel key={i} h={96} r={12} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ListSkeleton() {
  return <TableSkeleton heads={["Tâche", "Responsable", "Échéance", "Progression", "Statut", ""]} widths={[null, 110, 70, 90, 96, 16]} rows={7} />;
}

export function PlanSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Chargement du planning">
      <div className="plan-nav" aria-hidden="true"><Skel w={40} h={40} r="50%" /><Skel w={40} h={40} r="50%" /><Skel w={110} h={38} r={99} /><Skel w={160} h={28} /></div>
      <div className="plan sk-plan" aria-hidden="true">
        <div className="sk-plan-row head"><Skel w={90} h={16} style={{ marginLeft: 14 }} /></div>
        <div className="sk-plan-row grp"><Skel w={140} h={16} style={{ marginLeft: 14 }} /></div>
        {Array.from({ length: 8 }, (_, i) => <div key={i} className="sk-plan-row"><Skel w={`${15 + ((i * 23) % 40)}%`} h={22} r={99} style={{ marginLeft: `${(i * 9) % 45}%` }} /></div>)}
        <div className="sk-plan-row tot"><Skel w={60} h={16} style={{ marginLeft: 14 }} /></div>
      </div>
    </div>
  );
}

export function CalendarSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Chargement du calendrier">
      <div className="plan-nav" aria-hidden="true"><Skel w={40} h={40} r="50%" /><Skel w={40} h={40} r="50%" /><Skel w={110} h={38} r={99} /><Skel w={160} h={28} /></div>
      <div className="cal2" aria-hidden="true">
        <div className="cal2-main">
          <div className="cal2-dow">{["Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam.", "Dim."].map((d) => <div key={d}>{d}</div>)}</div>
          <div className="cal2-grid">
            {Array.from({ length: 35 }, (_, i) => (
              <div key={i} className="cal2-cell"><Skel w={24} h={24} r="50%" style={{ alignSelf: "flex-end" }} />{i % 4 === 1 && <Skel h={22} r={6} />}</div>
            ))}
          </div>
        </div>
        <aside className="cal2-side">
          <Skel w={110} h={16} /><Skel w="80%" h={13} style={{ marginTop: 8 }} />
          <Skel h={20} style={{ marginTop: 16 }} /><Skel h={20} style={{ marginTop: 14 }} />
        </aside>
      </div>
    </div>
  );
}

export function ReportsSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Chargement des rapports">
      <KpiSkeleton />
      <div className="rp-tools sk-tools" aria-hidden="true"><Skel w={300} h={44} r={99} /><Skel w={90} h={38} r={99} /><Skel w={170} h={38} r={99} /><Skel w={170} h={38} r={99} /></div>
      <div className="rp-card" aria-hidden="true"><Skel h={420} r={14} /></div>
    </div>
  );
}

/** Petits blocs de la fiche tâche (pièces jointes, activités, commentaires, feuilles de temps). */
export function RowsSkeleton({ rows = 3, h = 44, label = "Chargement…" }) {
  return (
    <div className="sk-rows" role="status" aria-busy="true" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => <Skel key={i} h={h} r={12} />)}
    </div>
  );
}

export function CommentsSkeleton() {
  return (
    <div className="sk-rows" role="status" aria-busy="true" aria-label="Chargement des commentaires">
      {[0, 1].map((i) => (
        <div key={i} className="msg" aria-hidden="true">
          <Skel w={32} h={32} r="50%" className="flex-none" />
          <div className="bubble"><Skel w={120} h={13} /><Skel h={14} style={{ marginTop: 8 }} /><Skel w="65%" h={14} style={{ marginTop: 6 }} /></div>
        </div>
      ))}
    </div>
  );
}

/** Page entière tant que la session n'est pas connue. */
export function PageSkeleton() {
  return (
    <div className="content" role="status" aria-busy="true" aria-label="Chargement">
      <HeadSkeleton />
      <KpiSkeleton />
      <TableSkeleton heads={["", "", ""]} rows={5} />
    </div>
  );
}

/** Chronologie / liste des projets : mêmes grilles que `.pj-tl`. */
export function ProjectTimelineSkeleton({ rows = 5 }) {
  return (
    <section className="pj-tl" role="status" aria-busy="true" aria-label="Chargement des projets">
      <div className="pj-tl-hdr" aria-hidden="true" style={{ minHeight: 46, alignItems: "center" }}>
        <div className="pj-tl-ctl"><Skel w={150} h={16} style={{ margin: "0 10px" }} /></div>
        <div className="pj-tl-m" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>{[0, 1, 2].map((i) => <span key={i}><Skel w={80} h={14} /></span>)}</div>
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div className="pj-tl-row" key={i} aria-hidden="true">
          <div className="pj-tl-lab"><Skel w={`${45 + ((i * 17) % 35)}%`} h={20} /><Skel w="60%" h={22} r={99} /></div>
          <div className="pj-tl-track" style={{ display: "flex", alignItems: "center", padding: "0 6%" }}><Skel w={`${40 + ((i * 13) % 45)}%`} h={26} r={99} /></div>
        </div>
      ))}
    </section>
  );
}
