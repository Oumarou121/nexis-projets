import { db } from "./db.js";
import { lookupMemberEmail, serviceEmailEnabled } from "./auth.js";
import { sendMail } from "./mail.js";
import { digestHtml, taskUrl } from "./emailTemplates.js";
import { isOpenProject } from "./util.js";
import { addDays, appTz, localTime } from "./dates.js";

export { localTime };

// Résumé quotidien par e-mail : une fois par jour, à chaque personne qui a des tâches à suivre, ses tâches
// ASSIGNÉES en retard, pour aujourd'hui et des 3 prochains jours. Rien à signaler : pas d'e-mail.
//   DIGEST_HOUR   : heure locale d'envoi, 0-23 (8 par défaut). Si le serveur était arrêté, l'envoi a encore
//                   lieu pendant les 4 heures qui suivent ; au-delà, la journée est sautée.
//   APP_TZ        : fuseau IANA de cette heure et de « aujourd'hui », ex. Africa/Tunis (à défaut DIGEST_TZ, sinon UTC),
//                   le même que pour les rappels (dates.js). Projets terminés ou en pause : rien dans le résumé.
//   DAILY_DIGEST  : « off » désactive le résumé.
// Pas d'appelant : l'adresse est demandée à NEXIS Identity en serveur à serveur (IDENTITY_MODULE_KEY). Sans cette
// clé, rien n'est envoyé. Mêmes règles de visibilité que notify() : un projet privé n'apparaît que chez ses membres.
// Un seul envoi par personne, organisation et jour : la ligne digest_log est « réservée » AVANT l'envoi (clé
// primaire = verrou) et libérée si l'envoi échoue, pour qu'une passe suivante réessaie.
const MAX_LATE_DAYS = 30; // comme les rappels : au-delà, la tâche est abandonnée ou oubliée
const AHEAD_DAYS = 3;
const WINDOW_HOURS = 4;
const MAX_PER_SECTION = 10;

