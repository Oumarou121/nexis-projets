// Point d'entrée : vérifie l'environnement AVANT de charger l'application
// (auth.js lit certaines variables dès son import), puis démarre le serveur.
//  * Serveur Node classique : écoute sur PORT et lance les minuteries des rappels et du résumé.
//  * Vercel (service « server » de vercel.json) : la plateforme reçoit l'application exportée et gère le port ;
//    pas de minuteries (les instances s'arrêtent entre deux requêtes) : Supabase pg_cron appelle /api/cron/*.
import { missingEnv } from "./env.js";

const missing = missingEnv();
for (const k of missing) console.error(`Variable manquante : ${k} (voir server/.env.example)`);
if (missing.length) {
  if (process.env.VERCEL) throw new Error(`Variables manquantes dans Vercel : ${missing.join(", ")} (voir DEPLOIEMENT.md, section 3 bis)`);
  process.exit(1);
}

const { app } = await import("./app.js");

if (!process.env.VERCEL) {
  const { startReminders } = await import("./reminders.js");
  const { startDigest } = await import("./digest.js");
  const port = Number(process.env.PORT) || 4000;
  app.listen(port, () => console.log(`API NEXIS Projets sur :${port}`));
  startReminders();
  startDigest();
}

export default app;
