import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api.js";
import { ROLE_HINTS, ROLE_LABELS, orgBaseOf, roleRank, usePerms } from "./perms.js";
import { Avatar, Icon } from "./ui.jsx";
import { memberName } from "./labels.js";
import "./members.css";
import { confirmDialog } from "./confirm.jsx";

const when = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "");

/**
 * Onglet « Membres » des paramètres du projet.
 * Chaque membre a un RÔLE DANS LE PROJET (responsable, contributeur, observateur) ; son rôle effectif est le plus
 * élevé entre celui-ci et celui que lui donne l'organisation. Dans un projet privé, être membre ouvre aussi l'accès ;
 * dans un projet interne, tout le monde y accède déjà selon son rôle d'organisation.
 * `people` = membres de l'organisation (noms) ; `canList` = droit de les lister dans NEXIS Identity.
 */
const ROLES = ["manager", "contributor", "viewer"];
export default function ProjectMembers({ orgId, project, people, canList, onChange, onLeave, onBusy }) {
  const { canManage } = usePerms();
  const url = `/api/organizations/${orgId}/projects/${project.id}/members`;
  const [data, setData] = useState(null); // { visibility, me, members, assigneesWithoutAccess }
  const [pick, setPick] = useState("");
  const [pickRole, setPickRole] = useState("contributor");
  const [busy, setBusy] = useState(false);
  useEffect(() => { onBusy?.(busy); return () => onBusy?.(false); }, [busy, onBusy]); // verrouille la fermeture du modal parent
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
  // Rôle tenu de l'organisation (null si la personne n'est pas dans l'annuaire) : un rôle de projet plus bas est sans effet.
  const baseOf = (id) => (person(id) ? orgBaseOf(person(id).role) : null);
  const isOrgAdmin = (id) => baseOf(id) === "manager";
  const pickBase = pick ? baseOf(pick) : null;
  const roleOption = (r, base) => (
    <option key={r} value={r} disabled={!!base && roleRank(r) < roleRank(base)}>
      {ROLE_LABELS[r]}{base && roleRank(r) < roleRank(base) ? ` (déjà ${ROLE_LABELS[base].toLowerCase()} par l’organisation)` : ""}
    </option>
  );

  async function add(userId) {
    if (!userId) return;
    setBusy(true);
    try {
      await api(url, "POST", { userId, role: pickRole });
      setPick("");
      setPickRole("contributor");
      setErr("");
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(m, role) {
    if (role === m.role) return;
    const self = m.userId === data.me;
    // Dernier responsable nommé, ou soi-même : on prévient (les administrateurs restent responsables de tout).
    const lastManager = m.role === "manager" && rows.filter((x) => x.role === "manager").length === 1;
    if (self || lastManager) {
      const ok = await confirmDialog({
        tone: "warn", icon: "user",
        title: self ? "Changer votre propre rôle ?" : "Retirer le dernier responsable nommé ?",
        text: self
          ? "Vous pourriez ne plus pouvoir gérer ce projet (sauf si votre rôle dans l'organisation vous le permet)."
          : "Plus personne ne sera responsable de ce projet en particulier ; seuls les administrateurs de l'organisation pourront le gérer.",
        ok: "Changer le rôle",
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      await api(`${url}/${m.userId}`, "PATCH", { role });
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
    const cfg =
      self && isPrivate
        ? { tone: "danger", icon: "lock", title: "Vous retirer de ce projet privé ?", text: "Vous ne pourrez plus l’ouvrir tant qu’on ne vous aura pas ajouté de nouveau.", ok: "Me retirer" }
        : { tone: "warn", icon: "user", title: self ? "Vous retirer du projet ?" : "Retirer ce membre ?", text: self ? "Vous ne serez plus membre du projet." : "Il ne sera plus membre du projet.", ...(self ? {} : { chip: [label(userId), "Membre"] }), ok: self ? "Me retirer" : "Retirer" };
    await confirmDialog({
      ...cfg,
      run: async () => {
        try {
          await api(`${url}/${userId}`, "DELETE");
        } catch (e) {
          if (e.status !== 409 || !e.data?.openTasks) throw e;
          // Des tâches en cours : on demande quoi en faire (il ne les verra plus dans un projet privé).
          const n = e.data.openTasks;
          const choice = await confirmDialog({
            tone: "warn", icon: "user",
            title: `${label(userId)} a ${n} tâche${n > 1 ? "s" : ""} en cours`,
            text: "Il ne pourra plus les voir une fois retiré de ce projet privé.",
            select: { label: "Que faire de ces tâches ?", options: [{ value: "unassign", label: "Les désassigner (à réattribuer)" }, { value: "keep", label: "Les laisser à son nom (signalées)" }] },
            ok: "Retirer",
          });
          if (!choice) return;
          await api(`${url}/${userId}?${choice === "unassign" ? "unassign" : "keep"}=1`, "DELETE");
        }
        setErr("");
        if (self && isPrivate) return onLeave?.();
        await load();
      },
    });
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
              {canManage && canList && <button type="button" className="ghost" disabled={busy} onClick={() => add(id)}>Ajouter au projet</button>}
            </div>
          ))}
        </div>
      )}

      <section className="set-box">
        <h5 className="set-h">Membres du projet{data ? ` (${rows.length})` : ""}</h5>
        <p className="pm-note">
          {isPrivate ? (
            <>Ce projet est <b>privé</b> : seuls ses membres et les administrateurs de l'organisation peuvent le voir.</>
          ) : (
            <>Ce projet est <b>interne</b> : toute l'organisation y accède selon son rôle (contributeur, ou observateur pour la lecture seule). Les membres ci-dessous y ont un rôle propre, par exemple <b>responsable</b>.</>
          )}{" "}
          Un membre garde toujours le plus élevé de ses deux rôles : celui de l'organisation et celui du projet.
        </p>
        {data && isOrgAdmin(data.me) && (
          <p className="pm-note pm-admin">
            Vous êtes <b>administrateur de l'organisation</b> : vous gérez ce projet (membres, tâches, paramètres) même sans y être responsable,
            et un rôle plus bas dans le projet ne change rien. Les responsables nommés restent ceux qui le pilotent au quotidien.
          </p>
        )}
        {!data && !err && <p className="muted small">Chargement…</p>}
        {data && rows.length === 0 && (
          <div className="set-empty"><strong>Aucun membre</strong><span>{isPrivate ? "Seuls les administrateurs voient ce projet." : "Personne n'a de rôle particulier dans ce projet."}</span></div>
        )}
        <ul className="pm-list">
          {rows.map((m) => (
            <li key={m.userId} className="pm-row">
              <Avatar member={person(m.userId)} name={person(m.userId) ? undefined : "Utilisateur"} size={30} />
              <span className="pm-who">
                <strong>{label(m.userId)}{m.userId === data.me && <span className="pm-you">Vous</span>}</strong>
                <small>{person(m.userId)?.email ? `${person(m.userId).email} · ` : ""}ajouté le {when(m.createdAt)}</small>
              </span>
              {isOrgAdmin(m.userId) ? (
                // Responsable de tous les projets par son rôle d'organisation : un rôle de projet ne changerait rien.
                <span className="pm-tag" title="Administrateur de l’organisation : responsable de tous les projets, quel que soit son rôle ici.">Administrateur · responsable partout</span>
              ) : canManage ? (
                <select aria-label={`Rôle de ${label(m.userId)} dans le projet`} value={m.role ?? "contributor"} disabled={busy} title={ROLE_HINTS[m.role ?? "contributor"]} onChange={(e) => changeRole(m, e.target.value)}>
                  {ROLES.map((r) => roleOption(r, baseOf(m.userId)))}
                </select>
              ) : (
                <span className="muted small" title={ROLE_HINTS[m.role ?? "contributor"]}>{ROLE_LABELS[m.role ?? "contributor"]}</span>
              )}
              {canManage && (
                <button type="button" className="icon-btn" aria-label={`Retirer ${label(m.userId)}`} disabled={busy} onClick={() => remove(m.userId)}>
                  <Icon name="close" size={16} />
                </button>
              )}
            </li>
          ))}
        </ul>

        {canManage && (canList ? (
          <div className="pm-add">
            <select aria-label="Ajouter un membre" value={pick} disabled={busy || candidates.length === 0} onChange={(e) => {
              const id = e.target.value;
              setPick(id);
              const base = id ? baseOf(id) : null;
              if (base && base !== "manager" && roleRank(pickRole) < roleRank(base)) setPickRole(base);
            }}>
              <option value="">{candidates.length === 0 ? "Tous les utilisateurs sont déjà membres" : "Choisir une personne…"}</option>
              {candidates.map((m) => <option key={m.userId} value={m.userId}>{memberName(m)}{orgBaseOf(m.role) === "manager" ? " (administrateur)" : ""}</option>)}
            </select>
            {pickBase === "manager" ? (
              <span className="pm-tag">Responsable partout</span>
            ) : (
              <select aria-label="Rôle dans le projet" value={pickRole} disabled={busy} title={ROLE_HINTS[pickRole]} onChange={(e) => setPickRole(e.target.value)}>
                {ROLES.map((r) => roleOption(r, pickBase))}
              </select>
            )}
            <button type="button" disabled={busy || !pick} onClick={() => add(pick)}>Ajouter</button>
          </div>
        ) : (
          <p className="muted small" style={{ margin: "12px 0 0" }}>Vous n'avez pas le droit de lister les utilisateurs de l'organisation : impossible d'en ajouter d'ici.</p>
        ))}
      </section>
    </>
  );
}
