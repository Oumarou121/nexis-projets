// Modèle mixte : rôle d'organisation + rôle DANS chaque projet (responsable, contributeur, observateur).
// Rôle effectif = le plus élevé des deux. Voir access.js et routes/members.js.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { ORG, boot, uid } from "./helpers.js";

const ADMIN = 1; // administrateur de l'organisation : responsable de tout
const CREATOR = 2; // rôle Manager : crée des projets
const USER = 3; // rôle Utilisateur : contributeur
const READER = 4; // rôle Lecture seule : observateur
const OUTSIDER = 5; // Utilisateur qui n'est membre d'aucun projet privé

const org = (permissions) => ({ platformAdmin: false, organizations: [{ organizationId: ORG, permissions }] });
const access = {
  [uid(ADMIN)]: org(["projects.read", "projects.create", "projects.update", "projects.delete", "projects.manage", "users.read"]),
  [uid(CREATOR)]: org(["projects.read", "projects.create", "projects.update", "users.read"]),
  [uid(USER)]: org(["projects.read", "projects.update", "users.read"]),
  [uid(READER)]: org(["projects.read"]),
  [uid(OUTSIDER)]: org(["projects.read", "projects.update"]),
};

const P_A = "66666666-6666-4666-8666-00000000000a"; // interne, USER y est nommé responsable
const P_B = "66666666-6666-4666-8666-00000000000b"; // interne, sans rôle particulier

let app;
before(async () => {
  app = await boot({
    access,
    orgMembers: [uid(ADMIN), uid(CREATOR), uid(USER), { id: uid(READER), role: "viewer" }],
    seed: (s) => {
      for (const id of [P_A, P_B]) s.projects.push({ id, organization_id: ORG, name: `Projet ${id.slice(-1)}`, visibility: "internal", created_by: uid(ADMIN) });
      s.project_members.push({ project_id: P_A, user_id: uid(USER), added_by: uid(ADMIN), role: "manager" });
    },
  });
});
after(() => app?.stop());

const call = (...args) => app.call(...args);
const projects = `/api/organizations/${ORG}/projects`;
const project = (id) => `${projects}/${id}`;
const roleIn = async (id, as) => (await call("GET", project(id), { as })).json.myRole;

describe("rôle effectif : le plus élevé entre organisation et projet", () => {
  test("un Utilisateur nommé responsable d'UN projet le gère, mais pas les autres", async () => {
    assert.equal(await roleIn(P_A, USER), "manager");
    assert.equal(await roleIn(P_B, USER), "contributor");
    assert.equal((await call("PATCH", project(P_A), { as: USER, body: { name: "Projet A renommé" } })).status, 200);
    assert.equal((await call("PATCH", project(P_B), { as: USER, body: { name: "Non" } })).status, 403);
  });

  test("l'administrateur est responsable partout ; la lecture seule est observatrice", async () => {
    assert.equal(await roleIn(P_B, ADMIN), "manager");
    assert.equal(await roleIn(P_B, READER), "viewer");
  });

  test("la liste des projets donne le rôle de chacun", async () => {
    const list = (await call("GET", projects, { as: USER })).json;
    assert.deepEqual(Object.fromEntries(list.map((p) => [p.id, p.myRole])), { [P_A]: "manager", [P_B]: "contributor" });
  });
});

