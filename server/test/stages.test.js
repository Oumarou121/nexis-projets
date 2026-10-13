// Étapes personnalisables par projet + modèle par défaut de l'organisation.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { ALL, ORG, PROJECT, boot, uid } from "./helpers.js";

const access = {
  [uid(1)]: { platformAdmin: false, organizations: [{ organizationId: ORG, permissions: ALL }] },
  [uid(2)]: { platformAdmin: false, organizations: [{ organizationId: ORG, permissions: ["projects.read"] }] },
};

let app;
before(async () => {
  app = await boot({
    access,
    seed: (store) => {
      store.projects.push({ id: PROJECT, organization_id: ORG, name: "Projet", visibility: "internal", created_by: uid(1) });
    },
  });
});
after(() => app?.stop());

const call = (...a) => app.call(...a);
const org = `/api/organizations/${ORG}`;
const stagesOf = (pid = PROJECT) => `${org}/projects/${pid}/stages`;
const tasksOf = (pid = PROJECT) => `${org}/projects/${pid}/tasks`;
const byName = (stages, name) => stages.find((s) => s.name === name);

describe("étapes d'un projet", () => {
  test("un projet sans étape reçoit le modèle intégré (4 étapes)", async () => {
    const r = await call("GET", stagesOf(), { as: 2 });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.stages.map((s) => [s.name, s.category]), [
      ["À faire", "todo"], ["En cours", "in_progress"], ["En revue", "in_progress"], ["Terminée", "done"],
    ]);
  });

  test("lecture seule : créer une étape sans projects.update → 403", async () => {
    const r = await call("POST", stagesOf(), { as: 2, body: { name: "Recette", category: "in_progress" } });
    assert.equal(r.status, 403);
  });

  test("créer, renommer, changer de catégorie, réordonner", async () => {
    let r = await call("POST", stagesOf(), { as: 1, body: { name: "  En   attente client ", category: "in_progress" } });
    assert.equal(r.status, 201);
    const waiting = byName(r.json.stages, "En attente client");
    assert.ok(waiting, "espaces normalisés");
    assert.equal(waiting.position, 4);

    r = await call("PATCH", `${stagesOf()}/${waiting.id}`, { as: 1, body: { name: "Chez le client" } });
    assert.equal(r.status, 200);
    assert.ok(byName(r.json.stages, "Chez le client"));

    const ids = r.json.stages.map((s) => s.id).reverse();
    r = await call("PUT", `${stagesOf()}/order`, { as: 1, body: { ids } });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.stages.map((s) => s.id), ids);

    r = await call("PUT", `${stagesOf()}/order`, { as: 1, body: { ids: ids.slice(1) } });
    assert.equal(r.status, 400, "l'ordre doit contenir toutes les étapes");
    // Retour à l'ordre d'origine : les tests suivants comptent dessus.
    assert.equal((await call("PUT", `${stagesOf()}/order`, { as: 1, body: { ids: [...ids].reverse() } })).status, 200);
  });

  test("validation : doublon, catégorie, nom vide", async () => {
    assert.equal((await call("POST", stagesOf(), { as: 1, body: { name: "à FAIRE", category: "todo" } })).status, 400);
    assert.equal((await call("POST", stagesOf(), { as: 1, body: { name: "X", category: "review" } })).status, 400);
    assert.equal((await call("POST", stagesOf(), { as: 1, body: { name: "  ", category: "todo" } })).status, 400);
  });
});

