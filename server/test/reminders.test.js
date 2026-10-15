// Rappels d'échéance : qui est prévenu, une seule fois, et jamais là où on n'a pas le droit.
import { after, before, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { ORG, boot, uid, ALL } from "./helpers.js";

const P_INT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const P_PRIV = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const A = 5; // assigné
const B = 6; // membre du projet privé
const NOW = new Date("2026-10-12T09:00:00Z");

let app;
let run;
const mine = (user, type) => app.store.notifications.filter((n) => n.user_id === uid(user) && (!type || n.type === type));
const task = (n, over) => ({ id: `bbbbbbbb-bbbb-4bbb-8bbb-${String(n).padStart(12, "0")}`, project_id: P_INT, title: `T${n}`, status: "todo", priority: "medium", assignee_id: uid(A), created_by: uid(B), labels: [], is_milestone: false, parent_id: null, due_date: null, ...over });

before(async () => {
  app = await boot({
    access: { [uid(A)]: { platformAdmin: false, organizations: [{ organizationId: ORG, permissions: ALL }] } },
    orgMembers: [A, B].map(uid),
    seed: (s) => {
      const project = (id, visibility) => ({ id, organization_id: ORG, name: id, visibility, status: "active", priority: "medium", created_by: uid(B) });
      s.projects.push(project(P_INT, "internal"), project(P_PRIV, "private"));
      s.project_members.push({ project_id: P_PRIV, user_id: uid(B), added_by: uid(B) });
      s.tasks.push(
        task(1, { due_date: "2026-10-13" }), // demain
        task(2, { due_date: "2026-10-12" }), // aujourd'hui
        task(3, { due_date: "2026-10-09" }), // en retard
        task(4, { due_date: "2026-10-13", status: "done" }), // terminée : rien
        task(5, { due_date: "2026-10-13", assignee_id: null }), // pas d'assigné : rien
        task(6, { due_date: "2026-10-20" }), // trop loin : rien
        task(7, { due_date: "2026-10-13", is_milestone: true }), // jalon : rien
        task(8, { due_date: "2026-08-01" }), // en retard depuis trop longtemps : rien
        task(9, { due_date: "2026-10-13", project_id: P_PRIV, assignee_id: uid(A) }), // assigné non membre du privé : rien
        task(10, { due_date: "2026-10-13", project_id: P_PRIV, assignee_id: uid(B) }), // membre du privé : prévenu
      );
    },
  });
  ({ runDueReminders: run } = await import("../src/reminders.js"));
  mock.method(console, "error", () => {});
});
after(() => {
  mock.restoreAll();
  app?.stop();
});

// La base simulée date les lignes avec l'heure réelle : on les recale sur l'heure simulée de la passe.
const stamped = new Set();
async function runAt(date) {
  const created = await run(date);
  for (const n of app.store.notifications) if (!stamped.has(n)) { n.created_at = date.toISOString(); stamped.add(n); }
  return created;
}
const days = (n) => new Date(NOW.getTime() + n * 86_400_000);

describe("rappels d'échéance", () => {
  test("une passe prévient les bonnes personnes, avec le bon type et le bon texte", async () => {
    assert.equal(await runAt(NOW), 4);
    assert.deepEqual(mine(A, "task_due_soon").map((n) => n.title).sort(), [`Échéance aujourd’hui : « T2 » (projet « ${P_INT} »)`, `Échéance demain : « T1 » (projet « ${P_INT} »)`]);
    assert.equal(mine(A, "task_overdue").length, 1);
    assert.ok(mine(A, "task_overdue")[0].title.startsWith("En retard (échéance le "));
    assert.equal(mine(B, "task_due_soon").length, 1, "membre d'un projet privé : prévenu");
    assert.equal(mine(A).filter((n) => n.project_id === P_PRIV).length, 0, "non membre d'un projet privé : rien");
    const n = mine(A, "task_due_soon")[0];
    assert.ok(n.project_id && n.task_id && n.actor_id === null);
  });

  test("terminée, sans assigné, trop lointaine, jalon ou en retard depuis plus de 30 jours : aucun rappel", () => {
    const titles = mine(A).map((n) => n.title).join("|");
    for (const t of ["T4", "T5", "T6", "T7", "T8"]) assert.ok(!titles.includes(`« ${t} »`), t);
  });

  test("une seconde passe ne recrée rien", async () => {
    assert.equal(await runAt(new Date(NOW.getTime() + 3_600_000)), 0);
  });

  test("une tâche dont l'échéance passe devient « en retard » ; le retard déjà signalé n'est pas relancé avant 7 jours", async () => {
    // 5 jours plus tard : T1, T2 (A) et T10 (B) sont en retard (nouveau type) ; T3 a été signalée il y a 5 jours.
    assert.equal(await runAt(days(5)), 3);
    assert.equal(mine(A, "task_overdue").length, 3);
    assert.equal(mine(B, "task_overdue").length, 1);
  });

  test("après 7 jours le retard est relancé, et une échéance atteinte est rappelée", async () => {
    // 8 jours plus tard : T3 relancée (signalée il y a 8 jours) + T6 arrive à échéance aujourd'hui.
    assert.equal(await runAt(days(8)), 2);
    assert.equal(mine(A, "task_overdue").filter((n) => n.title.includes("« T3 »")).length, 2);
    assert.ok(mine(A, "task_due_soon").some((n) => n.title === `Échéance aujourd’hui : « T6 » (projet « ${P_INT} »)`));
  });
});