describe("un Manager gère les projets qu'il crée, pas ceux des autres", () => {
  test("créateur → responsable de son projet ; contributeur ailleurs", async () => {
    const created = await call("POST", projects, { as: CREATOR, body: { name: "Projet du manager" } });
    assert.equal(created.status, 201);
    assert.equal(created.json.myRole, "manager");
    assert.equal((await call("PATCH", project(created.json.id), { as: CREATOR, body: { color: 2 } })).status, 200);
    assert.equal((await call("PATCH", project(P_B), { as: CREATOR, body: { color: 2 } })).status, 403);
  });

  test("créer un projet privé avec ses membres et leurs rôles, en une fois", async () => {
    const created = await call("POST", projects, {
      as: CREATOR,
      body: { name: "Projet RH", visibility: "private", members: [{ userId: uid(USER), role: "contributor" }, { userId: uid(READER), role: "viewer" }] },
    });
    assert.equal(created.status, 201);
    assert.equal(created.json.visibility, "private");
    const m = (await call("GET", `${project(created.json.id)}/members`, { as: CREATOR })).json.members;
    assert.deepEqual(Object.fromEntries(m.map((x) => [x.userId, x.role])), { [uid(CREATOR)]: "manager", [uid(USER)]: "contributor", [uid(READER)]: "viewer" });
    // Hors des membres et des administrateurs, il n'existe pas.
    assert.equal((await call("GET", project(created.json.id), { as: ADMIN })).status, 200);
    assert.equal((await call("GET", project(created.json.id), { as: OUTSIDER })).status, 404);
    assert.ok(!(await call("GET", projects, { as: OUTSIDER })).json.some((p) => p.id === created.json.id));
  });

  test("membre inconnu de l'organisation à la création → 400, et aucun projet créé", async () => {
    const before = (await call("GET", projects, { as: ADMIN })).json.length;
    const r = await call("POST", projects, { as: CREATOR, body: { name: "Projet raté", members: [{ userId: uid(42) }] } });
    assert.equal(r.status, 400);
    assert.equal((await call("GET", projects, { as: ADMIN })).json.length, before);
  });
});

describe("observateur : lire et commenter ; devenir contributeur dans un projet", () => {
  test("il commente mais ne crée pas de tâche ; promu contributeur, il en crée", async () => {
    const t = await call("POST", `${project(P_B)}/tasks`, { as: ADMIN, body: { title: "Tâche à commenter" } });
    assert.equal((await call("POST", `${project(P_B)}/tasks/${t.json.id}/comments`, { as: READER, body: { body: "Vu !" } })).status, 201);
    assert.equal((await call("POST", `${project(P_B)}/tasks`, { as: READER, body: { title: "Par l'observateur" } })).status, 403);
    assert.equal((await call("POST", `${project(P_B)}/members`, { as: ADMIN, body: { userId: uid(READER), role: "contributor" } })).status, 201);
    assert.equal(await roleIn(P_B, READER), "contributor");
    assert.equal((await call("POST", `${project(P_B)}/tasks`, { as: READER, body: { title: "Par le nouveau contributeur" } })).status, 201);
  });

  test("on ne confie pas une tâche à un observateur", async () => {
    const P_C = (await call("POST", projects, { as: ADMIN, body: { name: "Projet C" } })).json.id;
    const r = await call("POST", `${project(P_C)}/tasks`, { as: ADMIN, body: { title: "Pour l'observateur", assigneeId: uid(READER) } });
    assert.equal(r.status, 400);
    assert.match(r.json.error, /observatrice/);
  });
});

describe("membres : rôle dans le projet", () => {
  test("changer le rôle d'un membre : réservé au responsable", async () => {
    assert.equal((await call("PATCH", `${project(P_A)}/members/${uid(USER)}`, { as: CREATOR, body: { role: "viewer" } })).status, 403);
    assert.equal((await call("PATCH", `${project(P_A)}/members/${uid(USER)}`, { as: ADMIN, body: { role: "viewer" } })).status, 200);
    assert.equal(await roleIn(P_A, USER), "contributor"); // observateur dans le projet, mais contributeur par l'organisation
    assert.equal((await call("PATCH", `${project(P_A)}/members/${uid(USER)}`, { as: ADMIN, body: { role: "boss" } })).status, 400);
  });

  test("retirer d'un projet privé avec des tâches en cours : 409, puis désassigner sur demande", async () => {
    const p = (await call("POST", projects, { as: ADMIN, body: { name: "Projet privé", visibility: "private", members: [{ userId: uid(USER), role: "contributor" }] } })).json.id;
    const t = (await call("POST", `${project(p)}/tasks`, { as: ADMIN, body: { title: "En cours", assigneeId: uid(USER) } })).json;
    const ask = await call("DELETE", `${project(p)}/members/${uid(USER)}`, { as: ADMIN });
    assert.equal(ask.status, 409);
    assert.equal(ask.json.openTasks, 1);
    assert.equal((await call("DELETE", `${project(p)}/members/${uid(USER)}?unassign=1`, { as: ADMIN })).status, 204);
    const after = (await call("GET", `${project(p)}/tasks`, { as: ADMIN })).json.find((x) => x.id === t.id);
    assert.equal(after.assigneeId, null);
  });
});
