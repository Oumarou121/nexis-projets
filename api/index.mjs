// Point d'entrée Vercel : l'API Express tourne en fonction serverless. Toutes ses routes commencent par /api
// (vercel.json renvoie /api/* ici) ; le client est servi en statique sur le même domaine, donc sans CORS.
// Les minuteries de server/src/index.js (rappels, résumé) ne tournent pas ici : Supabase pg_cron appelle
// /api/cron/reminders et /api/cron/digest (migration 20261020090000_cron_jobs.sql).
import { missingEnv } from "../server/src/env.js";

const missing = missingEnv();
if (missing.length) {
  // Visible dans les journaux de la fonction ; chaque appel répond 500 tant que la configuration est incomplète.
  throw new Error(`Variables manquantes dans Vercel : ${missing.join(", ")} (voir DEPLOIEMENT.md, section Vercel)`);
}

const { app } = await import("../server/src/app.js");
export default app;