describe("tâches et étapes", () => {
  let todo, doing, review, done;
  before(async () => {
    const r = await call("GET", stagesOf(), { as: 1 });
    [todo, doing, review, done] = ["À faire", "En cours", "En revue", "Terminée"].map((n) => byName(r.json.stages, n));
  });

  test("une nouvelle tâche arrive dans la première étape", async () => {
    const r = await call("POST", tasksOf(), { as: 1, body: { title: "Première" } });
    assert.equal(r.status, 201);
    assert.equal(r.json.stageId, todo.id);
    assert.equal(r.json.stage, "À faire");
    assert.equal(r.json.status, "todo");
  });

  test("création directement dans une étape (stageId) ou une catégorie (status)", async () => {
    let r = await call("POST", tasksOf(), { as: 1, body: { title: "En revue d'emblée", stageId: review.id } });
    assert.equal(r.json.stage, "En revue");
    assert.equal(r.json.status, "in_progress", "status = catégorie de l'étape");
    r = await call("POST", tasksOf(), { as: 1, body: { title: "Déjà finie", status: "done" } });
    assert.equal(r.json.stage, "Terminée");
  });

  test("déplacement par stageId, par catégorie, et refus d'une étape étrangère", async () => {
    const t = (await call("POST", tasksOf(), { as: 1, body: { title: "Mobile" } })).json;
    let r = await call("PATCH", `${tasksOf()}/${t.id}`, { as: 1, body: { stageId: review.id } });
    assert.deepEqual([r.json.stage, r.json.status], ["En revue", "in_progress"]);
    r = await call("PATCH", `${tasksOf()}/${t.id}`, { as: 1, body: { status: "in_progress" } });
    assert.equal(r.json.stage, "En cours", "la catégorie vise la première étape qui la porte");
    r = await call("PATCH", `${tasksOf()}/${t.id}`, { as: 1, body: { status: "review" } });
    assert.equal(r.status, 200, "ancien statut « review » toléré (= en cours)");
    r = await call("PATCH", `${tasksOf()}/${t.id}`, { as: 1, body: { stageId: uid(99) } });
    assert.equal(r.status, 400);
    const hist = app.store.task_status_history.filter((h) => h.task_id === t.id);
    assert.ok(hist.length >= 3 && hist.every((h) => h.stage_id), "historique par étape");
  });

  test("changer la catégorie d'une étape met à jour ses tâches", async () => {
    const t = (await call("POST", tasksOf(), { as: 1, body: { title: "Suivie", stageId: review.id } })).json;
    const r = await call("PATCH", `${stagesOf()}/${review.id}`, { as: 1, body: { category: "done" } });
    assert.equal(r.status, 200);
    const after = (await call("GET", tasksOf(), { as: 1 })).json.find((x) => x.id === t.id);
    assert.equal(after.status, "done");
    await call("PATCH", `${stagesOf()}/${review.id}`, { as: 1, body: { category: "in_progress" } }); // retour
  });

  test("on ne peut pas retirer la dernière étape « à faire » ou « terminé »", async () => {
    const list = (await call("GET", stagesOf(), { as: 1 })).json.stages;
    const todos = list.filter((s) => s.category === "todo");
    const dones = list.filter((s) => s.category === "done");
    // Une seule de chaque : changer la catégorie ou supprimer est refusé.
    assert.equal(todos.length, 1);
    assert.equal(dones.length, 1);
    assert.equal((await call("PATCH", `${stagesOf()}/${todo.id}`, { as: 1, body: { category: "in_progress" } })).status, 400);
    assert.equal((await call("DELETE", `${stagesOf()}/${done.id}?moveTo=${doing.id}`, { as: 1 })).status, 400);
  });

  test("supprimer une étape non vide exige moveTo ; les tâches suivent", async () => {
    const extra = (await call("POST", stagesOf(), { as: 1, body: { name: "Recette", category: "in_progress" } })).json.stages.find((s) => s.name === "Recette");
    const t = (await call("POST", tasksOf(), { as: 1, body: { title: "À déplacer", stageId: extra.id } })).json;
    let r = await call("DELETE", `${stagesOf()}/${extra.id}`, { as: 1 });
    assert.equal(r.status, 400, "contient une tâche");
    r = await call("DELETE", `${stagesOf()}/${extra.id}?moveTo=${doing.id}`, { as: 1 });
    assert.equal(r.status, 200);
    assert.ok(!r.json.stages.some((s) => s.id === extra.id));
    assert.deepEqual(r.json.stages.map((s) => s.position), r.json.stages.map((_, i) => i), "positions recompactées");
    const moved = (await call("GET", tasksOf(), { as: 1 })).json.find((x) => x.id === t.id);
    assert.equal(moved.stage, "En cours");
  });
});

