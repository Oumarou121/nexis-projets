// Corrections de l'audit du module Projets : boucles de dépendances, pagination au-delà de 1000 lignes,
// règles de comptage communes, « aujourd'hui », projets clos, temps futur, historique des étapes,
// et demandes de réassignation.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { ORG, boot, uid } from "./helpers.js";

const ADMIN = 1; // responsable partout
const ALICE = 2; // contributrice
const BOB = 3; // contributeur
const READER = 4; // observateur

const org = (permissions) => ({ platformAdmin: false, organizations: [{ organizationId: ORG, permissions }] });
const access = {
  [uid(ADMIN)]: org(["projects.read", "projects.create", "projects.update", "projects.delete", "projects.manage", "users.read"]),
  [uid(ALICE)]: org(["projects.read", "projects.update", "users.read"]),
  [uid(BOB)]: org(["projects.read", "projects.update", "users.read"]),
  [uid(READER)]: org(["projects.read"]),
};

const BIG = "77777777-7777-4777-8777-000000000001"; // 1200 tâches
const CLOSED = "77777777-7777-4777-8777-000000000002"; // terminé, avec une tâche ouverte en retard
const P = "77777777-7777-4777-8777-000000000003"; // projet de travail
const task = (n) => `88888888-8888-4888-8888-${String(n).padStart(12, "0")}`;

let app;
before(async () => {
  app = await boot({
    access,
    orgMembers: [{ id: uid(ADMIN), role: "organization_admin" }, uid(ALICE), uid(BOB), { id: uid(READER), role: "viewer" }],
    seed: (s) => {
      s.projects.push(
        { id: BIG, organization_id: ORG, name: "Gros projet", visibility: "internal", status: "active", created_by: uid(ADMIN) },
        { id: CLOSED, organization_id: ORG, name: "Projet clos", visibility: "internal", status: "done", created_by: uid(ADMIN) },
        { id: P, organization_id: ORG, name: "Projet", visibility: "internal", status: "active", created_by: uid(ADMIN) },
      );
      for (let i = 0; i < 1200; i++) {
        s.tasks.push({ id: task(i), project_id: BIG, title: `T${i}`, status: i < 300 ? "done" : "todo", created_by: uid(ADMIN), created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString() });
      }
      // Sous-tâche et jalon : ni dans l'avancement du projet, ni dans ses retards.
      s.tasks.push(
        { id: task(5000), project_id: BIG, title: "Sous-tâche", status: "todo", parent_id: task(400), due_date: "2020-01-01", created_by: uid(ADMIN) },
        { id: task(5001), project_id: BIG, title: "Jalon", status: "todo", is_milestone: true, due_date: "2020-01-01", created_by: uid(ADMIN) },
        { id: task(6000), project_id: CLOSED, title: "Oubliée", status: "todo", due_date: "2020-01-01", assignee_id: uid(BOB), created_by: uid(ADMIN) },
      );
    },
  });
});
after(() => app?.stop());

const call = (...a) => app.call(...a);
const base = `/api/organizations/${ORG}`;
const tasks = (p = P) => `${base}/projects/${p}/tasks`;
const create = async (title, body = {}, as = ADMIN) => (await call("POST", tasks(), { as, body: { title, ...body } })).json;

describe("dépendances : pas de boucle", () => {
  test("A attend B : B ne peut plus attendre A, ni par un intermédiaire", async () => {
    const [a, b, c] = [await create("Tâche A"), await create("Tâche B"), await create("Tâche C")];
    const dep = (x, y) => call("POST", `${tasks()}/${x.id}/dependencies`, { as: ADMIN, body: { dependsOnId: y.id } });
    assert.equal((await dep(a, b)).status, 201);
    const direct = await dep(b, a);
    assert.equal(direct.status, 400);
    assert.match(direct.json.error, /mutuellement/);
    assert.equal((await dep(b, c)).status, 201); // A → B → C
    const indirect = await dep(c, a);
    assert.equal(indirect.status, 400);
    assert.match(indirect.json.error, /boucle/);
    assert.equal((await dep(a, b)).status, 400, "doublon : message clair, pas une erreur 500");
  });
});

