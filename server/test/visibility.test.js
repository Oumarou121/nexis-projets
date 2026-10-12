// Visibilité des projets (Interne / Privé) et membres : un non-membre ne doit voir un projet privé
// NULLE PART : ni dans la liste, ni par son identifiant, ni par ses tâches, ni par la recherche, le tableau
// de bord, « Mes tâches » ou le journal. Même base en mémoire et même faux Identity que api.test.js.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { ALL, ORG, OTHER_ORG, boot, uid } from "./helpers.js";

const P_INT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1"; // interne
const P_PRIV = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2"; // privé, membre : 6
const P_PRIV2 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3"; // privé, pour les tests de gestion des membres
const T_INT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const T_PRIV = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
const T_LEGACY = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3"; // dans P_PRIV, assignée à quelqu'un qui n'en est pas membre
const T_PRIV2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4";
const GONE = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1"; // projet privé supprimé (il ne reste que son journal)

const FULL = 1; // responsable (projects.delete) : voit tout
const READER = 2; // lecture seule
const ADMIN = 4; // administrateur plateforme
const OUTSIDER = 5; // peut modifier, n'est membre d'aucun projet privé, peut lister les utilisateurs
const MEMBER = 6; // membre de P_PRIV et P_PRIV2, peut créer, peut lister les utilisateurs
const NO_LIST = 7; // peut modifier, ne peut PAS lister les utilisateurs de NEXIS Identity
const STRANGER = 9; // n'appartient pas à l'organisation

const org = (permissions) => ({ platformAdmin: false, organizations: [{ organizationId: ORG, permissions }] });
const access = {
  [uid(FULL)]: org([...ALL, "users.read"]),
  [uid(READER)]: org(["projects.read"]),
  [uid(ADMIN)]: { platformAdmin: true, organizations: [] },
  [uid(OUTSIDER)]: org(["projects.read", "projects.update", "users.read"]),
  [uid(MEMBER)]: org(["projects.read", "projects.update", "projects.create", "users.read"]),
  [uid(NO_LIST)]: org(["projects.read", "projects.update"]),
  [uid(STRANGER)]: { platformAdmin: false, organizations: [{ organizationId: OTHER_ORG, permissions: ALL }] }, // tous les droits, mais dans une autre organisation
};

let app;
const call = (...args) => app.call(...args);
const projects = `/api/organizations/${ORG}/projects`;
const org_ = (p) => `/api/organizations/${ORG}/${p}`;
const names = (r) => r.json.map((p) => p.name).sort();

before(async () => {
  app = await boot({
    access,
    orgMembers: [FULL, READER, OUTSIDER, MEMBER, NO_LIST].map(uid),
    seed: (s) => {
      const project = (id, name, visibility) => ({ id, organization_id: ORG, name, visibility, status: "active", priority: "medium", created_by: uid(MEMBER) });
      s.projects.push(project(P_INT, "Projet ouvert", "internal"), project(P_PRIV, "Projet secret", "private"), project(P_PRIV2, "Projet confidentiel", "private"));
      for (const id of [P_INT, P_PRIV, P_PRIV2]) s.project_members.push({ project_id: id, user_id: uid(MEMBER), added_by: uid(MEMBER), created_at: "2026-10-01T00:00:00Z" });
      const task = (id, project_id, title, assignee_id = null) => ({ id, project_id, title, assignee_id, status: "todo", priority: "medium", labels: [], created_by: uid(MEMBER) });
      s.tasks.push(
        task(T_INT, P_INT, "Tâche ouverte"),
        task(T_PRIV, P_PRIV, "Plan secret", uid(MEMBER)),
        task(T_LEGACY, P_PRIV, "Tâche héritée", uid(OUTSIDER)),
        task(T_PRIV2, P_PRIV2, "Tâche confidentielle"),
      );
      s.task_comments.push({ task_id: T_PRIV, author_id: uid(MEMBER), body: "Commentaire secret" });
      s.task_activities.push({ task_id: T_PRIV, type: "note", summary: "Note secrète", created_by: uid(MEMBER) });
      s.task_timesheets.push({ task_id: T_PRIV, user_id: uid(MEMBER), date: "2026-10-01", duration: 30 });
      s.task_attachments.push({ task_id: T_PRIV, uploaded_by: uid(MEMBER), file_name: "secret.pdf", size_bytes: 1, mime_type: "application/pdf", storage_path: `${T_PRIV}/x` });
      s.task_status_history.push({ task_id: T_PRIV, status: "todo", changed_by: uid(MEMBER), entered_at: "2026-10-01T08:00:00Z" });
      const log = (project_id, label, restricted, at) => ({ organization_id: ORG, actor_id: uid(MEMBER), action: "update", entity_type: "project", entity_id: project_id, project_id, label, restricted, created_at: at });
      s.activity_log.push(
        log(P_INT, "Projet ouvert", false, "2026-10-03T10:00:00Z"),
        log(P_PRIV, "Projet secret", true, "2026-10-02T10:00:00Z"),
        log(GONE, "Ancien projet confidentiel", true, "2026-10-01T10:00:00Z"),
      );
    },
  });
});