describe("modèle de l'organisation", () => {
  test("lecture : modèle intégré par défaut", async () => {
    const r = await call("GET", `${org}/stage-template`, { as: 2 });
    assert.equal(r.status, 200);
    assert.equal(r.json.isDefault, true);
    assert.equal(r.json.stages.length, 4);
  });

  test("modifier exige projects.create et un jeu valide", async () => {
    const body = { stages: [{ name: "Backlog", category: "todo" }, { name: "Doing", category: "in_progress" }, { name: "Livré", category: "done" }] };
    assert.equal((await call("PUT", `${org}/stage-template`, { as: 2, body })).status, 403);
    assert.equal((await call("PUT", `${org}/stage-template`, { as: 1, body: { stages: [{ name: "Seul", category: "todo" }] } })).status, 400);
    assert.equal((await call("PUT", `${org}/stage-template`, { as: 1, body })).status, 200);
    const r = await call("GET", `${org}/stage-template`, { as: 2 });
    assert.deepEqual(r.json.stages.map((s) => s.name), ["Backlog", "Doing", "Livré"]);
    assert.equal(r.json.isDefault, false);
  });

  test("un NOUVEAU projet reçoit le modèle ; un projet existant garde ses étapes", async () => {
    const created = await call("POST", `${org}/projects`, { as: 1, body: { name: "Nouveau" } });
    assert.equal(created.status, 201);
    const fresh = await call("GET", stagesOf(created.json.id), { as: 1 });
    assert.deepEqual(fresh.json.stages.map((s) => s.name), ["Backlog", "Doing", "Livré"]);
    const old = await call("GET", stagesOf(), { as: 1 });
    assert.ok(old.json.stages.some((s) => s.name === "En revue"), "projet existant inchangé");
    // Une tâche du nouveau projet arrive dans « Backlog ».
    const t = await call("POST", tasksOf(created.json.id), { as: 1, body: { title: "Test" } });
    assert.equal(t.json.stage, "Backlog");
  });

  test("retour au modèle intégré", async () => {
    const r = await call("DELETE", `${org}/stage-template`, { as: 1 });
    assert.equal(r.json.isDefault, true);
    const created = (await call("POST", `${org}/projects`, { as: 1, body: { name: "Encore" } })).json;
    assert.equal((await call("GET", stagesOf(created.id), { as: 1 })).json.stages.length, 4);
  });
});

describe("couleur d'étape", () => {
  test("sans couleur choisie : null (couleur de la catégorie)", async () => {
    const r = await call("GET", stagesOf(), { as: 2 });
    assert.ok(r.json.stages.every((s) => s.color === null));
  });

  test("créer avec une couleur, la changer, puis revenir à la couleur de la catégorie", async () => {
    let r = await call("POST", stagesOf(), { as: 1, body: { name: "Couleur test", category: "in_progress", color: 5 } });
    assert.equal(r.status, 201);
    const st = byName(r.json.stages, "Couleur test");
    assert.equal(st.color, 5);
    r = await call("PATCH", `${stagesOf()}/${st.id}`, { as: 1, body: { color: 2 } });
    assert.equal(r.status, 200);
    assert.equal(byName(r.json.stages, "Couleur test").color, 2);
    r = await call("PATCH", `${stagesOf()}/${st.id}`, { as: 1, body: { color: null } });
    assert.equal(byName(r.json.stages, "Couleur test").color, null);
    // même valeur : aucune modification
    r = await call("PATCH", `${stagesOf()}/${st.id}`, { as: 1, body: { color: null } });
    assert.equal(r.status, 400);
  });

  test("couleur hors palette → 400", async () => {
    for (const color of [8, -1, 1.5, "rouge"]) {
      const r = await call("POST", stagesOf(), { as: 1, body: { name: "Hors palette", category: "todo", color } });
      assert.equal(r.status, 400);
    }
  });

  test("la couleur est renvoyée avec les tâches et reprise par le modèle de l'organisation", async () => {
    let r = await call("GET", stagesOf(), { as: 1 });
    const st = byName(r.json.stages, "Couleur test");
    await call("PATCH", `${stagesOf()}/${st.id}`, { as: 1, body: { color: 4 } });
    r = await call("POST", tasksOf(), { as: 1, body: { title: "Tâche colorée", stageId: st.id } });
    assert.equal(r.status, 201);
    assert.equal(r.json.stageColor, 4);
    r = await call("GET", stagesOf(), { as: 1 });
    r = await call("PUT", `${org}/stage-template`, { as: 1, body: { stages: r.json.stages.map(({ name, category, color }) => ({ name, category, color })) } });
    assert.equal(r.status, 200);
    r = await call("GET", `${org}/stage-template`, { as: 1 });
    assert.equal(byName(r.json.stages, "Couleur test").color, 4);
    await call("DELETE", `${org}/stage-template`, { as: 1 });
  });
});
