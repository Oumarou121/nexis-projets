// Tests de bout en bout : un faux NEXIS Identity répond à /api/me, les jetons sont signés en HS256
// et la base est en mémoire (test/fakeDb.js). La garde de visibilité lit le projet avant les routes ;
// le projet PROJECT (interne, de ORG) et sa tâche TASK sont donc semés ici. Chaque cas testé reste refusé
// (401/403) ou invalidé (400/404) avant tout effet d'écriture. Les règles de visibilité ont leur fichier :
// visibility.test.js.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { ALL, ORG, OTHER_ORG, PROJECT, TASK, boot, token, uid } from "./helpers.js";

// Droits renvoyés par le faux /api/me, par utilisateur.
const access = {
  [uid(1)]: { platformAdmin: false, organizations: [{ organizationId: ORG, permissions: ALL }] },
  [uid(2)]: { platformAdmin: false, organizations: [{ organizationId: ORG, permissions: ["projects.read"] }] },
  [uid(3)]: { platformAdmin: false, organizations: [] },
  [uid(4)]: { platformAdmin: true, organizations: [] },
  [uid(5)]: { platformAdmin: false, organizations: [{ organizationId: ORG, permissions: ["projects.read", "projects.update"] }] },
};

let app;
let base;

before(async () => {
  app = await boot({
    access,
    seed: (store) => {
      store.projects.push({ id: PROJECT, organization_id: ORG, name: "Projet", visibility: "internal", created_by: uid(1) });
      store.tasks.push({ id: TASK, project_id: PROJECT, title: "Tâche", created_by: uid(1) });
    },
  });
  base = app.base;
});

after(() => app?.stop());

const call = (...args) => app.call(...args);

const projects = (org = ORG) => `/api/organizations/${org}/projects`;
const tasks = (org = ORG) => `${projects(org)}/${PROJECT}/tasks`;

describe("authentification", () => {
  test("/health est public", async () => {
    assert.equal((await call("GET", "/health")).status, 200);
  });

  test("sans jeton → 401", async () => {
    assert.equal((await call("GET", projects())).status, 401);
  });

  test("jeton illisible → 401", async () => {
    assert.equal((await call("GET", projects(), { rawToken: "pas.un.jwt" })).status, 401);
  });

  test("jeton expiré → 401", async () => {
    const t = await token(1, { expiresIn: "-1m" });
    assert.equal((await call("GET", projects(), { rawToken: t })).status, 401);
  });

  test("mauvaise signature → 401", async () => {
    const t = await token(1, { secret: "un-autre-secret-un-autre-secret-123456" });
    assert.equal((await call("GET", projects(), { rawToken: t })).status, 401);
  });

  test("rôle autre que « authenticated » → 401", async () => {
    const t = await token(1, { claims: { role: "service_role" } });
    assert.equal((await call("GET", projects(), { rawToken: t })).status, 401);
  });

  test("session anonyme → 401", async () => {
    const t = await token(1, { claims: { is_anonymous: true } });
    assert.equal((await call("GET", projects(), { rawToken: t })).status, 401);
  });
});

