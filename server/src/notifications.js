import { db } from "./db.js";
import { listOrgMembers, lookupMemberEmail, serviceEmailEnabled } from "./auth.js";
import { escapeHtml, sendMail } from "./mail.js";
import { pushEnabled, sendPush } from "./push.js";

// Notifications dans l'application. notify() est le POINT D'ENTRÉE UNIQUE : les routes disent
// « il s'est passé ceci pour cette personne » ; les canaux (cloche aujourd'hui, e-mail et push plus tard)
// se décident ici et nulle part ailleurs. Canaux : cloche (toujours), e-mail, push (appareils enregistrés).
export const NOTIFICATION_TYPES = ["task_assigned", "project_member_added", "project_access_removed", "task_commented", "task_mentioned", "task_due_soon", "task_overdue"];

/**
 * Crée une notification. Ne fait JAMAIS échouer la requête appelante (comme logActivity).
 * Règles de sécurité appliquées ici, pas dans chaque route :
 *   - on ne notifie pas l'auteur de l'action ;
 *   - pour un projet privé, seul un membre du projet est notifié (jamais quelqu'un qui n'y a pas accès).
 * `title` est affiché tel quel : pas de HTML, texte court.
 * `collapseUnread` : s'il existe déjà une notification NON LUE du même type pour cette tâche et cette personne,
 *   on n'en crée pas de nouvelle (une rafale de commentaires = une seule alerte, un seul e-mail).
 * L'e-mail (si la personne ne l'a pas désactivé) est envoyé quand `auth` (req.auth de l'appelant) est fourni
 * OU quand `mail: true` (envoi automatique, sans appelant : rappels d'échéance). L'adresse vient d'abord de
 * NEXIS Identity en serveur à serveur (IDENTITY_MODULE_KEY) ; à défaut, du jeton de l'appelant (droit users.read).
 * Sans aucun des deux moyens, seule la cloche est alimentée.
 * L'e-mail part en arrière-plan : une lenteur ou un quota Resend ne ralentit ni ne fait échouer l'action.
 * @returns {Promise<boolean>} true si la notification a été créée.
 */
export async function notify({ orgId, userId, actorId = null, type, projectId = null, taskId = null, title, auth = null, mail = false, collapseUnread = false }) {
  try {
    if (!userId || userId === actorId) return false;
    if (!NOTIFICATION_TYPES.includes(type)) throw new Error(`type inconnu : ${type}`);
    if (projectId) {
      const { data: project } = await db.from("projects").select("id, visibility").eq("id", projectId).eq("organization_id", orgId).maybeSingle();
      if (!project) return false;
      if (project.visibility === "private") {
        const { data: member } = await db.from("project_members").select("user_id").eq("project_id", projectId).eq("user_id", userId).maybeSingle();
        if (!member) return false;
      }
    }
    if (collapseUnread && taskId) {
      const { data: open } = await db.from("notifications").select("id").eq("user_id", userId).eq("type", type).eq("task_id", taskId).is("read_at", null).limit(1);
      if (open?.length) return false;
    }
    const { data: created, error } = await db.from("notifications").insert({
      organization_id: orgId,
      user_id: userId,
      actor_id: actorId,
      type,
      project_id: projectId,
      task_id: taskId,
      title: String(title).slice(0, 200),
    }).select("id").single();
    if (error) {
      console.error("[notifications] écriture impossible :", error.message);
      return false;
    }
    if (auth || mail) track(emailNotification({ auth, orgId, userId, type, title: String(title).slice(0, 200), id: created?.id }));
    if (pushEnabled()) track(pushNotification({ userId, type, projectId, taskId, title: String(title).slice(0, 200), id: created?.id }));
    return true;
  } catch (e) {
    console.error("[notifications] écriture impossible :", e.message);
    return false;
  }
}

// ── Canal e-mail ────────────────────────────────────────────────────────────────────────────

const pending = new Set();
function track(promise) {
  pending.add(promise);
  promise.finally(() => pending.delete(promise));
}
/** Attend les envois d'e-mails en cours (utilisé par les tests ; le serveur n'en a pas besoin). */
export const idle = () => Promise.allSettled([...pending]);

/** Vrai sauf si la personne a désactivé les e-mails (pas de ligne = activés). */
export async function emailEnabled(userId) {
  const { data } = await db.from("notification_prefs").select("email_enabled").eq("user_id", userId).maybeSingle();
  return data?.email_enabled !== false;
}

/** Gabarit : l'objet et le texte sont le titre de la notification ; aucun contenu du projet n'est ajouté. */
export function renderEmail({ title }) {
  const url = (process.env.APP_URL ?? "").replace(/\/+$/, "");
  const link = /^https?:\/\//.test(url) ? url : "";
  const footer = "Vous recevez cet e-mail car vous avez une notification dans NEXIS Projets. Pour ne plus en recevoir par e-mail, décochez l’option dans le panneau des notifications (la cloche).";
  return {
    subject: title,
    text: `${title}\n\n${link ? `Ouvrir NEXIS Projets : ${link}\n\n` : ""}${footer}`,
    html: `<p style="font:15px/1.5 system-ui,sans-serif;margin:0 0 16px">${escapeHtml(title)}</p>${
      link ? `<p style="margin:0 0 24px"><a href="${escapeHtml(link)}" style="font:600 14px system-ui,sans-serif">Ouvrir NEXIS Projets</a></p>` : ""
    }<p style="font:12px/1.5 system-ui,sans-serif;color:#667;margin:0">${escapeHtml(footer)}</p>`,
  };
}

/** Adresse du destinataire : clé de module d'abord (pas besoin de droits), sinon annuaire via le jeton de l'appelant. */
async function recipientEmail({ auth, orgId, userId }) {
  if (serviceEmailEnabled()) {
    try {
      return await lookupMemberEmail(orgId, userId);
    } catch (e) {
      if (!auth) throw e;
      console.warn("[notifications] accès serveur à serveur indisponible, repli sur le jeton de l'appelant :", e.message);
    }
  }
  if (!auth) return null;
  const members = await listOrgMembers(auth, orgId);
  return members.find((m) => m.userId === userId)?.email ?? null;
}

async function emailNotification({ auth, orgId, userId, type, title, id }) {
  try {
    if (!(await emailEnabled(userId))) return;
    const to = await recipientEmail({ auth, orgId, userId });
    if (!to) return;
    await sendMail({ to, ...renderEmail({ type, title }), idempotencyKey: id ? `notification-${id}` : undefined });
  } catch (e) {
    // La cloche a déjà la notification : un e-mail raté (pas de droit, quota, panne) n'est qu'un avertissement.
    console.warn(`[notifications] e-mail non envoyé (${type}) :`, e.message);
  }
}

// ── Canal push ──────────────────────────────────────────────────────────────────────────────

/** Un push par appareil enregistré de la personne ; les jetons que FCM ne connaît plus sont supprimés. En arrière-plan, sans erreur. */
async function pushNotification({ userId, type, projectId, taskId, title, id }) {
  try {
    const { data: rows } = await db.from("push_tokens").select("token").eq("user_id", userId);
    for (const { token } of rows ?? []) {
      const r = await sendPush({ token, title: "NEXIS Projets", body: title, data: { type, projectId, taskId, notificationId: id } });
      if (r.invalid) await db.from("push_tokens").delete().eq("token", token);
    }
  } catch (e) {
    console.warn(`[notifications] push non envoyé (${type}) :`, e.message);
  }
}