after(() => app?.stop());

// Tout ce qui se lit sous un projet.
const readPaths = (p, t) => [
  "",
  "/tasks",
  `/tasks/${t}/comments`,
  `/tasks/${t}/attachments`,
  `/tasks/${t}/activities`,
  `/tasks/${t}/timesheets`,
  `/tasks/${t}/dependencies`,
  `/tasks/${t}/status-history`,
  "/dependencies",
  "/members",
].map((suffix) => `${projects}/${p}${suffix}`);

describe("projet privé : un non-membre ne le voit nulle part", () => {
  test("liste des projets : interne visible, privé caché (pour un éditeur, un lecteur) ; membre et responsables voient tout", async () => {
    assert.deepEqual(names(await call("GET", projects, { as: OUTSIDER })), ["Projet ouvert"]);
    assert.deepEqual(names(await call("GET", projects, { as: READER })), ["Projet ouvert"]);
    const all = ["Projet confidentiel", "Projet ouvert", "Projet secret"];
    assert.deepEqual(names(await call("GET", projects, { as: MEMBER })), all);
    assert.deepEqual(names(await call("GET", projects, { as: FULL })), all);
    assert.deepEqual(names(await call("GET", projects, { as: ADMIN })), all);
  });

  test("par son identifiant : 404 pour un non-membre, identique à un projet inexistant", async () => {
    const hidden = await call("GET", `${projects}/${P_PRIV}`, { as: OUTSIDER });
    const missing = await call("GET", `${projects}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaff`, { as: OUTSIDER });
    assert.equal(hidden.status, 404);
    assert.deepEqual(hidden.json, missing.json);
    assert.equal((await call("PATCH", `${projects}/${P_PRIV}`, { as: OUTSIDER, body: { name: "Piraté" } })).status, 404);
    assert.equal((await call("GET", `${projects}/${P_PRIV}`, { as: MEMBER })).status, 200);
  });

  test("sans droit, le refus est le même (403) que le projet soit privé ou inexistant", async () => {
    const a = await call("PATCH", `${projects}/${P_PRIV}`, { as: READER, body: { name: "x1" } });
    const b = await call("PATCH", `${projects}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaff`, { as: READER, body: { name: "x1" } });
    assert.equal(a.status, 403);
    assert.equal(b.status, 403);
  });

  test("toutes les lectures sous le projet : 404 pour un non-membre, 200 pour un membre", async () => {
    for (const path of readPaths(P_PRIV, T_PRIV)) {
      assert.equal((await call("GET", path, { as: OUTSIDER })).status, 404, `non-membre ${path}`);
      assert.equal((await call("GET", path, { as: READER })).status, 404, `lecteur ${path}`);
      assert.equal((await call("GET", path, { as: MEMBER })).status, 200, `membre ${path}`);
      assert.equal((await call("GET", path, { as: FULL })).status, 200, `responsable ${path}`);
    }
  });

  test("toutes les écritures sous le projet : 404 pour un non-membre, rien n'est modifié", async () => {
    const t = `${projects}/${P_PRIV}/tasks`;
    const before = app.store.tasks.length;
    const tries = [
      call("POST", t, { as: OUTSIDER, body: { title: "Intrus" } }),
      call("PATCH", `${t}/${T_PRIV}`, { as: OUTSIDER, body: { status: "done" } }),
      call("DELETE", `${t}/${T_PRIV}`, { as: OUTSIDER }),
      call("POST", `${t}/${T_PRIV}/comments`, { as: OUTSIDER, body: { body: "Intrus" } }),
      call("POST", `${t}/${T_PRIV}/activities`, { as: OUTSIDER, body: { type: "note", summary: "Intrus" } }),
      call("POST", `${t}/${T_PRIV}/timesheets`, { as: OUTSIDER, body: { date: "2026-10-05", description: "x", duration: 10 } }),
      call("POST", `${t}/${T_PRIV}/dependencies`, { as: OUTSIDER, body: { dependsOnId: T_LEGACY } }),
      call("POST", `${projects}/${P_PRIV}/members`, { as: OUTSIDER, body: { userId: uid(OUTSIDER) } }),
    ];
    for (const r of await Promise.all(tries)) assert.equal(r.status, 404);
    assert.equal(app.store.tasks.length, before);
    assert.equal(app.store.tasks.find((x) => x.id === T_PRIV).status, "todo");
    assert.equal(app.store.task_comments.length, 1);
    assert.equal(app.store.task_timesheets.length, 1);
    assert.ok(!app.store.project_members.some((m) => m.project_id === P_PRIV && m.user_id === uid(OUTSIDER)));
  });

  test("contournement par un projet visible : la tâche d'un projet privé n'est pas atteignable via l'URL d'un autre projet", async () => {
    const via = `${projects}/${P_INT}/tasks/${T_PRIV}`;
    for (const suffix of ["comments", "attachments", "activities", "timesheets", "dependencies", "status-history"]) {
      assert.equal((await call("GET", `${via}/${suffix}`, { as: OUTSIDER })).status, 404, suffix);
      assert.equal((await call("GET", `${via}/${suffix}`, { as: FULL })).status, 404, `${suffix} (même un responsable : la tâche n'est pas dans ce projet)`);
    }
    const mutations = [
      call("POST", `${via}/activities`, { as: OUTSIDER, body: { type: "note", summary: "Intrus" } }),
      call("POST", `${via}/timesheets`, { as: OUTSIDER, body: { date: "2026-10-05", description: "x", duration: 10 } }),
      call("POST", `${via}/dependencies`, { as: OUTSIDER, body: { dependsOnId: T_INT } }),
      call("PATCH", `${via}/activities/${uid(1)}`, { as: OUTSIDER, body: { done: true } }),
      call("DELETE", `${via}/timesheets/${uid(1)}`, { as: OUTSIDER }),
    ];
    for (const r of await Promise.all(mutations)) assert.equal(r.status, 404);
    assert.equal(app.store.task_activities.length, 1);
    assert.equal(app.store.task_timesheets.length, 1);
    assert.equal(app.store.task_dependencies.length, 0);
  });

  test("recherche globale : ni le nom du projet privé ni ses tâches", async () => {
    const q = (text, as) => call("GET", `${org_("search")}?q=${encodeURIComponent(text)}`, { as });
    for (const text of ["secret", "héritée"]) {
      const out = await q(text, OUTSIDER);
      assert.deepEqual(out.json, { projects: [], tasks: [] }, text);
    }
    const mine = await q("secret", MEMBER);
    assert.deepEqual(mine.json.projects.map((p) => p.name), ["Projet secret"]);
    assert.deepEqual(mine.json.tasks.map((t) => t.title), ["Plan secret"]);
    assert.equal((await q("secret", FULL)).json.projects.length, 1);
  });

  test("tableau de bord : les projets et tâches cachés ne comptent dans aucun chiffre", async () => {
    const out = (await call("GET", org_("dashboard"), { as: OUTSIDER })).json;
    assert.equal(out.projectsTotal, 1);
    assert.equal(out.tasksTotal, 1);
    assert.ok(!out.workload.some((w) => w.userId === uid(MEMBER)), "la charge d'un membre du projet privé ne fuite pas");
    const full = (await call("GET", org_("dashboard"), { as: MEMBER })).json;
    assert.equal(full.projectsTotal, 3);
    assert.equal(full.tasksTotal, 4);
  });

  test("« Mes tâches » : une tâche assignée dans un projet privé qu'on ne voit pas n'apparaît pas", async () => {
    assert.deepEqual((await call("GET", org_("my-tasks"), { as: OUTSIDER })).json, []);
    const mine = (await call("GET", org_("my-tasks"), { as: MEMBER })).json;
    assert.deepEqual(mine.map((t) => t.title), ["Plan secret"]);
  });

  test("journal d'activité : entrées d'un projet privé réservées aux membres et aux responsables", async () => {
    const labels = async (as) => (await call("GET", org_("activity"), { as })).json.map((e) => e.label);
    assert.deepEqual(await labels(OUTSIDER), ["Projet ouvert"]);
    assert.deepEqual(await labels(MEMBER), ["Projet ouvert", "Projet secret"]);
    assert.deepEqual(await labels(FULL), ["Projet ouvert", "Projet secret", "Ancien projet confidentiel"]);
  });
});

