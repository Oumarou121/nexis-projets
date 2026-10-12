import { Router } from "express";
import { db } from "../db.js";
import { UUID_RE, httpError, requirePermission } from "../auth.js";
import { unwrap } from "../util.js";
import { getScope } from "../access.js";

// Monté sous /api/organizations/:orgId/notifications. Chacun ne voit et ne modifie que SES notifications.
// À la lecture, celles d'un projet privé que l'appelant ne voit plus (retiré des membres) sont masquées :
// une notification ne doit pas survivre à la perte d'accès.
const router = Router({ mergeParams: true });
router.use(requirePermission("projects.read"));

const COLS = "id, type, project_id, task_id, actor_id, title, created_at, read_at";
const toApi = (r) => ({
  id: r.id,
  type: r.type,
  projectId: r.project_id,
  taskId: r.task_id,
  actorId: r.actor_id,
  title: r.title,
  createdAt: r.created_at,
  read: !!r.read_at,
});

router.get("/", async (req, res) => {
  const scope = await getScope(req);
  // Les 100 plus récentes, filtrées ensuite : le compteur et la liste portent sur la même chose.
  const rows = unwrap(
    await db.from("notifications").select(COLS).eq("user_id", req.auth.userId).eq("organization_id", req.params.orgId).order("created_at", { ascending: false }).limit(100),
  ).filter((r) => !r.project_id || !scope.hiddenSet.has(r.project_id));
  res.set("Cache-Control", "no-store").json({
    unread: rows.filter((r) => !r.read_at).length,
    items: rows.slice(0, 30).map(toApi),
  });
});

// Préférences : recevoir ou non les notifications aussi par e-mail, et le résumé quotidien (e-mail également :
// couper les e-mails coupe donc aussi le résumé, quel que soit son réglage).
const PREFS = { email: "email_enabled", digest: "digest_enabled" };

router.get("/preferences", async (req, res) => {
  const row = unwrap(await db.from("notification_prefs").select("email_enabled, digest_enabled").eq("user_id", req.auth.userId).maybeSingle());
  res.set("Cache-Control", "no-store").json({ email: row?.email_enabled !== false, digest: row?.digest_enabled !== false });
});

router.put("/preferences", async (req, res) => {
  const body = req.body ?? {};
  const keys = Object.keys(PREFS).filter((k) => body[k] !== undefined);
  if (keys.length === 0 || keys.some((k) => typeof body[k] !== "boolean")) throw httpError(400, "Préférence invalide.");
  const exists = unwrap(await db.from("notification_prefs").select("user_id").eq("user_id", req.auth.userId).maybeSingle());
  const row = { ...Object.fromEntries(keys.map((k) => [PREFS[k], body[k]])), updated_at: new Date().toISOString() };
  unwrap(
    exists
      ? await db.from("notification_prefs").update(row).eq("user_id", req.auth.userId)
      : await db.from("notification_prefs").insert({ user_id: req.auth.userId, ...row }),
  );
  res.json(Object.fromEntries(keys.map((k) => [k, body[k]])));
});

// Appareils push : le client enregistre le jeton FCM de CE navigateur (après permission) et le retire à la désactivation.
// Le jeton est lié à la personne connectée ; s'il existait pour un autre compte (même navigateur), il change de propriétaire.
const TOKEN_RE = /^[\w:.\-]{20,4096}$/;
const pushToken = (req) => {
  const t = req.body?.token;
  if (typeof t !== "string" || !TOKEN_RE.test(t)) throw httpError(400, "Jeton push invalide.");
  return t;
};

router.put("/push-token", async (req, res) => {
  const token = pushToken(req);
  const row = { user_id: req.auth.userId, updated_at: new Date().toISOString() };
  const exists = unwrap(await db.from("push_tokens").select("token").eq("token", token).maybeSingle());
  unwrap(exists ? await db.from("push_tokens").update(row).eq("token", token) : await db.from("push_tokens").insert({ token, ...row }));
  res.status(204).end();
});

router.delete("/push-token", async (req, res) => {
  // Chacun ne retire que SES appareils.
  unwrap(await db.from("push_tokens").delete().eq("token", pushToken(req)).eq("user_id", req.auth.userId));
  res.status(204).end();
});

router.post("/read-all", async (req, res) => {
  unwrap(
    await db.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", req.auth.userId).eq("organization_id", req.params.orgId).is("read_at", null),
  );
  res.status(204).end();
});

router.post("/:id/read", async (req, res) => {
  if (!UUID_RE.test(req.params.id)) throw httpError(404, "Notification introuvable.");
  const rows = unwrap(
    await db.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", req.params.id).eq("user_id", req.auth.userId).eq("organization_id", req.params.orgId).select("id"),
  );
  if (rows.length === 0) throw httpError(404, "Notification introuvable.");
  res.status(204).end();
});

export default router;