describe("permissions par rôle", () => {
  test("organisation invalide (pas un UUID) → 400", async () => {
    assert.equal((await call("POST", projects("pas-un-uuid"), { as: 1, body: { name: "Projet" } })).status, 400);
  });

  test("lecteur : créer un projet → 403", async () => {
    assert.equal((await call("POST", projects(), { as: 2, body: { name: "Projet" } })).status, 403);
  });

  test("lecteur : modifier / supprimer un projet → 403", async () => {
    assert.equal((await call("PATCH", `${projects()}/${PROJECT}`, { as: 2, body: { name: "Autre" } })).status, 403);
    assert.equal((await call("DELETE", `${projects()}/${PROJECT}`, { as: 2 })).status, 403);
  });

  test("lecteur : créer / modifier / supprimer une tâche → 403", async () => {
    assert.equal((await call("POST", tasks(), { as: 2, body: { title: "Tâche" } })).status, 403);
    assert.equal((await call("PATCH", `${tasks()}/${TASK}`, { as: 2, body: { status: "done" } })).status, 403);
    assert.equal((await call("DELETE", `${tasks()}/${TASK}`, { as: 2 })).status, 403);
  });

  test("droit « update » sans « delete » : supprimer un projet → 403", async () => {
    assert.equal((await call("DELETE", `${projects()}/${PROJECT}`, { as: 5 })).status, 403);
  });

  test("droit « update » sans « create » : créer un projet → 403", async () => {
    assert.equal((await call("POST", projects(), { as: 5, body: { name: "Projet" } })).status, 403);
  });

  test("membre d'aucune organisation → 403", async () => {
    assert.equal((await call("POST", projects(), { as: 3, body: { name: "Projet" } })).status, 403);
  });

  test("droits d'une organisation inutilisables dans une autre → 403", async () => {
    assert.equal((await call("POST", projects(OTHER_ORG), { as: 1, body: { name: "Projet" } })).status, 403);
    assert.equal((await call("POST", tasks(OTHER_ORG), { as: 1, body: { title: "Tâche" } })).status, 403);
  });

  test("« Mes tâches », tableau de bord, activité : refusés sans droit de lecture", async () => {
    for (const p of ["my-tasks", "dashboard", "activity"]) {
      assert.equal((await call("GET", `/api/organizations/${ORG}/${p}`, { as: 3 })).status, 403, p);
    }
  });

  test("administrateur plateforme : passe les droits (rejeté ensuite par la validation, pas par 403)", async () => {
    assert.equal((await call("POST", projects(OTHER_ORG), { as: 4, body: { name: "x" } })).status, 400);
  });
});

describe("validation des projets", () => {
  const post = (body) => call("POST", projects(), { as: 1, body });

  test("nom trop court / trop long / absent → 400", async () => {
    assert.equal((await post({ name: "a" })).status, 400);
    assert.equal((await post({ name: "x".repeat(121) })).status, 400);
    assert.equal((await post({})).status, 400);
  });

  test("priorité, statut, échéance, description invalides → 400", async () => {
    assert.equal((await post({ name: "Projet", priority: "critique" })).status, 400);
    assert.equal((await post({ name: "Projet", status: "fini" })).status, 400);
    assert.equal((await post({ name: "Projet", dueDate: "demain" })).status, 400);
    assert.equal((await post({ name: "Projet", color: 5 })).status, 400);
    assert.equal((await post({ name: "Projet", color: "rouge" })).status, 400);
    assert.equal((await post({ name: "Projet", description: "x".repeat(2001) })).status, 400);
  });

  test("modification sans champ → 400 ; identifiant invalide → 404", async () => {
    assert.equal((await call("PATCH", `${projects()}/${PROJECT}`, { as: 1, body: {} })).status, 400);
    assert.equal((await call("PATCH", `${projects()}/pas-un-uuid`, { as: 1, body: { name: "Projet" } })).status, 404);
    assert.equal((await call("DELETE", `${projects()}/pas-un-uuid`, { as: 1 })).status, 404);
    assert.equal((await call("GET", `${projects()}/pas-un-uuid`, { as: 1 })).status, 404);
  });

  test("modification avec statut invalide → 400", async () => {
    assert.equal((await call("PATCH", `${projects()}/${PROJECT}`, { as: 1, body: { status: "fini" } })).status, 400);
  });
});

describe("validation des tâches", () => {
  const post = (body) => call("POST", tasks(), { as: 1, body });
  const patch = (body, id = TASK) => call("PATCH", `${tasks()}/${id}`, { as: 1, body });

  test("titre trop court / trop long → 400", async () => {
    assert.equal((await post({ title: "a" })).status, 400);
    assert.equal((await post({ title: "x".repeat(201) })).status, 400);
  });

  test("statut, priorité, échéance, assigné, description invalides → 400", async () => {
    assert.equal((await post({ title: "Tâche", status: "fini" })).status, 400);
    assert.equal((await post({ title: "Tâche", priority: "critique" })).status, 400);
    assert.equal((await post({ title: "Tâche", dueDate: "31/12/2026" })).status, 400);
    assert.equal((await post({ title: "Tâche", startDate: "demain" })).status, 400);
    assert.equal((await post({ title: "Tâche", startDate: "2026-10-20", dueDate: "2026-10-10" })).status, 400);
    assert.equal((await patch({ startDate: "31/12/2026" })).status, 400);
    assert.equal((await post({ title: "Tâche", assigneeId: "quelqu-un" })).status, 400);
    assert.equal((await post({ title: "Tâche", description: "x".repeat(4001) })).status, 400);
  });

  test("modification sans champ → 400 ; valeur invalide → 400", async () => {
    assert.equal((await patch({})).status, 400);
    assert.equal((await patch({ status: "fini" })).status, 400);
  });

  test("identifiants invalides → 404", async () => {
    assert.equal((await patch({ status: "done" }, "pas-un-uuid")).status, 404);
    assert.equal((await call("PATCH", `${projects()}/pas-un-uuid/tasks/${TASK}`, { as: 1, body: { status: "done" } })).status, 404);
    assert.equal((await call("POST", `${projects()}/pas-un-uuid/tasks`, { as: 1, body: { title: "Tâche" } })).status, 404);
  });
});