describe("créer et supprimer un projet privé", () => {
  let created;

  test("le créateur devient membre ; un projet créé privé est caché aux autres", async () => {
    const r = await call("POST", projects, { as: MEMBER, body: { name: "Brouillon", visibility: "private" } });
    assert.equal(r.status, 201);
    assert.equal(r.json.visibility, "private");
    created = r.json.id;
    const members = await call("GET", `${projects}/${created}/members`, { as: MEMBER });
    assert.deepEqual(members.json.members.map((m) => m.userId), [uid(MEMBER)]);
    assert.ok(!names(await call("GET", projects, { as: OUTSIDER })).includes("Brouillon"));
    assert.equal((await call("GET", `${projects}/${created}`, { as: OUTSIDER })).status, 404);
  });

  test("un projet créé sans visibilité est interne et visible de tous", async () => {
    const r = await call("POST", projects, { as: MEMBER, body: { name: "Ouvert par défaut" } });
    assert.equal(r.json.visibility, "internal");
    assert.ok(names(await call("GET", projects, { as: OUTSIDER })).includes("Ouvert par défaut"));
  });

  test("supprimer un projet privé : son journal reste réservé aux responsables", async () => {
    assert.equal((await call("DELETE", `${projects}/${created}`, { as: FULL })).status, 204);
    const labels = async (as) => (await call("GET", org_("activity"), { as })).json.map((e) => `${e.action}:${e.label}`);
    assert.ok((await labels(FULL)).includes("delete:Brouillon"));
    assert.ok(!(await labels(OUTSIDER)).some((l) => l.endsWith("Brouillon")));
    assert.ok(!(await labels(MEMBER)).some((l) => l.endsWith("Brouillon")));
  });
});

