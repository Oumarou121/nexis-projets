// Point d'entrée : vérifie l'environnement AVANT de charger l'application
// (auth.js lit certaines variables dès son import), puis démarre le serveur.
for (const k of ["IDENTITY_SUPABASE_URL", "NEXIS_IDENTITY_URL", "DATA_SUPABASE_URL", "DATA_SUPABASE_SERVICE_ROLE_KEY"]) {
  if (!process.env[k]) {
    console.error(`Variable manquante : ${k} (voir server/.env.example)`);
    process.exit(1);
  }
}

const { app } = await import("./app.js");
const { startReminders } = await import("./reminders.js");
const { startDigest } = await import("./digest.js");
const port = Number(process.env.PORT) || 4000;
app.listen(port, () => console.log(`API NEXIS Projets sur :${port}`));
startReminders();
startDigest();
