import { Router } from "express";
import { db } from "../db.js";
import { createLimiter } from "../rateLimit.js";
import { TOKEN_RE, hashToken } from "./guests.js";

// PORTAIL DES INVITÉS — lecture seule, sans compte NEXIS.
// Le jeton arrive dans l'en-tête X-Portal-Token (jamais dans l'URL : pas de trace dans les journaux d'accès).
// Règles :
//  * jeton invalide, inconnu, révoqué, expiré, ou projet qui n'est plus « public » → la MÊME réponse 404 :
//    on ne révèle rien sur ce qui existe ;
//  * l'accès exige que le projet soit « public » à CHAQUE requête ;
//  * la réponse est une LISTE BLANCHE de champs : ni assignés, ni auteurs, ni descriptions de tâches,
//    ni étiquettes, ni pièces jointes, ni commentaires, ni temps passé. Tout champ ajouté plus tard à la
//    base reste donc invisible tant qu'on ne l'ajoute pas ici.
export const portalLimits = {
  failures: createLimiter({ windowMs: 10 * 60_000, max: 10 }), // jetons invalides par IP
  requests: createLimiter({ windowMs: 60_000, max: 120 }), // requêtes par IP
};

const router = Router();
const notFound = (res) => res.status(404).set("Cache-Control", "no-store").json({ error: "Ce lien n’est plus valide." });

router.get("/", async (req, res) => {
  res.set({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex", "Referrer-Policy": "no-referrer" });
  const ip = req.ip ?? "?";
  if (!portalLimits.requests.hit(ip) || portalLimits.failures.blocked(ip)) {
    return res.status(429).set("Retry-After", "60").json({ error: "Trop de requêtes, réessayez dans quelques minutes." });
  }
  const token = req.get("x-portal-token") ?? "";
  const fail = () => {
    portalLimits.failures.hit(ip);
    return notFound(res);
  };
  if (!TOKEN_RE.test(token)) return fail();

  const { data: guest } = await db.from("project_guests").select("id, project_id, email, expires_at, revoked_at, last_access_at").eq("token_hash", hashToken(token)).maybeSingle();
  if (!guest || guest.revoked_at || (guest.expires_at && new Date(guest.expires_at) <= new Date())) return fail();

  const { data: project } = await db.from("projects").select("id, name, description, status, due_date, color, visibility").eq("id", guest.project_id).maybeSingle();
  if (!project || project.visibility !== "public") return fail();

  const { data: rows, error } = await db
    .from("tasks")
    .select("id, title, status, priority, due_date, start_date, is_milestone, parent_id")
    .eq("project_id", project.id)
    .order("created_at", { ascending: true })
    .limit(1000);
  if (error) return res.status(500).json({ error: "Erreur serveur." });

  // Dernier accès, au plus une fois par 10 minutes (pas une écriture par requête).
  if (!guest.last_access_at || Date.now() - new Date(guest.last_access_at).getTime() > 600_000) {
    await db.from("project_guests").update({ last_access_at: new Date().toISOString() }).eq("id", guest.id);
  }

  const today = new Date().toISOString().slice(0, 10);
  const tasks = (rows ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    dueDate: t.due_date ?? null,
    startDate: t.start_date ?? null,
    isMilestone: !!t.is_milestone,
    parentId: t.parent_id ?? null,
  }));
  res.json({
    guest: { email: guest.email },
    project: { name: project.name, description: project.description ?? null, status: project.status, dueDate: project.due_date ?? null, color: project.color ?? null },
    stats: {
      total: tasks.length,
      done: tasks.filter((t) => t.status === "done").length,
      late: tasks.filter((t) => t.status !== "done" && t.dueDate && t.dueDate < today).length,
    },
    tasks,
  });
});

export default router;