describe("changer la visibilité", () => {
  test("les valeurs inconnues sont refusées", async () => {
    for (const visibility of ["secret", 1, null]) {
      assert.equal((await call("PATCH", `${projects}/${P_INT}`, { as: MEMBER, body: { visibility } })).status, 400, String(visibility));
    }
  });

  test("la visibilité ne se règle plus par « settings » : la clé est ignorée", async () => {
    const r = await call("PATCH", `${projects}/${P_INT}`, { as: MEMBER, body: { settings: { visibility: "private", timesheets: true } } });
    assert.equal(r.status, 200);
    assert.equal(r.json.visibility, "internal");
    assert.deepEqual(r.json.settings, { timesheets: true });
    assert.equal((await call("GET", `${projects}/${P_INT}`, { as: NO_LIST })).status, 200);
  });

  test("passer en privé : l'auteur du changement en devient membre, les autres perdent l'accès, le journal suit", async () => {
    const r = await call("PATCH", `${projects}/${P_INT}`, { as: OUTSIDER, body: { visibility: "private" } });
    assert.equal(r.status, 200);
    assert.equal(r.json.visibility, "private");
    const members = (await call("GET", `${projects}/${P_INT}/members`, { as: OUTSIDER })).json.members.map((m) => m.userId);
    assert.ok(members.includes(uid(OUTSIDER)) && members.includes(uid(MEMBER)));
    assert.equal((await call("GET", `${projects}/${P_INT}`, { as: NO_LIST })).status, 404);
    assert.ok(!names(await call("GET", projects, { as: NO_LIST })).includes("Projet ouvert"));
    const log = (await call("GET", org_("activity"), { as: NO_LIST })).json;
    assert.ok(!log.some((e) => e.label === "Projet ouvert"), "les entrées passées du projet sont aussi restreintes");
  });

  test("repasser en interne : tout le monde le revoit, y compris son journal", async () => {
    const r = await call("PATCH", `${projects}/${P_INT}`, { as: OUTSIDER, body: { visibility: "interne" } });
    assert.equal(r.status, 400, "valeur française invalide");
    assert.equal((await call("PATCH", `${projects}/${P_INT}`, { as: OUTSIDER, body: { visibility: "internal" } })).status, 200);
    assert.equal((await call("GET", `${projects}/${P_INT}`, { as: NO_LIST })).status, 200);
    const log = (await call("GET", org_("activity"), { as: NO_LIST })).json;
    assert.ok(log.some((e) => e.label === "Projet ouvert"));
  });
  test("passer en privé signale les personnes avec une tâche en cours qui perdent l'accès (et seulement elles)", async () => {
    const task = `${projects}/${P_INT}/tasks/${T_INT}`;
    assert.equal((await call("PATCH", task, { as: OUTSIDER, body: { assigneeId: uid(NO_LIST) } })).status, 200);
    const r = await call("PATCH", `${projects}/${P_INT}`, { as: OUTSIDER, body: { visibility: "private" } });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.assigneesWithoutAccess, [uid(NO_LIST)]);
    // Retour en interne : pas d'avertissement. Tâche terminée : plus personne n'est signalé au passage suivant.
    assert.equal((await call("PATCH", `${projects}/${P_INT}`, { as: OUTSIDER, body: { visibility: "internal" } })).json.assigneesWithoutAccess, undefined);
    assert.equal((await call("PATCH", task, { as: OUTSIDER, body: { status: "done" } })).status, 200);
    const again = await call("PATCH", `${projects}/${P_INT}`, { as: OUTSIDER, body: { visibility: "private" } });
    assert.deepEqual(again.json.assigneesWithoutAccess, []);
    assert.equal((await call("PATCH", `${projects}/${P_INT}`, { as: OUTSIDER, body: { visibility: "internal" } })).status, 200);
  });
});

