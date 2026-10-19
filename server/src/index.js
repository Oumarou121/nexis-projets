// Point d'entrée : vérifie l'environnement AVANT de charger l'application
// (auth.js lit certaines variables dès son import), puis démarre le serveur.
import { missingEnv } from "./env.js";

const missing = missingEnv();
for (const k of missing) console.error(`Variable manquante : ${k} (voir server/.env.example)`);
if (missing.length) process.exit(1);

const { app } = await import("./app.js");
const { startReminders } = await import("./reminders.js");
const { startDigest } = await import("./digest.js");
const port = Number(process.env.PORT) || 4000;
app.listen(port, () => console.log(`API NEXIS Projets sur :${port}`));
startReminders();
startDigest();
