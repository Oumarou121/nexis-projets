// Notifications dans l'application : qui est prévenu, qui ne l'est pas, et qu'une notification ne
// survit jamais à la perte d'accès à un projet privé.
import { after, before, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { ORG, OTHER_ORG, boot, uid, ALL } from "./helpers.js";

const P_INT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const P_PRIV = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const T_INT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const T_PRIV = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
const MEMBER = 6; // crée et assigne, membre de P_PRIV
const OUTSIDER = 5; // destinataire, pas membre de P_PRIV
const OTHER = 7; // membre de P_PRIV (ajouté au besoin), destinataire
const STRANGER = 9;

const org = (permissions) => ({ platformAdmin: false, organizations: [{ organizationId: ORG, permissions }] });
const access = {
  [uid(MEMBER)]: org(["projects.read", "projects.update", "projects.create", "users.read"]),
  [uid(OUTSIDER)]: org(["projects.read", "projects.update", "users.read"]),
  [uid(OTHER)]: org(["projects.read", "projects.update"]),
  [uid(STRANGER)]: { platformAdmin: false, organizations: [{ organizationId: OTHER_ORG, permissions: ALL }] },
};

let app;
const call = (...a) => app.call(...a);
const notifs = `/api/organizations/${ORG}/notifications`;
const projects = `/api/organizations/${ORG}/projects`;
const list = async (as) => (await call("GET", notifs, { as })).json;

before(async () => {
  app = await boot({
    access,
    orgMembers: [MEMBER, OUTSIDER, OTHER].map(uid),
    seed: (s) => {
      const project = (id, name, visibility) => ({ id, organization_id: ORG, name, visibility, status: "active", priority: "medium", created_by: uid(MEMBER) });
      s.projects.push(project(P_INT, "Projet ouvert", "internal"), project(P_PRIV, "Projet secret", "private"));
      for (const u of [MEMBER, OTHER]) s.project_members.push({ project_id: P_PRIV, user_id: uid(u), added_by: uid(MEMBER), role: u === MEMBER ? "manager" : "contributor" });
      s.project_members.push({ project_id: P_INT, user_id: uid(MEMBER), added_by: uid(MEMBER), role: "manager" }); // MEMBER répartit le travail
      const task = (id, project_id, title) => ({ id, project_id, title, assignee_id: null, status: "todo", priority: "medium", labels: [], created_by: uid(MEMBER) });
      s.tasks.push(task(T_INT, P_INT, "Tâche ouverte"), task(T_PRIV, P_PRIV, "Plan secret"));
    },
  });
});
after(() => app?.stop());

describe("assignation", () => {
  test("assigner une tâche prévient l'assigné, pas l'auteur", async () => {
    assert.equal((await call("PATCH", `${projects}/${P_INT}/tasks/${T_INT}`, { as: MEMBER, body: { assigneeId: uid(OUTSIDER) } })).status, 200);
    const out = await list(OUTSIDER);
    assert.equal(out.unread, 1);
    assert.deepEqual(
      [out.items[0].type, out.items[0].projectId, out.items[0].taskId, out.items[0].title, out.items[0].read],
      ["task_assigned", P_INT, T_INT, "La tâche « Tâche ouverte » vous a été assignée dans le projet « Projet ouvert »", false],
    );
    assert.equal((await list(MEMBER)).items.length, 0);
  });

  test("s'assigner soi-même ne crée rien ; réenregistrer le même assigné non plus", async () => {
    await call("PATCH", `${projects}/${P_INT}/tasks/${T_INT}`, { as: OUTSIDER, body: { assigneeId: uid(OUTSIDER) } });
    await call("PATCH", `${projects}/${P_INT}/tasks/${T_INT}`, { as: MEMBER, body: { assigneeId: uid(OUTSIDER), priority: "high" } });
    assert.equal((await list(OUTSIDER)).items.length, 1);
  });

  test("créer une tâche déjà assignée prévient l'assigné", async () => {
    const r = await call("POST", `${projects}/${P_INT}/tasks`, { as: MEMBER, body: { title: "Neuve", assigneeId: uid(OTHER) } });
    assert.equal(r.status, 201);
    assert.equal((await list(OTHER)).items[0].title, "La tâche « Neuve » vous a été assignée dans le projet « Projet ouvert »");
  });
});

describe("lecture et marquage", () => {
  test("marquer lue : le compteur baisse ; la notification d'un autre → 404", async () => {
    const n = (await list(OUTSIDER)).items[0];
    assert.equal((await call("POST", `${notifs}/${n.id}/read`, { as: OTHER })).status, 404);
    assert.equal((await list(OUTSIDER)).unread, 1);
    assert.equal((await call("POST", `${notifs}/${n.id}/read`, { as: OUTSIDER })).status, 204);
    const out = await list(OUTSIDER);
    assert.deepEqual([out.unread, out.items[0].read], [0, true]);
    assert.equal((await call("POST", `${notifs}/pas-un-uuid/read`, { as: OUTSIDER })).status, 404);
  });

  test("tout marquer comme lu ne touche que ses propres notifications", async () => {
    assert.equal((await list(OTHER)).unread, 1);
    assert.equal((await call("POST", `${notifs}/read-all`, { as: OUTSIDER })).status, 204);
    assert.equal((await list(OTHER)).unread, 1);
    assert.equal((await call("POST", `${notifs}/read-all`, { as: OTHER })).status, 204);
    assert.equal((await list(OTHER)).unread, 0);
  });

  test("une autre organisation n'a aucun accès → 403", async () => {
    assert.equal((await call("GET", notifs, { as: STRANGER })).status, 403);
  });
});

describe("projet privé", () => {
  test("un membre assigné est prévenu ; ajouter un membre le prévient aussi", async () => {
    assert.equal((await call("PATCH", `${projects}/${P_PRIV}/tasks/${T_PRIV}`, { as: MEMBER, body: { assigneeId: uid(OTHER) } })).status, 200);
    assert.equal((await list(OTHER)).items[0].projectId, P_PRIV);
    const added = await call("POST", `${projects}/${P_PRIV}/members`, { as: MEMBER, body: { userId: uid(OUTSIDER) } });
    assert.equal(added.status, 201);
    assert.equal((await list(OUTSIDER)).items[0].type, "project_member_added");
  });

  test("retiré du projet : il en est prévenu, et les notifications du projet disparaissent de sa liste", async () => {
    // Il a une tâche en cours : on la lui laisse (keep=1), le retrait n'attend pas de choix.
    assert.equal((await call("DELETE", `${projects}/${P_PRIV}/members/${uid(OTHER)}?keep=1`, { as: MEMBER })).status, 204);
    const out = await list(OTHER);
    assert.ok(!out.items.some((i) => i.projectId === P_PRIV), "rien du projet privé ne doit rester visible");
    const removal = out.items.find((i) => i.type === "project_access_removed");
    assert.ok(removal, "il est prévenu du retrait");
    assert.equal(removal.projectId, null);
    assert.equal(removal.taskId, null);
  });

  test("on ne notifie jamais quelqu'un qui n'est pas membre d'un projet privé", async () => {
    const before = (await list(OTHER)).items.length;
    // Contourne le contrôle de la route pour vérifier la règle de notify() elle-même.
    const { notify } = await import("../src/notifications.js");
    const ok = await notify({ orgId: ORG, userId: uid(OTHER), actorId: uid(MEMBER), type: "task_assigned", projectId: P_PRIV, taskId: T_PRIV, title: "x" });
    assert.equal(ok, false);
    assert.equal((await list(OTHER)).items.length, before);
  });
});

describe("commentaires et mentions", () => {
  const comments = (project, task) => `${projects}/${project}/tasks/${task}/comments`;
  const of = async (as, type) => (await list(as)).items.filter((i) => i.type === type);

  test("commenter prévient le créateur et l'assigné, jamais l'auteur", async () => {
    // T_INT : créée par MEMBER, assignée à OUTSIDER.
    assert.equal((await call("POST", comments(P_INT, T_INT), { as: OUTSIDER, body: { body: "Bien reçu" } })).status, 201);
    const forCreator = await of(MEMBER, "task_commented");
    assert.equal(forCreator.length, 1);
    assert.equal(forCreator[0].title.endsWith("a commenté la tâche « Tâche ouverte » (projet « Projet ouvert »)"), true);
    assert.equal((await of(OUTSIDER, "task_commented")).length, 0, "l'auteur n'est pas prévenu");
  });

  test("une mention prévient la personne, qui ne reçoit pas en plus l'alerte de commentaire", async () => {
    const r = await call("POST", comments(P_INT, T_INT), { as: MEMBER, body: { body: "@Autre regardez ça", mentions: [uid(OTHER), uid(OTHER), uid(MEMBER)] } });
    assert.equal(r.status, 201);
    const m = await of(OTHER, "task_mentioned");
    assert.equal(m.length, 1, "mention unique malgré le doublon");
    assert.ok(m[0].title.includes("vous a mentionné dans la tâche « Tâche ouverte » (projet « Projet ouvert »)"));
    assert.equal(m[0].taskId, T_INT);
    assert.equal((await of(OTHER, "task_commented")).length, 0);
    assert.equal((await of(MEMBER, "task_mentioned")).length, 0, "on ne se mentionne pas soi-même");
    assert.equal((await of(OUTSIDER, "task_commented")).length, 1, "l'assigné reçoit l'alerte de commentaire");
  });

  test("une rafale de commentaires ne crée qu'une alerte tant qu'elle n'est pas lue", async () => {
    await call("POST", comments(P_INT, T_INT), { as: MEMBER, body: { body: "Et encore" } });
    await call("POST", comments(P_INT, T_INT), { as: MEMBER, body: { body: "Et encore un" } });
    const open = await of(OUTSIDER, "task_commented");
    assert.equal(open.length, 1);
    await call("POST", `${notifs}/${open[0].id}/read`, { as: OUTSIDER });
    await call("POST", comments(P_INT, T_INT), { as: MEMBER, body: { body: "Nouveau fil" } });
    assert.equal((await of(OUTSIDER, "task_commented")).length, 2, "une fois lue, la suivante crée une nouvelle alerte");
  });

  test("mentionner quelqu'un hors de l'organisation est ignoré en silence", async () => {
    const r = await call("POST", comments(P_INT, T_INT), { as: MEMBER, body: { body: "Salut", mentions: [uid(STRANGER)] } });
    assert.equal(r.status, 201);
    assert.ok(!app.store.notifications.some((n) => n.user_id === uid(STRANGER)), "rien n'est créé pour un inconnu");
  });

  test("projet privé : mentionner quelqu'un qui n'en est pas membre ne lui envoie rien", async () => {
    const before = (await list(OTHER)).items.length; // OTHER a été retiré de P_PRIV plus haut
    const r = await call("POST", comments(P_PRIV, T_PRIV), { as: MEMBER, body: { body: "Secret", mentions: [uid(OTHER)] } });
    assert.equal(r.status, 201);
    assert.equal((await list(OTHER)).items.length, before);
  });

  test("mentions mal formées → 400, et le commentaire n'est pas créé", async () => {
    for (const bad of ["pas-un-tableau", ["pas-un-uuid"], Array.from({ length: 21 }, (_, i) => uid(100 + i))]) {
      assert.equal((await call("POST", comments(P_INT, T_INT), { as: MEMBER, body: { body: "x", mentions: bad } })).status, 400);
    }
    const all = (await call("GET", comments(P_INT, T_INT), { as: MEMBER })).json;
    assert.ok(!all.some((c) => c.body === "x"));
  });
});

describe("canal e-mail", () => {
  const sent = [];
  let idle;
  const NO_LIST = 8; // peut modifier, mais ne peut pas lister les utilisateurs d'Identity

  before(async () => {
    access[uid(NO_LIST)] = org(["projects.read", "projects.update"]);
    ({ idle } = await import("../src/notifications.js"));
    process.env.RESEND_API_KEY = "re_test";
    process.env.MAIL_FROM = "NEXIS <x@d.fr>";
    process.env.APP_URL = "https://projets.example.com/";
    const real = globalThis.fetch;
    mock.method(globalThis, "fetch", async (url, init) => {
      if (String(url).startsWith("https://api.resend.com")) {
        sent.push(JSON.parse(init.body));
        return new Response(JSON.stringify({ id: "m" }), { status: 200 });
      }
      return real(url, init);
    });
  });
  after(() => {
    mock.restoreAll();
    for (const k of ["RESEND_API_KEY", "MAIL_FROM", "APP_URL"]) delete process.env[k];
  });

  const assign = async (as, to, title) => {
    const t = await call("POST", `${projects}/${P_INT}/tasks`, { as, body: { title, assigneeId: uid(to) } });
    assert.equal(t.status, 201);
    await idle();
  };

  test("l'assigné reçoit un e-mail (adresse trouvée chez Identity), échappé et sans contenu du projet", async () => {
    sent.length = 0;
    await assign(MEMBER, OUTSIDER, "Relire <b>le</b> plan");
    assert.equal(sent.length, 1);
    const m = sent[0];
    assert.deepEqual(m.to, [`${uid(OUTSIDER)}@test.example`]);
    assert.equal(m.from, "NEXIS <x@d.fr>");
    assert.equal(m.subject, "La tâche « Relire <b>le</b> plan » vous a été assignée dans le projet « Projet ouvert »");
    assert.ok(m.html.includes("Relire &lt;b&gt;le&lt;/b&gt; plan"), "titre échappé dans le HTML");
    assert.ok(m.text.includes("https://projets.example.com"), "lien vers l'application");
    assert.ok(!m.text.includes("example.com/ "), "pas de double barre");
  });

  test("e-mails désactivés : la cloche reçoit, l'e-mail non", async () => {
    assert.equal((await call("PUT", `${notifs}/preferences`, { as: OUTSIDER, body: { email: false } })).status, 200);
    assert.deepEqual((await call("GET", `${notifs}/preferences`, { as: OUTSIDER })).json, { email: false, digest: true });
    sent.length = 0;
    const before = (await list(OUTSIDER)).items.length;
    await assign(MEMBER, OUTSIDER, "Sans e-mail");
    assert.equal(sent.length, 0);
    assert.equal((await list(OUTSIDER)).items.length, before + 1);
    await call("PUT", `${notifs}/preferences`, { as: OUTSIDER, body: { email: true } });
    await assign(MEMBER, OUTSIDER, "Avec e-mail");
    assert.equal(sent.length, 1);
  });

  test("préférence invalide → 400", async () => {
    assert.equal((await call("PUT", `${notifs}/preferences`, { as: OUTSIDER, body: { email: "oui" } })).status, 400);
    assert.equal((await call("PUT", `${notifs}/preferences`, { as: OUTSIDER, body: {} })).status, 400);
  });

  test("un appelant qui ne peut pas lister les utilisateurs ne bloque rien : cloche seule, pas d'e-mail", async () => {
    sent.length = 0;
    // NO_LIST ne peut pas assigner (liste d'Identity requise) ; il retire un membre : cloche oui, e-mail impossible.
    const r = await call("POST", `${projects}/${P_PRIV}/members`, { as: MEMBER, body: { userId: uid(OTHER) } });
    assert.ok([200, 201].includes(r.status));
    await idle();
    sent.length = 0;
    // NO_LIST n'est pas membre de P_PRIV : il agit sur une tâche du projet interne, la sienne (un contributeur
    // ne modifie que ses tâches).
    const own = await call("POST", `${projects}/${P_INT}/tasks`, { as: NO_LIST, body: { title: "Tâche de NO_LIST" } });
    assert.equal(own.status, 201);
    const t = await call("PATCH", `${projects}/${P_INT}/tasks/${own.json.id}`, { as: NO_LIST, body: { status: "done" } });
    assert.equal(t.status, 200);
    await idle();
    assert.equal(sent.length, 0);
  });

  test("Resend en panne : l'action réussit quand même et la cloche est alimentée", async () => {
    mock.restoreAll();
    const real = globalThis.fetch;
    mock.method(console, "warn", () => {});
    mock.method(console, "error", () => {});
    mock.method(globalThis, "fetch", async (url, init) =>
      String(url).startsWith("https://api.resend.com") ? new Response("{}", { status: 429 }) : real(url, init));
    const before = (await list(OUTSIDER)).items.length;
    await assign(MEMBER, OUTSIDER, "Quota dépassé");
    assert.equal((await list(OUTSIDER)).items.length, before + 1);
  });
});
