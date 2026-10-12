import { useCallback, useEffect, useState } from "react";
import { api } from "./api.js";
import { Icon, usePopover } from "./ui.jsx";
import { disablePush, enablePush, pushActive, pushBlocked, pushNeedsInstall, pushSupported, storedPushToken } from "./push.js";

const REFRESH_MS = 60_000;

/** « il y a 5 min » : court, sans bibliothèque. */
function ago(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "à l’instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  if (s < 7 * 86400) return `il y a ${Math.floor(s / 86400)} j`;
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

/** Cloche des notifications : compteur de non lues, liste, « tout marquer comme lu ». Rafraîchie toutes les minutes. */
export default function NotificationBell({ orgId, onOpen }) {
  const { open, setOpen, ref } = usePopover();
  const [data, setData] = useState({ unread: 0, items: [] });
  const [err, setErr] = useState("");
  const [emailPref, setEmailPref] = useState(null); // null = pas encore chargé
  const [digestPref, setDigestPref] = useState(true);
  const [pushOn, setPushOn] = useState(pushActive);
  const [pushBusy, setPushBusy] = useState(false);
  const base = `/api/organizations/${orgId}/notifications`;

  const load = useCallback(async () => {
    try {
      setData(await api(base));
      setErr("");
    } catch (e) {
      setErr(e.message);
    }
  }, [base]);

  useEffect(() => {
    load();
    // Pas de requête inutile quand l'onglet est caché ; rechargement dès qu'on y revient.
    const tick = () => document.visibilityState === "visible" && load();
    const id = setInterval(tick, REFRESH_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [load]);

  // Messages du service worker : push reçu pendant que l'application est au premier plan (on rafraîchit la cloche) ;
  // clic sur une notification système (on ouvre le projet / la tâche).
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (e) => {
      if (e.data?.type === "nexis-push") load();
      if (e.data?.type === "nexis-push-open") {
        load();
        if (e.data.projectId) onOpen?.(e.data.projectId, e.data.taskId || null);
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [load, onOpen]);

  // Un appareil enregistré ne le reste que pour la personne connectée : on réaffirme le jeton à chaque ouverture.
  useEffect(() => {
    const t = pushActive() && storedPushToken();
    if (t) api(`${base}/push-token`, "PUT", { token: t }).catch(() => {});
  }, [base]);

  async function togglePush(value) {
    setPushBusy(true);
    setErr("");
    try {
      if (value) {
        const token = await enablePush();
        await api(`${base}/push-token`, "PUT", { token });
        setPushOn(true);
      } else {
        const token = await disablePush();
        setPushOn(false);
        if (token) await api(`${base}/push-token`, "DELETE", { token });
      }
    } catch (e) {
      setErr(e.message);
      setPushOn(pushActive());
    } finally {
      setPushBusy(false);
    }
  }

  // La préférence se charge à l'ouverture du panneau (pas à chaque rafraîchissement de la cloche).
  useEffect(() => {
    if (!open) return;
    api(`${base}/preferences`).then((p) => { setEmailPref(p.email); setDigestPref(p.digest !== false); }).catch(() => {});
  }, [open, base]);

  async function toggleDigest(value) {
    const previous = digestPref;
    setDigestPref(value);
    try {
      await api(`${base}/preferences`, "PUT", { digest: value });
    } catch (e) {
      setDigestPref(previous);
      setErr(e.message);
    }
  }

  async function toggleEmail(value) {
    const previous = emailPref;
    setEmailPref(value);
    try {
      await api(`${base}/preferences`, "PUT", { email: value });
    } catch (e) {
      setEmailPref(previous);
      setErr(e.message);
    }
  }

  async function readAll() {
    try {
      await api(`${base}/read-all`, "POST");
      setData((d) => ({ unread: 0, items: d.items.map((i) => ({ ...i, read: true })) }));
    } catch (e) {
      setErr(e.message);
    }
  }

  async function pick(n) {
    setOpen(false);
    if (!n.read) {
      setData((d) => ({ unread: Math.max(0, d.unread - 1), items: d.items.map((i) => (i.id === n.id ? { ...i, read: true } : i)) }));
      api(`${base}/${n.id}/read`, "POST").catch(() => load());
    }
    if (n.projectId) onOpen?.(n.projectId, n.taskId);
  }

  return (
    <span className="pop" ref={ref}>
      <button
        type="button"
        className="icon-btn bell"
        aria-label={data.unread > 0 ? `Notifications : ${data.unread} non lue${data.unread > 1 ? "s" : ""}` : "Notifications"}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); setOpen(!open); if (!open) load(); }}
      >
        <Icon name="bell" size={18} />
        {data.unread > 0 && <span className="bell-badge" aria-hidden="true">{data.unread > 99 ? "99+" : data.unread}</span>}
      </button>
      {open && (
        <div className="menu right notif-panel" role="dialog" aria-label="Notifications">
          <div className="notif-head">
            <strong>Notifications</strong>
            {data.unread > 0 && <button type="button" className="notif-all" onClick={readAll}>Tout marquer comme lu</button>}
          </div>
          {err && <p className="error notif-msg">{err}</p>}
          {!err && data.items.length === 0 && <p className="muted notif-msg">Aucune notification.</p>}
          <ul className="notif-list">
            {data.items.map((n) => (
              <li key={n.id}>
                <button type="button" className={`notif-item ${n.read ? "" : "unread"}`} onClick={() => pick(n)}>
                  {!n.read && <i className="notif-dot" aria-label="Non lue" />}
                  <span className="notif-title">{n.title}</span>
                  <span className="notif-time">{ago(n.createdAt)}</span>
                </button>
              </li>
            ))}
          </ul>
          {emailPref !== null && (
            <label className="notif-pref">
              <input type="checkbox" checked={emailPref} onChange={(e) => toggleEmail(e.target.checked)} />
              Recevoir aussi mes notifications par e-mail
            </label>
          )}
          {pushSupported() && (
            <label className="notif-pref">
              <input type="checkbox" checked={pushOn} disabled={pushBusy || (pushBlocked() && !pushOn)} onChange={(e) => togglePush(e.target.checked)} />
              {pushBlocked() && !pushOn ? "Notifications bloquées dans le navigateur" : "Recevoir les notifications push sur cet appareil"}
            </label>
          )}
          {pushNeedsInstall() && (
            <p className="muted notif-pref">
              Pour recevoir les notifications push sur iPhone : dans Safari, touchez Partager puis « Sur l’écran d’accueil », ouvrez NEXIS depuis cette icône et revenez ici.
            </p>
          )}
          {emailPref !== null && (
            <label className="notif-pref">
              <input type="checkbox" checked={emailPref && digestPref} disabled={!emailPref} onChange={(e) => toggleDigest(e.target.checked)} />
              Recevoir un résumé quotidien de mes tâches
            </label>
          )}
        </div>
      )}
    </span>
  );
}
