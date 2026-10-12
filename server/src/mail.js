// Même forme que httpError d'auth.js, redéfinie ici : auth.js lit l'environnement Identity dès son import,
// ce qui rendrait ce module (et ses tests) dépendant de variables qui n'ont rien à voir avec les e-mails.
const httpError = (status, message) => Object.assign(new Error(message), { status });

// Envoi d'e-mails : point UNIQUE pour tout le module (invitations, notifications…).
// Fournisseur actuel : Resend (API REST, sans dépendance). Pour en changer, il suffit de réécrire
// sendMail() : les appelants ne connaissent ni Resend ni son format.
//
//   RESEND_API_KEY : clé API Resend (secret, serveur uniquement).
//   MAIL_FROM      : expéditeur sur un domaine VÉRIFIÉ chez Resend, ex. « NEXIS Projets <projets@votre-domaine.com> ».
//   Sans clé, rien n'est envoyé : le message est écrit dans la console (développement, tests).
//
// Limite du plan gratuit Resend : 100 e-mails par jour et 3 000 par mois (jour UTC). Au-delà, Resend
// répond 429 : on le signale proprement (503) au lieu de laisser croire que l'e-mail est parti.

const API = "https://api.resend.com/emails";
const EMAIL_RE = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;
const MAX_RECIPIENTS = 50;

/** Adresse e-mail plausible (même règle que sendMail). */
export const isEmail = (v) => typeof v === "string" && v.length <= 254 && EMAIL_RE.test(v);

/** Échappe une valeur insérée dans un gabarit HTML. */
export const escapeHtml = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function recipients(to) {
  const list = (Array.isArray(to) ? to : [to]).map((a) => String(a ?? "").trim());
  if (list.length === 0 || list.length > MAX_RECIPIENTS || !list.every((a) => EMAIL_RE.test(a))) {
    throw httpError(400, "Adresse e-mail invalide.");
  }
  return list;
}

/**
 * Envoie un e-mail.
 * @param {{ to: string|string[], subject: string, html?: string, text?: string, replyTo?: string, idempotencyKey?: string }} m
 * @returns {Promise<{ sent: boolean, id: string|null }>} sent=false : mode console (aucune clé configurée).
 * Lève une erreur HTTP : 400 (message invalide), 503 (quota Resend atteint ou service indisponible).
 */
export async function sendMail({ to, subject, html, text, replyTo, idempotencyKey }) {
  const list = recipients(to);
  // Un saut de ligne dans l'objet permettrait d'injecter des en-têtes : on le refuse.
  const subj = String(subject ?? "");
  if (!subj.trim() || /[\r\n]/.test(subj) || subj.length > 200) throw httpError(400, "Objet invalide.");
  if (!html && !text) throw httpError(400, "Message vide.");
  if (replyTo && !EMAIL_RE.test(replyTo)) throw httpError(400, "Adresse de réponse invalide.");

  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  if (!key || !from) {
    console.log(`[mail] (non envoyé : RESEND_API_KEY/MAIL_FROM absents) à ${list.join(", ")} — ${subj}\n${text ?? html}`);
    return { sent: false, id: null };
  }

  let res;
  try {
    res = await fetch(API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: JSON.stringify({ from, to: list, subject: subj, html, text, reply_to: replyTo }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    console.error("[mail] Resend injoignable :", e.message);
    throw httpError(503, "Envoi d’e-mail indisponible, réessayez plus tard.");
  }

  if (res.ok) return { sent: true, id: (await res.json().catch(() => ({}))).id ?? null };

  const detail = await res.text().catch(() => "");
  console.error(`[mail] Resend ${res.status} : ${detail.slice(0, 300)}`);
  if (res.status === 429) throw httpError(503, "Limite d’envoi d’e-mails atteinte (quota Resend), réessayez plus tard.");
  if (res.status >= 500) throw httpError(503, "Envoi d’e-mail indisponible, réessayez plus tard.");
  // 4xx : domaine non vérifié, clé invalide… c'est un problème de configuration, pas de l'utilisateur.
  throw httpError(500, "Envoi d’e-mail impossible (configuration du serveur).");
}
