import { useCallback, useEffect, useState } from "react";
import { api } from "./api.js";
import { usePerms } from "./perms.js";
import { Icon } from "./ui.jsx";
import "./members.css";
import { confirmDialog } from "./confirm.jsx";

const when = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "");
const DURATIONS = [[7, "7 jours"], [30, "30 jours"], [90, "90 jours"], [365, "1 an"], [null, "Sans expiration"]];
const STATUS = { active: ["Actif", "ok"], expired: ["Expiré", "warn"], revoked: ["Révoqué", "off"] };

/**
 * Onglet « Partage » d'un projet public : invités externes (lecture seule) invités par e-mail.
 * L'invitant ne voit jamais le jeton ; si l'e-mail n'a pas pu partir, le serveur lui rend le lien
 * (à transmettre lui-même) et on l'affiche une seule fois ici.
 */
export default function ProjectSharing({ orgId, project, onBusy }) {
  const { canManage } = usePerms();
  const url = `/api/organizations/${orgId}/projects/${project.id}/guests`;
  const [rows, setRows] = useState(null);
  const [email, setEmail] = useState("");
  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState(false);
  useEffect(() => { onBusy?.(busy); return () => onBusy?.(false); }, [busy, onBusy]); // verrouille la fermeture du modal parent
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState(null); // { text, link? }

  // Les invités (adresses externes) ne sont visibles que des gestionnaires : le serveur refuse les autres.
  const load = useCallback(() => (canManage ? api(url).then(setRows).catch((e) => setErr(e.message)) : Promise.resolve(setRows([]))), [url, canManage]);
  useEffect(() => { load(); }, [load]);

  function report(res, who) {
    setNotice(
      res.emailSent
        ? { text: `Invitation envoyée à ${who}.` }
        : { text: `L'e-mail n'a pas pu être envoyé${res.emailError ? ` (${res.emailError})` : ""}. Transmettez ce lien vous-même — il n'est affiché qu'une fois :`, link: res.link },
    );
  }

  async function run(fn) {
    setBusy(true);
    setErr("");
    try {
      await fn();
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const invite = (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    run(async () => {
      const res = await api(url, "POST", { email, expiresInDays: days });
      setEmail("");
      report(res, res.guest.email);
    });
  };
  const resend = (g) => run(async () => report(await api(`${url}/${g.id}/resend`, "POST", { expiresInDays: days }), g.email));
  const revoke = async (g) => {
    await confirmDialog({ tone: "danger", icon: "link", title: "Révoquer cet accès ?", text: "Son lien cessera de fonctionner immédiatement.", chip: [g.email, "Invité · accès en lecture seule"], ok: "Révoquer l’accès", run: async () => { await api(`${url}/${g.id}`, "DELETE"); setNotice(null); await load(); } });
    setErr("");
  };

  const active = (rows ?? []).filter((g) => g.status === "active").length;
  return (
    <>
      {err && <p className="error" style={{ padding: 0 }}>{err}</p>}
      <section className="set-box">
        <h5 className="set-h">Inviter une personne extérieure</h5>
        <p className="pm-note">
          Les invités reçoivent un <b>lien personnel</b> par e-mail et consultent le projet en <b>lecture seule</b> : nom, description et tâches (titres, statuts, échéances). Ils ne voient ni les commentaires, ni les pièces jointes, ni le temps passé, ni les personnes assignées. Le lien est <b>personnel</b> : ne le transférez pas.
        </p>
        {canManage ? (
          <form className="pm-add sh-add" onSubmit={invite}>
            <input type="email" required maxLength={254} placeholder="adresse@exemple.com" aria-label="Adresse e-mail de l'invité" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
            <select aria-label="Durée de validité" value={days ?? "none"} onChange={(e) => setDays(e.target.value === "none" ? null : Number(e.target.value))}>
              {DURATIONS.map(([v, l]) => <option key={l} value={v ?? "none"}>{l}</option>)}
            </select>
            <button className="pj-ok" disabled={busy || !email.trim()}>Inviter</button>
          </form>
        ) : (
          <p className="muted small">Seul un gestionnaire du projet peut inviter des personnes extérieures et voir les invitations.</p>
        )}
        {notice && (
          <div className="pm-warn" role="status" style={{ marginTop: 12 }}>
            <p>{notice.text}</p>
            {notice.link && (
              <div className="sh-link">
                <input readOnly value={notice.link} aria-label="Lien d'invitation" onFocus={(e) => e.target.select()} />
                <button type="button" className="ghost" onClick={() => navigator.clipboard?.writeText(notice.link)}>Copier</button>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="set-box">
        <h5 className="set-h">Invités{rows ? ` (${active} actif${active > 1 ? "s" : ""})` : ""}</h5>
        {!rows && !err && <p className="muted small">Chargement…</p>}
        {rows && rows.length === 0 && <div className="set-empty"><strong>Aucun invité</strong><span>Invitez une personne par e-mail ci-dessus.</span></div>}
        <ul className="pm-list">
          {(rows ?? []).map((g) => {
            const [label, tone] = STATUS[g.status] ?? [g.status, "off"];
            return (
              <li key={g.id} className="pm-row">
                <span className="pm-all" aria-hidden="true"><Icon name="globe" size={16} /></span>
                <span className="pm-who">
                  <strong>{g.email}</strong>
                  <small>
                    invité le {when(g.createdAt)}
                    {g.status === "active" && g.expiresAt ? ` · expire le ${when(g.expiresAt)}` : ""}
                    {g.lastAccessAt ? ` · dernière visite le ${when(g.lastAccessAt)}` : " · pas encore ouvert"}
                  </small>
                </span>
                <span className={`sh-badge ${tone}`}>{label}</span>
                {canManage && g.status !== "revoked" && <button type="button" className="ghost" disabled={busy} onClick={() => resend(g)} title="Envoie un nouveau lien ; l'ancien cesse de fonctionner">Renvoyer</button>}
                {canManage && g.status !== "revoked" && (
                  <button type="button" className="icon-btn" aria-label={`Révoquer ${g.email}`} disabled={busy} onClick={() => revoke(g)}><Icon name="close" size={16} /></button>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
