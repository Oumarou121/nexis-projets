// Gabarits des e-mails de NEXIS Projets (notifications, rappels, résumé quotidien, invitation d'un invité).
// Mise en forme volontairement sobre : texte simple, un lien, une signature. Toute valeur venant d'un
// utilisateur passe par escapeHtml() avant d'entrer dans le HTML.
import { escapeHtml as h } from "./mail.js";

const FONT = "Arial,Helvetica,sans-serif";
const SIGN = "L’équipe NEXIS Projets";

export const appLink = () => {
  const u = (process.env.APP_URL ?? "").replace(/\/+$/, "");
  return /^https?:\/\//.test(u) ? u : "";
};

/** Lien direct vers une tâche : « #/o/<organisation>/t/<tâche> », résolu par l'application (voir client/src/deepLink.js). */
export const taskUrl = (orgId, taskId) => {
  const base = appLink();
  return base && orgId && taskId ? `${base}/#/o/${orgId}/t/${taskId}` : "";
};

const p = (html, style = "") => `<p style="margin:0 0 14px;${style}">${html}</p>`;
const a = (url, label) => `<a href="${h(url)}" style="color:#0b5cad">${h(label ?? url)}</a>`;

/** Enveloppe commune : police système, 580 px, signature et mention de bas de page. */
function shell({ body, footer = "" }) {
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:16px;background:#ffffff">
<div style="max-width:580px;font:15px/1.6 ${FONT};color:#222222">
${body}${p(`Cordialement,<br>${h(SIGN)}`, "margin-top:20px")}
${footer ? `<p style="margin:24px 0 0;padding-top:12px;border-top:1px solid #dddddd;font-size:12px;color:#666666">${h(footer)}</p>` : ""}
</div></body></html>`;
}

// ── 1. Notification et rappels d'échéance ───────────────────────────────────────────────────
const NOTIF_FOOTER = "Vous recevez cet e-mail car vous avez une notification dans NEXIS Projets. Pour ne plus en recevoir par e-mail, décochez l’option dans le panneau des notifications (la cloche).";

export function notificationHtml({ type, title, orgId, taskId }) {
  const link = appLink();
  const task = taskUrl(orgId, taskId);
  return shell({
    body:
      p("Bonjour,") +
      p(h(title)) +
      (task
        ? p(a(task, "Consulter la tâche dans NEXIS Projets"))
        : link && type !== "project_access_removed"
          ? p(`Pour en consulter le détail, ${a(link, "ouvrez NEXIS Projets")}.`)
          : ""),
    footer: NOTIF_FOOTER,
  });
}

// ── 2. Résumé quotidien ─────────────────────────────────────────────────────────────────────
/** sections : [{ title, count, rows: [{ title, project, due?, url? }], more }] ; url : lien direct vers la tâche. */
export function digestHtml({ dateLabel, summary, sections, footer }) {
  const link = appLink();
  const list = sections
    .map((s) => {
      const items = s.rows
        .map((r) => `<li style="margin:0 0 4px">${r.url ? a(r.url, `« ${r.title} »`) : h(`« ${r.title} »`)} · ${h(r.project)}${r.due ? ` (échéance le ${h(r.due)})` : ""}</li>`)
        .join("");
      const more = s.more > 0 ? `<li style="margin:0 0 4px">… et ${s.more} autre${s.more > 1 ? "s" : ""}</li>` : "";
      return `<p style="margin:16px 0 6px"><strong>${h(s.title)} (${s.count})</strong></p><ul style="margin:0 0 8px;padding-left:20px">${items}${more}</ul>`;
    })
    .join("");
  return shell({
    body:
      p("Bonjour,") +
      p(`Voici l’état de vos tâches au ${h(dateLabel)} : ${h(summary.replace(/\.$/, ""))}.`) +
      list +
      (link ? p(a(link, "Accéder à NEXIS Projets"), "margin-top:18px") : ""),
    footer,
  });
}

// ── 3. Invitation d'un invité (lecture seule) ───────────────────────────────────────────────
/** @returns {{ subject: string, text: string, html: string }} */
export function buildGuestInvite({ who, project, link, days }) {
  const name = String(project ?? "").replace(/[\r\n]+/g, " ");
  const intro = `${who ? `${who} vous invite` : "Vous êtes invité(e)"} à consulter le projet « ${project} » sur NEXIS Projets. L’accès se fait en lecture seule et ne nécessite pas de compte.`;
  const expiry = days ? ` Il est valable ${days} jour${days > 1 ? "s" : ""}.` : "";
  const foot = `Ce lien est personnel : merci de ne pas le transférer.${expiry} Si vous n’attendiez pas cette invitation, vous pouvez ignorer ce message.`;
  return {
    subject: `Invitation : projet « ${name} »`,
    text: `Bonjour,\n\n${intro}\n\nAccéder au projet : ${link}\n\n${foot}\n\nCordialement,\n${SIGN}`,
    html: shell({
      body: p("Bonjour,") + p(h(intro)) + p(a(link, "Accéder au projet")),
      footer: foot,
    }),
  };
}
