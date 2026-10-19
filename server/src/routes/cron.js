import { createHash, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { runDueReminders } from "../reminders.js";
import { runDailyDigests } from "../digest.js";

// TÂCHES PLANIFIÉES — pour un hébergement serverless (Vercel), où les minuteries du processus ne tournent pas.
// Supabase pg_cron appelle ces routes toutes les heures (migration 20261020090000_cron_jobs.sql), avec
// l'en-tête « Authorization: Bearer <CRON_SECRET> ». Sans CRON_SECRET côté serveur, les routes restent fermées.
// Appels successifs sans doublon : le résumé est réservé par (personne, organisation, jour) en base, et un rappel
// n'est pas recréé s'il existe déjà sur la période. Deux appels SIMULTANÉS pourraient doubler un rappel : un seul
// planificateur doit appeler ces routes.

const digestOf = (value) => createHash("sha256").update(String(value)).digest();

/** Comparaison à temps constant (les empreintes ont toujours la même longueur). */
function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32) return false;
  const header = req.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  return timingSafeEqual(digestOf(given), digestOf(secret));
}

const router = Router();

router.use((req, res, next) => {
  if (!authorized(req)) return res.status(401).set("Cache-Control", "no-store").json({ error: "Non autorisé." });
  next();
});

router.post("/reminders", async (_req, res) => {
  const created = await runDueReminders();
  res.set("Cache-Control", "no-store").json({ ok: true, created });
});

router.post("/digest", async (_req, res) => {
  const sent = await runDailyDigests();
  res.set("Cache-Control", "no-store").json({ ok: true, sent });
});

export default router;