describe("commentaires des tâches", () => {
  const comments = (org = ORG, project = PROJECT) => `${projects(org)}/${project}/tasks/${TASK}/comments`;

  test("lecteur : commenter ou supprimer un commentaire → 403", async () => {
    assert.equal((await call("POST", comments(), { as: 2, body: { body: "Bonjour" } })).status, 403);
    assert.equal((await call("DELETE", `${comments()}/${TASK}`, { as: 2 })).status, 403);
  });

  test("sans droit de lecture : lister les commentaires → 403", async () => {
    assert.equal((await call("GET", comments(), { as: 3 })).status, 403);
  });

  test("droits d'une organisation inutilisables dans une autre → 403", async () => {
    assert.equal((await call("POST", comments(OTHER_ORG), { as: 1, body: { body: "Bonjour" } })).status, 403);
  });

  test("commentaire vide, d'espaces ou trop long → 400", async () => {
    assert.equal((await call("POST", comments(), { as: 5, body: { body: "" } })).status, 400);
    assert.equal((await call("POST", comments(), { as: 5, body: { body: "   " } })).status, 400);
    assert.equal((await call("POST", comments(), { as: 5, body: {} })).status, 400);
    assert.equal((await call("POST", comments(), { as: 5, body: { body: "x".repeat(4001) } })).status, 400);
  });

  test("identifiants invalides → 404", async () => {
    assert.equal((await call("POST", comments(ORG, "pas-un-uuid"), { as: 5, body: { body: "Bonjour" } })).status, 404);
    assert.equal((await call("DELETE", `${comments()}/pas-un-uuid`, { as: 5 })).status, 404);
  });
});

describe("étiquettes et sous-tâches", () => {
  const post = (body) => call("POST", tasks(), { as: 1, body });
  const patch = (body) => call("PATCH", `${tasks()}/${TASK}`, { as: 1, body });

  test("étiquettes : pas un tableau, vide, trop longue, trop nombreuses → 400", async () => {
    assert.equal((await post({ title: "Tâche", labels: "urgent" })).status, 400);
    assert.equal((await post({ title: "Tâche", labels: [""] })).status, 400);
    assert.equal((await post({ title: "Tâche", labels: ["x".repeat(31)] })).status, 400);
    assert.equal((await post({ title: "Tâche", labels: Array.from({ length: 11 }, (_, i) => `e${i}`) })).status, 400);
    assert.equal((await patch({ labels: [" "] })).status, 400);
  });

  test("tâche parente invalide → 400 ; parent non modifiable → 400", async () => {
    assert.equal((await post({ title: "Sous-tâche", parentId: "pas-un-uuid" })).status, 400);
    assert.equal((await patch({ parentId: TASK })).status, 400);
    assert.equal((await patch({ parentId: null })).status, 400);
  });

  test("lecteur : étiqueter ou créer une sous-tâche → 403", async () => {
    assert.equal((await call("PATCH", `${tasks()}/${TASK}`, { as: 2, body: { labels: ["a"] } })).status, 403);
    assert.equal((await call("POST", tasks(), { as: 2, body: { title: "Sous-tâche", parentId: TASK } })).status, 403);
  });
});

