// Gérer ≠ contribuer : un contributeur (projects.update seul) ne modifie que SES tâches et ne s'assigne qu'à
// lui-même ; paramètres du projet, membres, invités, étapes et réassignations reviennent aux gestionnaires
// (projects.manage). Voir access.js.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { ORG, PROJECT, boot, uid } from "./helpers.js";

const MANAGER = 1;
const ME = 2; // contributeur
const COLLEAGUE = 3; // autre contributeur

const contributor = ["projects.read", "projects.update", "users.read"];
const access = {
  [uid(MANAGER)]: { platformAdmin: false, organizations: [{ organizationId: ORG, permissions: ["projects.read", "projects.update", "projects.manage", "users.read"] }] },
  [uid(ME)]: { platformAdmin: false, organizations: [{ organizationId: ORG, permissions: contributor }] },
  [uid(COLLEAGUE)]: { platformAdmin: false, organizations: [{ organizationId: ORG, permissions: contributor }] },
};

const T_COLLEAGUE = "55555555-5555-4555-8555-000000000001"; // créée par COLLEAGUE et assignée à lui
const T_FREE = "55555555-5555-4555-8555-000000000002"; // créée par COLLEAGUE, sans assigné
const T_MINE = "55555555-5555-4555-8555-000000000003"; // créée par ME, sans assigné

let app;
before(async () => {
  app = await boot({
    access,
    orgMembers: [uid(MANAGER), uid(ME), uid(COLLEAGUE)],
    seed: (store) => {
      store.projects.push({ id: PROJECT, organization_id: ORG, name: "Projet", visibility: "internal", created_by: uid(MANAGER) });
      store.tasks.push(
        { id: T_COLLEAGUE, project_id: PROJECT, title: "Tâche du collègue", status: "todo", created_by: uid(COLLEAGUE), assignee_id: uid(COLLEAGUE) },
        { id: T_FREE, project_id: PROJECT, title: "Tâche libre", status: "todo", created_by: uid(COLLEAGUE), assignee_id: null },
        { id: T_MINE, project_id: PROJECT, title: "Ma tâche", status: "todo", created_by: uid(ME), assignee_id: null },
      );
    },
  });
});
after(() => app?.stop());

const call = (...args) => app.call(...args);
const project = `/api/organizations/${ORG}/projects/${PROJECT}`;
const task = (id) => `${project}/tasks/${id}`;

describe("tâches : un contributeur ne touche qu'aux siennes", () => {
  test("modifier la tâche d'un autre → 403 ; un gestionnaire peut", async () => {
    assert.equal((await call("PATCH", task(T_COLLEAGUE), { as: ME, body: { title: "Renommée" } })).status, 403);
    assert.equal((await call("PATCH", task(T_COLLEAGUE), { as: ME, body: { status: "done" } })).status, 403);
    assert.equal((await call("PATCH", task(T_COLLEAGUE), { as: MANAGER, body: { title: "Renommée par le gestionnaire" } })).status, 200);
  });

  test("sa propre tâche : modifiable", async () => {
    assert.equal((await call("PATCH", task(T_MINE), { as: ME, body: { title: "Ma tâche, précisée", status: "in_progress" } })).status, 200);
  });

  test("prendre une tâche libre : permis, et elle devient la sienne", async () => {
    assert.equal((await call("PATCH", task(T_FREE), { as: ME, body: { title: "Pas encore à moi" } })).status, 403);
    assert.equal((await call("PATCH", task(T_FREE), { as: ME, body: { assigneeId: uid(ME) } })).status, 200);
    assert.equal((await call("PATCH", task(T_FREE), { as: ME, body: { title: "Maintenant à moi" } })).status, 200);
  });
});

describe("la tâche qu'on m'a assignée est la mienne", () => {
  test("statut, sous-tâches, activités, dépendances et temps : tout est permis à l'assigné", async () => {
    const t = await call("POST", `${project}/tasks`, { as: MANAGER, body: { title: "Confiée par le gestionnaire", assigneeId: uid(ME) } });
    assert.equal(t.status, 201);
    const id = t.json.id;
    assert.equal((await call("PATCH", task(id), { as: ME, body: { status: "in_progress" } })).status, 200);
    const sub = await call("POST", `${project}/tasks`, { as: ME, body: { title: "Sous-tâche de l'assigné", parentId: id } });
    assert.equal(sub.status, 201);
    assert.equal((await call("PATCH", task(sub.json.id), { as: ME, body: { status: "done" } })).status, 200);
    assert.equal((await call("POST", `${task(id)}/activities`, { as: ME, body: { type: "call", summary: "Appeler le client", assigneeId: uid(ME) } })).status, 201);
    assert.equal((await call("POST", `${task(id)}/dependencies`, { as: ME, body: { dependsOnId: T_MINE } })).status, 201);
    assert.equal((await call("POST", `${task(id)}/timesheets`, { as: ME, body: { date: "2026-10-22", duration: 60 } })).status, 201);
  });

  test("mais il ne la confie pas à quelqu'un d'autre, et ne la supprime pas (il ne l'a pas créée)", async () => {
    const t = await call("POST", `${project}/tasks`, { as: MANAGER, body: { title: "Autre tâche confiée", assigneeId: uid(ME) } });
    assert.equal((await call("PATCH", task(t.json.id), { as: ME, body: { assigneeId: uid(COLLEAGUE) } })).status, 403);
    assert.equal((await call("DELETE", task(t.json.id), { as: ME })).status, 403);
    assert.equal((await call("PATCH", task(t.json.id), { as: ME, body: { assigneeId: null } })).status, 200); // se désister : permis
  });
});

