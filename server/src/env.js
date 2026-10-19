// Variables sans lesquelles l'API ne peut pas fonctionner (auth.js en lit certaines dès son import) :
// vérifiées AVANT de charger l'application, par le serveur Node (index.js) comme par la fonction Vercel (api/index.mjs).
export const REQUIRED_ENV = ["IDENTITY_SUPABASE_URL", "NEXIS_IDENTITY_URL", "DATA_SUPABASE_URL", "DATA_SUPABASE_SERVICE_ROLE_KEY"];

/** Noms des variables obligatoires absentes. */
export const missingEnv = (env = process.env) => REQUIRED_ENV.filter((k) => !env[k]);
