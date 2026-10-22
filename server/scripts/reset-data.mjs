// Remet les données du module Projets à zéro : projets, étapes, tâches, commentaires, pièces jointes (table ET fichiers),
// notifications, jetons push, préférences, journal du résumé quotidien, étapes par défaut des organisations.
// Le schéma est conservé.
//
// Usage (depuis server/) :
//   node --env-file=.env scripts/reset-data.mjs --dry-run
//   node --env-file=.env scripts/reset-data.mjs
//
// Les journaux en ajout seulement (activity_log, task_status_history) ne peuvent pas être vidés avec la clé service_role :
// le script le détecte AVANT de supprimer quoi que ce soit et affiche le TRUNCATE à lancer dans le SQL Editor de Supabase.
// Relancez ensuite le script : il vide le bucket et les tables restantes.
//
// Arrêtez le serveur avant. À lancer avec la remise à zéro d'Identity (nexis-site/scripts/reset-data.mjs).
import { createInterface } from "node:readline/promises";
import { createClient } from "@supabase/supabase-js";

const dry = process.argv.includes("--dry-run");
const url = process.env.DATA_SUPABASE_URL;
const key = process.env.DATA_SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("DATA_SUPABASE_URL et DATA_SUPABASE_SERVICE_ROLE_KEY requis (--env-file=.env).");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });
const ref = new URL(url).hostname.split(".")[0];

// Enfants d'abord, puis parents. Colonne = n'importe quelle colonne non nulle (Supabase exige un filtre sur DELETE).
const TABLES = [
  ["notifications", "id"],
  ["push_tokens", "token"],
  ["notification_prefs", "user_id"],
  ["digest_log", "user_id"],
  ["activity_log", "id"],
  ["task_status_history", "id"],
  ["task_timesheets", "id"],
  ["task_dependencies", "id"],
  ["task_activities", "id"],
  ["task_attachments", "id"],
  ["task_comments", "id"],
  ["project_guests", "id"],
  ["project_members", "project_id"],
  ["tasks", "id"],
  ["project_stages", "id"],
  ["projects", "id"],
  ["organization_stage_templates", "id"], // étapes par défaut de chaque organisation Identity
];
const BUCKET = "task-attachments";

async function count(table) {
  const { count: n, error } = await db.from(table).select("*", { count: "exact", head: true });
  if (error) throw new Error(`${table} : ${error.message}`);
  return n ?? 0;
}
async function listFiles(prefix = "") {
  const files = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await db.storage.from(BUCKET).list(prefix, { limit: 100, offset });
    if (error) throw new Error(`${BUCKET} : ${error.message}`);
    for (const it of data) {
      const path = prefix ? `${prefix}/${it.name}` : it.name;
      if (it.id) files.push(path);
      else files.push(...(await listFiles(path)));
    }
    if (data.length < 100) return files;
  }
}

const isDenied = (e) => e && (e.code === "42501" || /permission denied/i.test(e.message || ""));

// Teste le droit DELETE sans rien supprimer : le filtre « colonne IS NULL » ne correspond à aucune ligne,
// mais Postgres vérifie le privilège avant d'exécuter.
async function canDelete(table, col) {
  const { error } = await db.from(table).delete().is(col, null);
  if (!error) return true;
  if (isDenied(error)) return false;
  throw new Error(`${table} : ${error.message}`);
}

function printTruncate(blocked) {
  console.error("\nCes tables sont des journaux en ajout seulement : la clé service_role n'a pas le droit d'y supprimer (voulu dans les migrations) :");
  for (const t of blocked) console.error(`  - ${t} (${counts[t]} ligne(s))`);
  console.error("\nRien n'a été supprimé. Dans Supabase, ouvrez SQL Editor sur CE projet (" + ref + ") et exécutez :\n");
  console.error("truncate table\n" + TABLES.map(([t]) => `  public.${t}`).join(",\n") + ";");
  console.error("\n(Le SQL Editor s'exécute avec le rôle postgres. TRUNCATE ne touche ni au schéma ni aux droits.)");
  console.error("Relancez ensuite ce script : il videra le bucket " + BUCKET + " et ce qui reste.");
}

console.log(`\nProjet Supabase : ${url}`);
console.log("Sera supprimé :");
const counts = {};
for (const [t] of TABLES) {
  counts[t] = await count(t);
  console.log(`  ${t} : ${counts[t]} ligne(s)`);
}
const files = await listFiles();
console.log(`  bucket ${BUCKET} : ${files.length} fichier(s)\n`);

// Tables non supprimables avec service_role ET non vides (une table déjà vide est simplement ignorée).
const skip = new Set();
const blocked = [];
for (const [t, col] of TABLES) {
  if (await canDelete(t, col)) continue;
  if (counts[t] > 0) blocked.push(t);
  else skip.add(t);
}

if (dry) {
  if (blocked.length) printTruncate(blocked);
  console.log("--dry-run : rien n'a été modifié.");
  process.exit(0);
}
if (blocked.length) {
  printTruncate(blocked);
  process.exit(1);
}
if (!process.stdin.isTTY) {
  console.error("Confirmation interactive impossible (pas de terminal). Abandon.");
  process.exit(1);
}
const rl = createInterface({ input: process.stdin, output: process.stdout });
const answer = (await rl.question(`Action IRRÉVERSIBLE. Tapez « ${ref} » (identifiant du projet Supabase) pour confirmer : `)).trim();
rl.close();
if (answer !== ref) {
  console.log("Confirmation incorrecte. Rien n'a été supprimé.");
  process.exit(1);
}

console.log("\nSuppression…");
for (let i = 0; i < files.length; i += 100) {
  const { error } = await db.storage.from(BUCKET).remove(files.slice(i, i + 100));
  if (error) throw new Error(`${BUCKET} : ${error.message}`);
}
console.log(`  bucket ${BUCKET} : ${files.length} fichier(s) supprimé(s)`);
for (const [t, col] of TABLES) {
  if (skip.has(t)) {
    console.log(`  ${t} : déjà vide (ignorée)`);
    continue;
  }
  const { error } = await db.from(t).delete().not(col, "is", null);
  if (isDenied(error)) {
    printTruncate([t]);
    process.exit(1);
  }
  if (error) throw new Error(`${t} : ${error.message}`);
  console.log(`  ${t} : vidée`);
}
console.log("\nTerminé.");