describe("chiffres : au-delà de 1000 tâches, et mêmes règles partout", () => {
  test("la liste des tâches et la page Projets voient les 1200 tâches", async () => {
    assert.equal((await call("GET", tasks(BIG), { as: ADMIN })).json.length, 1202);
    const p = (await call("GET", `${base}/projects`, { as: ADMIN })).json.find((x) => x.id === BIG);
    assert.equal(p.taskCount, 1200, "tâches principales hors jalons");
    assert.equal(p.doneCount, 300);
    assert.equal(p.lateCount, 0, "la sous-tâche et le jalon en retard ne comptent pas");
    assert.equal(p.allCount, 1202, "ce que supprimerait la suppression du projet");
  });

  test("le tableau de bord compte comme la page Projets ; un projet clos n'a pas de retard", async () => {
    const d = (await call("GET", `${base}/dashboard`, { as: ADMIN })).json;
    assert.ok(d.tasksTotal >= 1201, "1200 + la tâche du projet clos (+ celles des autres tests)");
    assert.equal(d.lateTasks, 0);
    assert.ok(!d.workload.some((w) => w.userId === uid(BOB) && w.late > 0), "la tâche du projet clos n'est pas une charge en retard");
    const closed = (await call("GET", `${base}/projects`, { as: ADMIN })).json.find((x) => x.id === CLOSED);
    assert.equal(closed.lateCount, 0);
  });

  test("« aujourd'hui » : celui du navigateur (en-tête), s'il est plausible", async () => {
    const day = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
    await create("Due aujourd’hui (UTC)", { dueDate: day(0) });
    const late = async (today) => (await call("GET", `${base}/projects`, { as: ADMIN, headers: { "X-Nexis-Today": today } })).json.find((x) => x.id === P).lateCount;
    assert.equal(await late(day(0)), 0);
    assert.equal(await late(day(1)), 1, "navigateur déjà au lendemain (fuseau en avance) : la tâche est en retard");
    assert.equal(await late("2999-01-01"), 0, "date invraisemblable : ignorée");
  });
});

describe("temps saisi et étapes", () => {
  test("pas de temps daté dans le futur", async () => {
    const t = await create("Avec du temps", { assigneeId: uid(ADMIN) });
    const r = await call("POST", `${tasks()}/${t.id}/timesheets`, { as: ADMIN, body: { date: "2999-01-01", duration: 30 } });
    assert.equal(r.status, 400);
    assert.match(r.json.error, /futur/);
  });

  test("changer la catégorie d'une étape écrit l'historique des tâches qu'elle contient", async () => {
    const stages = (await call("GET", `${base}/projects/${P}/stages`, { as: ADMIN })).json.stages;
    const review = stages.find((s) => s.name === "En revue");
    const t = await create("En revue", { stageId: review.id });
    const before = app.store.task_status_history.filter((h) => h.task_id === t.id).length;
    assert.equal((await call("PATCH", `${base}/projects/${P}/stages/${review.id}`, { as: ADMIN, body: { category: "done" } })).status, 200);
    const rows = app.store.task_status_history.filter((h) => h.task_id === t.id);
    assert.equal(rows.length, before + 1);
    assert.equal(rows.at(-1).status, "done");
  });

  test("enregistrer le modèle d'étapes remplace l'ancien sans le perdre en route", async () => {
    const set = (names) => call("PUT", `${base}/stage-template`, { as: ADMIN, body: { stages: names.map((name, i) => ({ name, category: i === 0 ? "todo" : i === names.length - 1 ? "done" : "in_progress" })) } });
    assert.equal((await set(["Idée", "Fait"])).status, 200);
    assert.equal((await set(["Backlog", "En cours", "Livré"])).status, 200);
    assert.deepEqual(app.store.organization_stage_templates.filter((r) => r.organization_id === ORG).map((r) => r.name).sort(), ["Backlog", "En cours", "Livré"]);
  });
});

