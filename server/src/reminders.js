import { db } from "./db.js";
import { notify } from "./notifications.js";

// Rappels d'échéance, dans la cloche. Une passe horaire :
//   - « échéance demain » (ou aujourd'hui) : task_due_soon, une fois par tâche et par personne ;
//   - « en retard » : task_overdue, au plus une fois tous les 7 jours tant que la tâche reste en retard.
// Seul l'ASSIGNÉ est prévenu, et notify() applique ses règles habituelles (projet privé : membres seulement).
// E-mail : un rappel automatique n'a pas d'appelant ; l'adresse est retrouvée chez NEXIS Identity en
// serveur à serveur (IDENTITY_MODULE_KEY). Sans cette clé, seule la cloche est alimentée.
// Les dates sont en UTC. Une seule instance du serveur doit lancer ces passes (sinon doublons possibles).
const DAY = 86_400_000;
const iso = (d) => d.toISOString().slice(0, 10);
const fr = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
const MAX_LATE_DAYS = 30; // au-delà, on ne relance plus : la tâche est abandonnée ou oubliée de toute façon

/** Une passe. Renvoie le nombre de notifications créées. Ne lève jamais. */
export async function runDueReminders(now = new Date()) {
  let created = 0;
  try {
    const today = iso(now);
    const tomorrow = iso(new Date(now.getTime() + DAY));
    const oldest = iso(new Date(now.getTime() - MAX_LATE_DAYS * DAY));
    const { data: tasks, error } = await db
      .from("tasks")
      .select("id, title, assignee_id, due_date, project_id, status, is_milestone")
      .neq("status", "done")
      .gte("due_date", oldest)
      .lte("due_date", tomorrow)
      .limit(2000);
    if (error) throw new Error(error.message);
    const todo = (tasks ?? []).filter((t) => t.assignee_id && !t.is_milestone);
    if (todo.length === 0) return 0;

    const { data: projects } = await db.from("projects").select("id, organization_id").in("id", [...new Set(todo.map((t) => t.project_id))]);
    const orgOf = new Map((projects ?? []).map((p) => [p.id, p.organization_id]));

    for (const t of todo) {
      const orgId = orgOf.get(t.project_id);
      if (!orgId) continue;
      const late = t.due_date < today;
      const type = late ? "task_overdue" : "task_due_soon";
      // Déjà rappelé récemment ? (retard : 7 jours ; échéance proche : 2 jours, soit toute la période concernée)
      const since = new Date(now.getTime() - (late ? 7 : 2) * DAY).toISOString();
      const { data: seen } = await db.from("notifications").select("id").eq("user_id", t.assignee_id).eq("type", type).eq("task_id", t.id).gte("created_at", since).limit(1);
      if (seen?.length) continue;
      const title = late
        ? `En retard (échéance le ${fr(t.due_date)}) : « ${t.title} »`
        : `Échéance ${t.due_date === today ? "aujourd’hui" : "demain"} : « ${t.title} »`;
      if (await notify({ orgId, userId: t.assignee_id, actorId: null, type, projectId: t.project_id, taskId: t.id, title, mail: true })) created += 1;
    }
  } catch (e) {
    console.error("[reminders] passe interrompue :", e.message);
  }
  return created;
}

/** Lance les passes toutes les heures (et une au démarrage). REMINDERS=off les désactive. */
export function startReminders() {
  if (process.env.REMINDERS === "off") return null;
  const run = () => runDueReminders().then((n) => n > 0 && console.log(`[reminders] ${n} rappel(s) créé(s)`));
  setTimeout(run, 30_000).unref();
  const timer = setInterval(run, 3_600_000);
  timer.unref();
  return timer;
}
