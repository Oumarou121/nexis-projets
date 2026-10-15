import { Router } from "express";
import { createHash, randomBytes } from "node:crypto";
import { db } from "../db.js";
import { UUID_RE, httpError, listOrgMembers, requirePermission } from "../auth.js";
import { unwrap } from "../util.js";
import { logActivity } from "../activity.js";
import { isEmail, sendMail } from "../mail.js";
import { buildGuestInvite } from "../emailTemplates.js";

// Gestion des invités d'un projet « public ». Monté sous .../projects/:projectId/guests, derrière
// projectGuard. Tout est réservé à projects.update : les adresses des invités sont des données personnelles.
// Le jeton d'invitation n'est jamais renvoyé par les listes et n'est jamais stocké en clair.

export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/; // 32 octets en base64url
export const hashToken = (token) => createHash("sha256").update(token).digest("hex");
const newToken = () => randomBytes(32).toString("base64url");

const MAX_GUESTS = 50;
const DEFAULT_DAYS = 30;

const status = (g) => (g.revoked_at ? "revoked" : g.expires_at && new Date(g.expires_at) <= new Date() ? "expired" : "active");
const toApi = (g) => ({
  id: g.id,
  email: g.email,
  status: status(g),
  createdAt: g.created_at,
  expiresAt: g.expires_at,
  lastAccessAt: g.last_access_at,
});
const COLS = "id, project_id, email, invited_by, created_at, expires_at, revoked_at, last_access_at";

/** Coupe tous les accès invités d'un projet (quand il quitte le niveau « public »). */
export async function revokeAllGuests(projectId) {
  const { error } = await db.from("project_guests").update({ revoked_at: new Date().toISOString() }).eq("project_id", projectId).is("revoked_at", null);
  if (error) console.error("[guests] révocation impossible :", error.message);
}

function appUrl() {
  const raw = process.env.APP_URL || process.env.CLIENT_ORIGIN?.split(",")[0] || "";
  const url = raw.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//.test(url)) throw httpError(500, "APP_URL n’est pas configuré sur le serveur.");
  return url;
}
// Le jeton est dans le FRAGMENT de l'URL (#/p/…) : il n'est jamais envoyé au serveur d'hébergement du
// client, ni inscrit dans ses journaux, ni transmis par l'en-tête Referer.
const linkFor = (token) => `${appUrl()}/#/p/${token}`;

function parseDays(raw) {
  if (raw === undefined) return DEFAULT_DAYS;
  if (raw === null) return null;
  if (!Number.isInteger(raw) || raw < 1 || raw > 365) throw httpError(400, "Durée invalide (1 à 365 jours, ou null pour illimitée).");
  return raw;
}

async function inviterName(req) {
  try {
    const m = (await listOrgMembers(req.auth, req.params.orgId)).find((x) => x.userId === req.auth.userId);
    return [m?.firstName, m?.lastName].filter(Boolean).join(" ").trim() || null;
  } catch {
    return null;
  }
}

/** Envoie l'invitation. Ne lève jamais : renvoie { emailSent, link? } (le lien n'est rendu que si l'e-mail n'est pas parti). */
async function deliver(req, guest, token, days) {
  const project = req.project.name;
  const link = linkFor(token);
  const who = await inviterName(req);
  const mail = buildGuestInvite({ who, project, link, days });
  try {
    const { sent } = await sendMail({
      to: guest.email,
      ...mail,
      idempotencyKey: `guest-${guest.id}-${hashToken(token).slice(0, 12)}`,
    });
    return sent ? { emailSent: true } : { emailSent: false, link };
  } catch (e) {
    return { emailSent: false, emailError: e.message, link };
  }
}

/** Crée ou renouvelle l'invitation de cette adresse : un NOUVEAU jeton remplace l'ancien (qui cesse de marcher). */
async function issue(req, email, days) {
  const token = newToken();
  const row = {
    token_hash: hashToken(token),
    invited_by: req.auth.userId,
    expires_at: days ? new Date(Date.now() + days * 86_400_000).toISOString() : null,
    revoked_at: null,
  };
  const existing = unwrap(await db.from("project_guests").select("id").eq("project_id", req.params.projectId).eq("email", email).maybeSingle());
  const guest = existing
    ? unwrap(await db.from("project_guests").update(row).eq("id", existing.id).select(COLS).single())
    : unwrap(await db.from("project_guests").insert({ project_id: req.params.projectId, email, ...row }).select(COLS).single());
  return { guest, token };
}

const router = Router({ mergeParams: true });
router.use(requirePermission("projects.update"));

router.get("/", async (req, res) => {
  const rows = unwrap(await db.from("project_guests").select(COLS).eq("project_id", req.params.projectId).order("created_at", { ascending: true }));
  res.set("Cache-Control", "no-store").json(rows.map(toApi));
});

router.post("/", async (req, res) => {
  if (req.project.visibility !== "public") throw httpError(400, "Passez d’abord le projet en « public » pour inviter des personnes extérieures.");
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  if (!isEmail(email)) throw httpError(400, "Adresse e-mail invalide.");
  const days = parseDays(req.body?.expiresInDays);
  const all = unwrap(await db.from("project_guests").select("id, email, revoked_at").eq("project_id", req.params.projectId));
  if (!all.some((g) => g.email === email) && all.filter((g) => !g.revoked_at).length >= MAX_GUESTS) {
    throw httpError(400, `Limite de ${MAX_GUESTS} invités atteinte pour ce projet.`);
  }
  appUrl(); // échoue tôt (500) si le serveur ne sait pas construire le lien, avant de créer quoi que ce soit
  const { guest, token } = await issue(req, email, days);
  await logActivity({
    orgId: req.params.orgId, actorId: req.auth.userId, action: "update", entityType: "project",
    entityId: req.project.id, projectId: req.project.id, label: req.project.name, details: { guest: "invited" },
  });
  res.status(201).json({ guest: toApi(guest), ...(await deliver(req, guest, token, days)) });
});

// Renvoyer l'invitation : nouveau jeton (l'ancien lien cesse de marcher) et nouveau délai.
router.post("/:guestId/resend", async (req, res) => {
  if (!UUID_RE.test(req.params.guestId)) throw httpError(404, "Invité introuvable.");
  if (req.project.visibility !== "public") throw httpError(400, "Le projet n’est plus public.");
  const found = unwrap(await db.from("project_guests").select(COLS).eq("id", req.params.guestId).eq("project_id", req.params.projectId).maybeSingle());
  if (!found) throw httpError(404, "Invité introuvable.");
  if (found.revoked_at) throw httpError(400, "Cette invitation a été révoquée : invitez de nouveau la personne.");
  const days = parseDays(req.body?.expiresInDays);
  appUrl();
  const { guest, token } = await issue(req, found.email, days);
  res.json({ guest: toApi(guest), ...(await deliver(req, guest, token, days)) });
});

router.delete("/:guestId", async (req, res) => {
  if (!UUID_RE.test(req.params.guestId)) throw httpError(404, "Invité introuvable.");
  const rows = unwrap(
    await db.from("project_guests").update({ revoked_at: new Date().toISOString() }).eq("id", req.params.guestId).eq("project_id", req.params.projectId).select("id"),
  );
  if (rows.length === 0) throw httpError(404, "Invité introuvable.");
  await logActivity({
    orgId: req.params.orgId, actorId: req.auth.userId, action: "update", entityType: "project",
    entityId: req.project.id, projectId: req.project.id, label: req.project.name, details: { guest: "revoked" },
  });
  res.status(204).end();
});

export default router;
