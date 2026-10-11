import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api.js";
import { usePerms } from "./perms.js";
import { Avatar, Icon } from "./ui.jsx";
import { memberName } from "./labels.js";
import "./members.css";

const when = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "");

/**
 * Onglet « Membres » des paramètres du projet.
 * Les membres limitent l'accès uniquement quand le projet est privé : un projet interne n'affiche
 * qu'une ligne « tous les utilisateurs de l'organisation », sans liste (les membres enregistrés sont
 * conservés côté serveur et réapparaissent si le projet repasse en privé).
 * `people` = membres de l'organisation (noms) ; `canList` = droit de les lister dans NEXIS Identity.
 */
export default function ProjectMembers({ orgId, project, people, canList, onChange, onLeave }) {
  const { canEdit } = usePerms();
  const url = `/api/organizations/${orgId}/projects/${project.id}/members`;
  const [data, setData] = useState(null); // { visibility, me, members, assigneesWithoutAccess }
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const isPrivate = project.visibility === "private";

  const publish = useCallback((d) => {
    setData(d);
    onChange?.(d.members.map((m) => m.userId));
  }, [onChange]);

  const load = useCallback(
    () => api(url).then(publish).catch((e) => setErr(e.message)),
    [url, publish],
  );
  // Rechargé aussi quand la visibilité change : « assigneesWithoutAccess » n'a de sens que pour un projet privé.
  useEffect(() => { load(); }, [load, project.visibility]);

  const person = useCallback((id) => people.find((m) => m.userId === id), [people]);
  const label = (id) => (person(id) ? memberName(person(id)) : "Utilisateur");
  const memberIds = useMemo(() => new Set((data?.members ?? []).map((m) => m.userId)), [data]);
  const candidates = people.filter((m) => !memberIds.has(m.userId));

  async function add(userId) {
    if (!userId) return;
    setBusy(true);
    try {
      await api(url, "POST", { userId });
      setPick("");
      setErr("");
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(userId) {
    const self = userId === data.me;
    const ask = self && isPrivate
      ? "Vous retirer de ce projet privé ? Vous ne pourrez plus l'ouvrir tant qu'on ne vous aura pas ajouté de nouveau."
      : `Retirer ${self ? "vous" : label(userId)} des membres du projet ?`;
    if (!window.confirm(ask)) return;
    setBusy(true);
    try {
      await api(`${url}/${userId}`, "DELETE");
      setErr("");
      if (self && isPrivate) return onLeave?.();
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const rows = data?.members ?? [];
  return (
    <>
      {err && <p className="error" style={{ padding: 0 }}>{err}</p>}

      {isPrivate && (data?.assigneesWithoutAccess ?? []).length > 0 && (
        <div className="pm-warn" role="status">
          <p><b>Tâches en cours assignées à des personnes sans accès au projet.</b> Elles ne les voient pas, ni dans « Mes tâches ».</p>
          {data.assigneesWithoutAccess.map((id) => (
            <div key={id} className="pm-row">
              <Avatar member={person(id)} size={26} />
              <span className="pm-who"><strong>{label(id)}</strong></span>
              {canEdit && canList && <button type="button" className="ghost" disabled={busy} onClick={() => add(id)}>Ajouter au projet</button>}
            </div>
          ))}
        </div>
      )}

      {!isPrivate ? (
        // Projet interne : l'accès ne dépend pas des membres. Une seule ligne, sans liste ni ajout.
        <section className="set-box">
          <h5 className="set-h">Accès au projet</h5>
          <ul className="pm-list">
            <li className="pm-row">
              <span className="pm-all" aria-hidden="true"><Icon name="users" size={16} /></span>
              <span className="pm-who">
                <strong>Tous les utilisateurs de l'organisation</strong>
                <small>Ayant accès aux projets</small>
              </span>
            </li>
          </ul>
          <p className="pm-note" style={{ margin: "12px 0 0" }}>
            Ce projet est <b>interne</b>. La liste des membres n'apparaît que s'il est <b>privé</b> : seuls ses membres, les responsables et les administrateurs de la plateforme pourront alors le voir.
          </p>
        </section>
      ) : (
      <section className="set-box">
        <h5 className="set-h">Membres du projet{data ? ` (${rows.length})` : ""}</h5>
        <p className="pm-note">
          Ce projet est <b>privé</b> : seuls ses membres, les responsables (droit de suppression des projets) et les administrateurs de la plateforme peuvent le voir.
        </p>
        {!data && !err && <p className="muted small">Chargement…</p>}
        {data && rows.length === 0 && (
          <div className="set-empty"><strong>Aucun membre</strong><span>Seuls les responsables voient ce projet.</span></div>
        )}
        <ul className="pm-list">
          {rows.map((m) => (
            <li key={m.userId} className="pm-row">
              <Avatar member={person(m.userId)} name={person(m.userId) ? undefined : "Utilisateur"} size={30} />
              <span className="pm-who">
                <strong>{label(m.userId)}{m.userId === data.me && <span className="pm-you">Vous</span>}</strong>
                <small>{person(m.userId)?.email ? `${person(m.userId).email} · ` : ""}ajouté le {when(m.createdAt)}</small>
              </span>
              {canEdit && (
                <button type="button" className="icon-btn" aria-label={`Retirer ${label(m.userId)}`} disabled={busy} onClick={() => remove(m.userId)}>
                  <Icon name="close" size={16} />
                </button>
              )}
            </li>
          ))}
        </ul>

        {canEdit && (canList ? (
          <div className="pm-add">
            <select aria-label="Ajouter un membre" value={pick} disabled={busy || candidates.length === 0} onChange={(e) => setPick(e.target.value)}>
              <option value="">{candidates.length === 0 ? "Tous les utilisateurs sont déjà membres" : "Choisir une personne…"}</option>
              {candidates.map((m) => <option key={m.userId} value={m.userId}>{memberName(m)}</option>)}
            </select>
            <button type="button" disabled={busy || !pick} onClick={() => add(pick)}>Ajouter</button>
          </div>
        ) : (
          <p className="muted small" style={{ margin: "12px 0 0" }}>Vous n'avez pas le droit de lister les utilisateurs de l'organisation : impossible d'en ajouter d'ici.</p>
        ))}
      </section>
      )}
    </>
  );
}