const fr = (day) => new Date(`${day}T00:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });

function config() {
  const tz = appTz();
  const raw = (process.env.DIGEST_HOUR ?? "").trim();
  const h = raw === "" ? NaN : Number(raw);
  return { tz, hour: Number.isInteger(h) && h >= 0 && h <= 23 ? h : 8 };
}

/** Gabarit : objet, texte et HTML. Les titres viennent des utilisateurs : échappés dans le HTML. */
export function renderDigest({ today, late, dueToday, soon, orgId }) {
  const url = (process.env.APP_URL ?? "").replace(/\/+$/, "");
  const link = /^https?:\/\//.test(url) ? url : "";
  const footer = "Vous recevez ce résumé car des tâches vous sont assignées dans NEXIS Projets. Pour ne plus le recevoir, décochez l’option dans le panneau des notifications (la cloche).";
  const sections = [
    { title: "En retard", items: late, withDate: true },
    { title: "Pour aujourd’hui", items: dueToday, withDate: false },
    { title: `À venir (${AHEAD_DAYS} prochains jours)`, items: soon, withDate: true },
  ].filter((s) => s.items.length > 0);

  const line = (t, withDate) => `« ${t.title} » · ${t.project}${withDate ? ` (échéance le ${fr(t.due)})` : ""}`;
  const shown = (s) => s.items.slice(0, MAX_PER_SECTION);
  const more = (s) => s.items.length - MAX_PER_SECTION;

  const parts = [];
  if (late.length) parts.push(`${late.length} en retard`);
  if (dueToday.length) parts.push(`${dueToday.length} pour aujourd’hui`);
  if (soon.length) parts.push(`${soon.length} à venir`);

  const text = [
    `Votre résumé du ${fr(today)}`,
    ...sections.flatMap((s) => [
      "",
      `${s.title} (${s.items.length})`,
      ...shown(s).map((t) => `- ${line(t, s.withDate)}`),
      ...(more(s) > 0 ? [`- … et ${more(s)} autre${more(s) > 1 ? "s" : ""}`] : []),
    ]),
    "",
    ...(link ? [`Ouvrir NEXIS Projets : ${link}`, ""] : []),
    footer,
  ].join("\n");

  const html = digestHtml({
    dateLabel: fr(today),
    summary: parts.join(", "),
    footer,
    sections: sections.map((s) => ({
      title: s.title,
      count: s.items.length,
      more: more(s),
      rows: shown(s).map((t) => ({ title: t.title, project: t.project, due: s.withDate ? fr(t.due) : "", url: taskUrl(orgId, t.id) })),
    })),
  });

  return { subject: `Résumé du ${fr(today)} : ${parts.join(", ")}`, text, html };
}

/** Réserve (personne, organisation, jour). false : déjà réservé (donc déjà envoyé) ou base en erreur. */
async function claim({ userId, orgId }, day) {
  const { error } = await db.from("digest_log").insert({ user_id: userId, organization_id: orgId, day });
  if (!error) return true;
  if (error.code !== "23505") console.error("[digest] réservation impossible :", error.message);
  return false;
}

const release = ({ userId, orgId }, day) =>
  db.from("digest_log").delete().eq("user_id", userId).eq("organization_id", orgId).eq("day", day).then(() => {}, () => {});

/** Une passe. Renvoie le nombre de résumés envoyés. Ne lève jamais. */
export async function runDailyDigests(now = new Date()) {
  let sent = 0;
  try {
    if (process.env.DAILY_DIGEST === "off" || !serviceEmailEnabled()) return 0;
    const { tz, hour } = config();
    const local = localTime(now, tz);
    if (local.hour < hour || local.hour >= hour + WINDOW_HOURS) return 0;
    const today = local.day;
    const last = addDays(today, AHEAD_DAYS);

    const { data: tasks, error } = await db
      .from("tasks")
      .select("id, title, assignee_id, due_date, project_id, is_milestone")
      .neq("status", "done")
      .gte("due_date", addDays(today, -MAX_LATE_DAYS))
      .lte("due_date", last)
      .limit(2000);
    if (error) throw new Error(error.message);
    const todo = (tasks ?? []).filter((t) => t.assignee_id && !t.is_milestone);
    if (todo.length === 0) return 0;

    const { data: projects } = await db
      .from("projects")
      .select("id, name, organization_id, visibility, status")
      .in("id", [...new Set(todo.map((t) => t.project_id))]);
    const projectOf = new Map((projects ?? []).map((p) => [p.id, p]));
    const privateIds = (projects ?? []).filter((p) => p.visibility === "private").map((p) => p.id);
    const members = new Set();
    if (privateIds.length) {
      const { data: rows } = await db.from("project_members").select("project_id, user_id").in("project_id", privateIds);
      for (const r of rows ?? []) members.add(`${r.project_id}:${r.user_id}`);
    }

    // Regroupement par personne ET organisation (l'adresse se demande par organisation).
    const groups = new Map();
    for (const t of todo) {
      const p = projectOf.get(t.project_id);
      if (!p || !isOpenProject(p.status)) continue;
      if (p.visibility === "private" && !members.has(`${p.id}:${t.assignee_id}`)) continue;
      const key = `${p.organization_id}:${t.assignee_id}`;
      if (!groups.has(key)) groups.set(key, { orgId: p.organization_id, userId: t.assignee_id, late: [], dueToday: [], soon: [] });
      const g = groups.get(key);
      const item = { id: t.id, title: t.title, project: p.name, due: t.due_date };
      (t.due_date < today ? g.late : t.due_date === today ? g.dueToday : g.soon).push(item);
    }
    if (groups.size === 0) return 0;

    const { data: prefs } = await db.from("notification_prefs").select("user_id, email_enabled, digest_enabled").in("user_id", [...new Set([...groups.values()].map((g) => g.userId))]);
    const off = new Set((prefs ?? []).filter((r) => r.email_enabled === false || r.digest_enabled === false).map((r) => r.user_id));

    await db.from("digest_log").delete().lt("day", addDays(today, -30)); // ménage : le verrou ne sert que le jour même

    const byDue = (a, b) => a.due.localeCompare(b.due) || a.title.localeCompare(b.title, "fr");
    for (const g of groups.values()) {
      if (off.has(g.userId)) continue;
      if (!(await claim(g, today))) continue;
      try {
        const to = await lookupMemberEmail(g.orgId, g.userId);
        if (!to) continue; // plus membre actif : rien à envoyer, la réservation reste (pas de nouvel essai aujourd'hui)
        for (const list of [g.late, g.dueToday, g.soon]) list.sort(byDue);
        await sendMail({ to, ...renderDigest({ today, ...g }), idempotencyKey: `digest-${g.orgId}-${g.userId}-${today}` });
        sent += 1;
      } catch (e) {
        await release(g, today);
        console.warn("[digest] e-mail non envoyé :", e.message);
        if (e.status === 503) break; // quota Resend atteint ou service en panne : inutile d'insister à chaque personne
      }
    }
  } catch (e) {
    console.error("[digest] passe interrompue :", e.message);
  }
  return sent;
}

/** Vérifie toutes les heures (et une fois au démarrage) ; l'envoi n'a lieu que dans la fenêtre horaire, une fois par jour. */
export function startDigest() {
  if (process.env.DAILY_DIGEST === "off") return null;
  const run = () => runDailyDigests().then((n) => n > 0 && console.log(`[digest] ${n} résumé(s) envoyé(s)`));
  setTimeout(run, 45_000).unref();
  const timer = setInterval(run, 3_600_000);
  timer.unref();
  return timer;
}