describe("pièces jointes des tâches", () => {
  const files = (org = ORG, project = PROJECT) => `${projects(org)}/${project}/tasks/${TASK}/attachments`;
  const send = async (as, bytes, { org, project, query = "?name=a.txt&type=text%2Fplain" } = {}) => {
    const res = await fetch(`${base}${files(org, project)}${query}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await token(as)}`, "Content-Type": "application/octet-stream" },
      body: bytes,
    });
    return { status: res.status, json: await res.json().catch(() => ({})) };
  };

  test("lecteur : envoyer ou supprimer un fichier → 403", async () => {
    assert.equal((await send(2, Buffer.from("x"))).status, 403);
    assert.equal((await call("DELETE", `${files()}/${TASK}`, { as: 2 })).status, 403);
  });

  test("sans droit de lecture : lister ou télécharger → 403", async () => {
    assert.equal((await call("GET", files(), { as: 3 })).status, 403);
    assert.equal((await call("GET", `${files()}/${TASK}`, { as: 3 })).status, 403);
  });

  test("droits d'une organisation inutilisables dans une autre → 403", async () => {
    assert.equal((await send(1, Buffer.from("x"), { org: OTHER_ORG })).status, 403);
  });

  test("fichier vide → 400", async () => {
    assert.equal((await send(5, Buffer.alloc(0))).status, 400);
  });

  test("fichier de plus de 10 Mo → 413 (refusé avant la base)", async () => {
    assert.equal((await send(5, Buffer.alloc(10 * 1024 * 1024 + 1))).status, 413);
  });

  test("identifiants invalides → 404", async () => {
    assert.equal((await send(5, Buffer.from("x"), { project: "pas-un-uuid" })).status, 404);
    assert.equal((await call("DELETE", `${files()}/pas-un-uuid`, { as: 5 })).status, 404);
    assert.equal((await call("GET", `${files()}/pas-un-uuid`, { as: 5 })).status, 404);
  });
});

describe("dépendances du projet et historique des statuts", () => {
  const deps = (org = ORG, project = PROJECT) => `${projects(org)}/${project}/dependencies`;
  const history = (org = ORG, project = PROJECT) => `${projects(org)}/${project}/tasks/${TASK}/status-history`;

  test("sans jeton → 401", async () => {
    assert.equal((await call("GET", deps())).status, 401);
    assert.equal((await call("GET", history())).status, 401);
  });

  test("sans droit de lecture → 403", async () => {
    assert.equal((await call("GET", deps(), { as: 3 })).status, 403);
    assert.equal((await call("GET", history(), { as: 3 })).status, 403);
  });

  test("droits d'une organisation inutilisables dans une autre → 403", async () => {
    assert.equal((await call("GET", deps(OTHER_ORG), { as: 1 })).status, 403);
    assert.equal((await call("GET", history(OTHER_ORG), { as: 1 })).status, 403);
  });

  test("lecture seule : écrire sur ces routes → 404", async () => {
    assert.equal((await call("POST", deps(), { as: 1, body: {} })).status, 404);
    assert.equal((await call("POST", history(), { as: 1, body: {} })).status, 404);
  });

  test("identifiant de projet invalide → 404", async () => {
    assert.equal((await call("GET", deps(ORG, "pas-un-uuid"), { as: 5 })).status, 404);
    assert.equal((await call("GET", history(ORG, "pas-un-uuid"), { as: 5 })).status, 404);
  });

  test("créer une dépendance : identifiant invalide → 400, vers soi-même → 400", async () => {
    const one = `${projects()}/${PROJECT}/tasks/${TASK}/dependencies`;
    assert.equal((await call("POST", one, { as: 5, body: { dependsOnId: "x" } })).status, 400);
    assert.equal((await call("POST", one, { as: 5, body: { dependsOnId: TASK } })).status, 400);
  });
});

describe("recherche globale", () => {
  const search = (q, org = ORG) => `/api/organizations/${org}/search?q=${encodeURIComponent(q)}`;

  test("sans jeton → 401", async () => {
    assert.equal((await call("GET", search("abc"))).status, 401);
  });

  test("autre organisation → 403", async () => {
    assert.equal((await call("GET", search("abc", OTHER_ORG), { as: 2 })).status, 403);
  });

  test("moins de 2 caractères → liste vide, sans accès à la base", async () => {
    const r = await call("GET", search("a"), { as: 2 });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, { projects: [], tasks: [] });
  });

  test("plus de 80 caractères → 400", async () => {
    assert.equal((await call("GET", search("x".repeat(81)), { as: 2 })).status, 400);
  });
});