describe("demande de réassignation", () => {
  const req = (t) => `${tasks()}/${t.id}/reassign-requests`;
  const notes = (who, type) => app.store.notifications.filter((n) => n.user_id === uid(who) && n.type === type);

  test("l'assignée demande ; seul un responsable accepte, en confiant la tâche à la personne suggérée", async () => {
    const t = await create("Trop pour moi", { assigneeId: uid(ALICE) });
    assert.equal((await call("POST", req(t), { as: BOB, body: { reason: "Je veux la donner" } })).status, 403, "pas l'assigné");
    assert.equal((await call("POST", req(t), { as: ALICE, body: { reason: "x" } })).status, 400, "raison trop courte");
    assert.equal((await call("POST", req(t), { as: ALICE, body: { reason: "Surcharge", suggestedUserId: uid(READER) } })).status, 400, "pas à un observateur");
    const asked = await call("POST", req(t), { as: ALICE, body: { reason: "Je suis en congé la semaine prochaine", suggestedUserId: uid(BOB) } });
    assert.equal(asked.status, 201);
    assert.equal((await call("POST", req(t), { as: ALICE, body: { reason: "Encore une fois" } })).status, 409, "une seule en attente");
    assert.equal(notes(ADMIN, "task_reassign_requested").length, 1, "le responsable est prévenu");
    assert.equal((await call("GET", tasks(), { as: ADMIN })).json.find((x) => x.id === t.id).reassignRequestedBy, uid(ALICE));

    assert.equal((await call("POST", `${req(t)}/${asked.json.id}/accept`, { as: BOB, body: {} })).status, 403, "un contributeur ne décide pas");
    const ok = await call("POST", `${req(t)}/${asked.json.id}/accept`, { as: ADMIN, body: {} });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.assigneeId, uid(BOB));
    assert.equal(app.store.tasks.find((x) => x.id === t.id).assignee_id, uid(BOB));
    assert.equal(notes(ALICE, "task_reassign_answered").length, 1);
    assert.ok(notes(BOB, "task_assigned").some((n) => n.task_id === t.id));
    assert.equal((await call("POST", `${req(t)}/${asked.json.id}/decline`, { as: ADMIN, body: {} })).status, 409, "déjà traitée");
    assert.equal((await call("GET", req(t), { as: ALICE })).json.pending, null);
  });

  test("refus avec un message ; annulation par le demandeur ; réassignation directe qui clôt la demande", async () => {
    const t = await create("Gardée", { assigneeId: uid(ALICE) });
    const a = (await call("POST", req(t), { as: ALICE, body: { reason: "Pas le temps" } })).json;
    const no = await call("POST", `${req(t)}/${a.id}/decline`, { as: ADMIN, body: { note: "Priorité de l'équipe" } });
    assert.equal(no.status, 200);
    assert.equal(no.json.request.status, "declined");
    assert.equal(app.store.tasks.find((x) => x.id === t.id).assignee_id, uid(ALICE));

    const b = (await call("POST", req(t), { as: ALICE, body: { reason: "Toujours pas le temps" } })).json;
    assert.equal((await call("DELETE", `${req(t)}/${b.id}`, { as: BOB })).status, 403);
    assert.equal((await call("DELETE", `${req(t)}/${b.id}`, { as: ALICE })).status, 204);

    const c = (await call("POST", req(t), { as: ALICE, body: { reason: "Dernière demande" } })).json;
    assert.equal((await call("PATCH", `${tasks()}/${t.id}`, { as: ADMIN, body: { assigneeId: uid(BOB) } })).status, 200);
    assert.equal(app.store.task_reassign_requests.find((r) => r.id === c.id).status, "accepted");
  });
});