describe("gérer les membres", () => {
  const members = `${projects}/${P_PRIV2}/members`;
  const ids = async (as = MEMBER) => (await call("GET", members, { as })).json.members.map((m) => m.userId);

  test("un lecteur peut lister les membres d'un projet interne mais ne peut pas en ajouter", async () => {
    assert.equal((await call("GET", `${projects}/${P_INT}/members`, { as: READER })).status, 200);
    assert.equal((await call("POST", `${projects}/${P_INT}/members`, { as: READER, body: { userId: uid(READER) } })).status, 403);
  });

  test("ajouter un membre : 201, puis 200 s'il l'est déjà ; il voit alors le projet", async () => {
    assert.equal((await call("GET", `${projects}/${P_PRIV2}`, { as: NO_LIST })).status, 404);
    const first = await call("POST", members, { as: MEMBER, body: { userId: uid(NO_LIST) } });
    assert.equal(first.status, 201);
    assert.equal(first.json.userId, uid(NO_LIST));
    assert.equal(first.json.addedBy, uid(MEMBER));
    assert.equal((await call("POST", members, { as: MEMBER, body: { userId: uid(NO_LIST) } })).status, 200);
    assert.deepEqual(await ids(), [uid(MEMBER), uid(NO_LIST)]);
    assert.equal((await call("GET", `${projects}/${P_PRIV2}`, { as: NO_LIST })).status, 200);
  });

  test("identifiant invalide ou personne hors de l'organisation → 400", async () => {
    assert.equal((await call("POST", members, { as: MEMBER, body: { userId: "pas-un-uuid" } })).status, 400);
    assert.equal((await call("POST", members, { as: MEMBER, body: { userId: uid(STRANGER) } })).status, 400);
    assert.equal((await call("POST", members, { as: MEMBER, body: {} })).status, 400);
  });

  test("sans le droit de lister les utilisateurs d'Identity, on ne peut pas en ajouter → 403", async () => {
    assert.equal((await call("POST", members, { as: NO_LIST, body: { userId: uid(OUTSIDER) } })).status, 403);
  });

  test("une tâche d'un projet privé ne s'assigne qu'à un membre du projet", async () => {
    const task = `${projects}/${P_PRIV2}/tasks/${T_PRIV2}`;
    const refused = await call("PATCH", task, { as: MEMBER, body: { assigneeId: uid(OUTSIDER) } });
    assert.equal(refused.status, 400);
    assert.match(refused.json.error, /accès à ce projet privé/);
    assert.equal((await call("PATCH", task, { as: MEMBER, body: { assigneeId: uid(NO_LIST) } })).status, 200);
    assert.equal((await call("POST", `${projects}/${P_PRIV2}/tasks`, { as: MEMBER, body: { title: "Autre", assigneeId: uid(OUTSIDER) } })).status, 400);
  });

  test("retirer un membre : il perd l'accès, et ses tâches ouvertes sont signalées", async () => {
    assert.equal((await call("DELETE", `${members}/${uid(NO_LIST)}`, { as: MEMBER })).status, 204);
    assert.equal((await call("GET", `${projects}/${P_PRIV2}`, { as: NO_LIST })).status, 404);
    const out = (await call("GET", members, { as: MEMBER })).json;
    assert.deepEqual(out.assigneesWithoutAccess, [uid(NO_LIST)]);
    assert.equal(out.me, uid(MEMBER));
  });

  test("retirer quelqu'un qui n'est pas membre → 404 ; identifiant invalide → 404", async () => {
    assert.equal((await call("DELETE", `${members}/${uid(OUTSIDER)}`, { as: MEMBER })).status, 404);
    assert.equal((await call("DELETE", `${members}/pas-un-uuid`, { as: MEMBER })).status, 404);
  });

  test("on ne retire pas le dernier membre d'un projet privé → 400", async () => {
    assert.deepEqual(await ids(), [uid(MEMBER)]);
    const r = await call("DELETE", `${members}/${uid(MEMBER)}`, { as: MEMBER });
    assert.equal(r.status, 400);
    assert.deepEqual(await ids(), [uid(MEMBER)]);
  });

  test("les ajouts et retraits sont inscrits au journal (réservé aux membres du projet privé)", async () => {
    const log = (await call("GET", org_("activity"), { as: MEMBER })).json.filter((e) => e.label === "Projet confidentiel" && e.details?.member);
    assert.deepEqual(log.map((e) => e.details.member).sort(), ["added", "removed"]);
    const hidden = (await call("GET", org_("activity"), { as: OUTSIDER })).json.filter((e) => e.label === "Projet confidentiel");
    assert.equal(hidden.length, 0);
  });

  test("deux retraits simultanés ne vident jamais un projet privé", async () => {
    assert.equal((await call("POST", members, { as: MEMBER, body: { userId: uid(OUTSIDER) } })).status, 201);
    assert.equal((await ids()).length, 2);
    const both = await Promise.all([
      call("DELETE", `${members}/${uid(MEMBER)}`, { as: MEMBER }),
      call("DELETE", `${members}/${uid(OUTSIDER)}`, { as: MEMBER }),
    ]);
    assert.ok(both.some((r) => r.status === 204 || r.status === 400));
    // Relu avec le compte responsable : celui qui vient d'être retiré ne voit plus le projet.
    const left = (await call("GET", members, { as: FULL })).json.members;
    assert.ok(left.length >= 1, "au moins un membre doit rester");
  });
});

describe("responsables", () => {
  test("un responsable (projects.delete) et un administrateur plateforme voient un projet privé sans en être membres", async () => {
    assert.ok(!app.store.project_members.some((m) => m.project_id === P_PRIV && m.user_id === uid(FULL)));
    assert.equal((await call("GET", `${projects}/${P_PRIV}`, { as: FULL })).status, 200);
    assert.equal((await call("GET", `${projects}/${P_PRIV}`, { as: ADMIN })).status, 200);
  });

  test("tous les droits dans une AUTRE organisation n'ouvrent rien ici", async () => {
    assert.equal((await call("GET", `${projects}/${P_PRIV}`, { as: STRANGER })).status, 403);
    assert.equal((await call("GET", `${projects}/${P_INT}`, { as: STRANGER })).status, 403);
  });
});