describe("assignation : répartir le travail revient aux gestionnaires", () => {
  test("un contributeur ne confie pas une tâche à quelqu'un d'autre", async () => {
    assert.equal((await call("PATCH", task(T_MINE), { as: ME, body: { assigneeId: uid(COLLEAGUE) } })).status, 403);
    assert.equal((await call("POST", `${project}/tasks`, { as: ME, body: { title: "Pour le collègue", assigneeId: uid(COLLEAGUE) } })).status, 403);
  });

  test("ni ne retire l'assigné d'une tâche qui n'est pas la sienne", async () => {
    assert.equal((await call("PATCH", task(T_COLLEAGUE), { as: ME, body: { assigneeId: null } })).status, 403);
  });

  test("il peut s'assigner à la création ; le gestionnaire assigne qui il veut", async () => {
    assert.equal((await call("POST", `${project}/tasks`, { as: ME, body: { title: "Pour moi", assigneeId: uid(ME) } })).status, 201);
    assert.equal((await call("PATCH", task(T_MINE), { as: MANAGER, body: { assigneeId: uid(COLLEAGUE) } })).status, 200);
  });
});

describe("suppression : créateur ou gestionnaire", () => {
  test("supprimer la tâche d'un autre → 403 ; la sienne → 204", async () => {
    assert.equal((await call("DELETE", task(T_COLLEAGUE), { as: ME })).status, 403);
    const mine = await call("POST", `${project}/tasks`, { as: ME, body: { title: "À supprimer" } });
    assert.equal((await call("DELETE", task(mine.json.id), { as: ME })).status, 204);
  });
});

describe("gestion du projet : réservée aux gestionnaires", () => {
  test("paramètres et visibilité", async () => {
    assert.equal((await call("PATCH", project, { as: ME, body: { visibility: "public" } })).status, 403);
    assert.equal((await call("PATCH", project, { as: ME, body: { name: "Autre nom" } })).status, 403);
    assert.equal((await call("PATCH", project, { as: MANAGER, body: { name: "Projet renommé" } })).status, 200);
  });

  test("membres, invités et étapes", async () => {
    assert.equal((await call("POST", `${project}/members`, { as: ME, body: { userId: uid(COLLEAGUE) } })).status, 403);
    assert.equal((await call("GET", `${project}/guests`, { as: ME })).status, 403);
    assert.equal((await call("POST", `${project}/stages`, { as: ME, body: { name: "Validation", category: "in_progress" } })).status, 403);
    assert.equal((await call("POST", `${project}/stages`, { as: MANAGER, body: { name: "Validation", category: "in_progress" } })).status, 201);
  });
});

describe("cohérence des étapes", () => {
  test("une nouvelle tâche va dans la 1re étape « À faire », même si une étape terminée est en tête", async () => {
    const { stages } = (await call("GET", `${project}/stages`, { as: MANAGER })).json;
    const done = stages.find((s) => s.category === "done");
    const ids = [done.id, ...stages.filter((s) => s.id !== done.id).map((s) => s.id)];
    assert.equal((await call("PUT", `${project}/stages/order`, { as: MANAGER, body: { ids } })).status, 200);
    const created = await call("POST", `${project}/tasks`, { as: ME, body: { title: "Nouvelle tâche" } });
    assert.equal(created.status, 201);
    assert.equal(created.json.status, "todo");
  });
});

describe("feuilles de temps et dépendances", () => {
  test("chacun son temps : saisir sur sa tâche, ne pas toucher au temps d'un autre", async () => {
    assert.equal((await call("POST", `${task(T_COLLEAGUE)}/timesheets`, { as: ME, body: { date: "2026-10-22", duration: 30 } })).status, 403);
    const entry = await call("POST", `${task(T_COLLEAGUE)}/timesheets`, { as: COLLEAGUE, body: { date: "2026-10-22", duration: 30 } });
    assert.equal(entry.status, 201);
    assert.equal((await call("PATCH", `${task(T_COLLEAGUE)}/timesheets/${entry.json.id}`, { as: MANAGER, body: { duration: 45 } })).status, 200);
    assert.equal((await call("DELETE", `${task(T_COLLEAGUE)}/timesheets/${entry.json.id}`, { as: ME })).status, 403);
  });

  test("durée en minutes entières : 1,5 → 400 (et non 500)", async () => {
    assert.equal((await call("POST", `${task(T_MINE)}/timesheets`, { as: MANAGER, body: { date: "2026-10-22", duration: 1.5 } })).status, 400);
  });

  test("dépendance en double → 400 « existe déjà » (et non 500)", async () => {
    const url = `${task(T_MINE)}/dependencies`;
    assert.equal((await call("POST", url, { as: MANAGER, body: { dependsOnId: T_COLLEAGUE } })).status, 201);
    const again = await call("POST", url, { as: MANAGER, body: { dependsOnId: T_COLLEAGUE } });
    assert.equal(again.status, 400);
    assert.match(again.json.error, /existe déjà/);
  });
});
