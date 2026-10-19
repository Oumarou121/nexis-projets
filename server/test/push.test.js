// Notifications push : enregistrement des appareils, envoi à chaque appareil de la personne notifiée,
// nettoyage des jetons périmés, et mêmes règles de visibilité que la cloche.
import { after, before, describe, test, mock } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { ORG, boot, uid } from "./helpers.js";

const P_INT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const P_PRIV = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const T_INT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const T_PRIV = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
const AUTHOR = 6;
const ME = 5; // destinataire, hors du projet privé
const MEMBER = 7; // membre du projet privé
const tok = (s) => `tok-${s}-`.padEnd(40, "x");

const org = (permissions) => ({ platformAdmin: false, organizations: [{ organizationId: ORG, permissions }] });
const access = Object.fromEntries([AUTHOR, ME, MEMBER].map((n) => [uid(n), org(["projects.read", "projects.update", "projects.create", "users.read"])]));
const projects = `/api/organizations/${ORG}/projects`;
const notifs = `/api/organizations/${ORG}/notifications`;

let app, idle;
const sent = [];
let failWith = null; // jeton → statut FCM à renvoyer
const realFetch = globalThis.fetch;

before(async () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
  process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({ client_email: "svc@nexis-projets.iam.gserviceaccount.com", private_key: privateKey, project_id: "nexis-projets" });
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "ya29.test", expires_in: 3600 });
    if (u === "https://fcm.googleapis.com/v1/projects/nexis-projets/messages:send") {
      const m = JSON.parse(init.body).message;
      assert.equal(init.headers.Authorization, "Bearer ya29.test");
      sent.push(m);
      const status = failWith?.[m.token];
      if (status) return Response.json({ error: { status: "NOT_FOUND", message: "unregistered", details: [{ errorCode: "UNREGISTERED" }] } }, { status });
      return Response.json({ name: "projects/nexis-projets/messages/1" });
    }
    return realFetch(url, init);
  };
  app = await boot({
    access,
    orgMembers: [AUTHOR, ME, MEMBER].map(uid),
    seed: (s) => {
      const project = (id, name, visibility) => ({ id, organization_id: ORG, name, visibility, status: "active", priority: "medium", created_by: uid(AUTHOR) });
      s.projects.push(project(P_INT, "Ouvert", "internal"), project(P_PRIV, "Secret", "private"));
      for (const u of [AUTHOR, MEMBER]) s.project_members.push({ project_id: P_PRIV, user_id: uid(u), added_by: uid(AUTHOR) });
      const task = (id, project_id, title) => ({ id, project_id, title, assignee_id: null, status: "todo", priority: "medium", labels: [], created_by: uid(AUTHOR) });
      s.tasks.push(task(T_INT, P_INT, "Tâche ouverte"), task(T_PRIV, P_PRIV, "Plan secret"));
    },
  });
  idle = (await import("../src/notifications.js")).idle;
});
after(() => {
  globalThis.fetch = realFetch;
  delete process.env.FIREBASE_SERVICE_ACCOUNT;
  app?.stop();
});

const assign = (task, project, to) => app.call("PATCH", `${projects}/${project}/tasks/${task}`, { as: AUTHOR, body: { assigneeId: uid(to) } });

describe("enregistrement des appareils", () => {
  test("jeton invalide → 400 ; valide → 204 ; réenregistré ou repris par un autre compte → une seule ligne", async () => {
    assert.equal((await app.call("PUT", `${notifs}/push-token`, { as: ME, body: { token: "court" } })).status, 400);
    assert.equal((await app.call("PUT", `${notifs}/push-token`, { as: ME })).status, 400);
    assert.equal((await app.call("PUT", `${notifs}/push-token`, { as: ME, body: { token: tok("a") } })).status, 204);
    assert.equal((await app.call("PUT", `${notifs}/push-token`, { as: ME, body: { token: tok("a") } })).status, 204);
    assert.equal(app.store.push_tokens.length, 1);
    await app.call("PUT", `${notifs}/push-token`, { as: MEMBER, body: { token: tok("a") } });
    assert.deepEqual(app.store.push_tokens.map((r) => r.user_id), [uid(MEMBER)]);
    await app.call("PUT", `${notifs}/push-token`, { as: ME, body: { token: tok("a") } });
  });

  test("on ne retire que ses propres appareils", async () => {
    await app.call("DELETE", `${notifs}/push-token`, { as: MEMBER, body: { token: tok("a") } });
    assert.equal(app.store.push_tokens.length, 1);
    assert.equal((await app.call("DELETE", `${notifs}/push-token`, { as: ME, body: { token: tok("a") } })).status, 204);
    assert.equal(app.store.push_tokens.length, 0);
  });
});

describe("envoi", () => {
  test("assigner une tâche envoie un push à chaque appareil de l'assigné, pas à l'auteur", async () => {
    for (const s of ["a", "b"]) await app.call("PUT", `${notifs}/push-token`, { as: ME, body: { token: tok(s) } });
    await app.call("PUT", `${notifs}/push-token`, { as: AUTHOR, body: { token: tok("auteur") } });
    sent.length = 0;
    assert.equal((await assign(T_INT, P_INT, ME)).status, 200);
    await idle();
    assert.deepEqual(sent.map((m) => m.token).sort(), [tok("a"), tok("b")]);
    assert.deepEqual(
      [sent[0].data.title, sent[0].data.body, sent[0].data.projectId, sent[0].data.taskId, sent[0].data.type],
      ["NEXIS Projets", "La tâche « Tâche ouverte » vous a été assignée dans le projet « Ouvert »", P_INT, T_INT, "task_assigned"],
    );
    assert.ok(Object.values(sent[0].data).every((v) => typeof v === "string"));
  });

  test("projet privé : un non-membre n'est jamais notifié, donc jamais poussé", async () => {
    sent.length = 0;
    await assign(T_PRIV, P_PRIV, ME);
    await idle();
    assert.equal(sent.length, 0);
  });

  test("jeton périmé chez FCM → supprimé ; les autres appareils reçoivent quand même", async () => {
    failWith = { [tok("a")]: 404 };
    sent.length = 0;
    await assign(T_INT, P_INT, AUTHOR); // on change d'assigné pour que la prochaine assignation notifie à nouveau
    await assign(T_INT, P_INT, ME);
    await idle();
    failWith = null;
    assert.equal(sent.length, 2);
    assert.deepEqual(app.store.push_tokens.filter((r) => r.user_id === uid(ME)).map((r) => r.token), [tok("b")]);
  });

  test("sans compte de service, rien n'est envoyé et l'action réussit", async () => {
    const saved = process.env.FIREBASE_SERVICE_ACCOUNT;
    delete process.env.FIREBASE_SERVICE_ACCOUNT;
    sent.length = 0;
    await assign(T_INT, P_INT, MEMBER);
    assert.equal((await assign(T_INT, P_INT, ME)).status, 200);
    await idle();
    process.env.FIREBASE_SERVICE_ACCOUNT = saved;
    assert.equal(sent.length, 0);
  });
});
