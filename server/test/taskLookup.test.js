// GET /api/organizations/:orgId/tasks/:taskId : retrouve le projet d'une tâche (lien direct des e-mails),
// sans jamais révéler une tâche d'un projet privé que l'appelant ne voit pas.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { ORG, OTHER_ORG, boot, uid } from "./helpers.js";

const P_INT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const P_PRIV = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const T_INT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const T_PRIV = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
const org = (permissions) => ({ platformAdmin: false, organizations: [{ organizationId: ORG, permissions }] });
const access = {
  [uid(1)]: org(["projects.read"]), // pas membre du projet privé
  [uid(2)]: org(["projects.read"]), // membre du projet privé
  [uid(3)]: org([]), // sans projects.read
  [uid(4)]: { platformAdmin: false, organizations: [{ organizationId: OTHER_ORG, permissions: ["projects.read"] }] },
};
let app;
const get = (id, as, orgId = ORG) => app.call("GET", `/api/organizations/${orgId}/tasks/${id}`, { as });

before(async () => {
  app = await boot({
    access,
    seed: (s) => {
      const project = (id, name, visibility) => ({ id, organization_id: ORG, name, visibility, status: "active", priority: "medium", created_by: uid(2) });
      s.projects.push(project(P_INT, "Projet ouvert", "internal"), project(P_PRIV, "Projet secret", "private"));
      s.project_members.push({ project_id: P_PRIV, user_id: uid(2), added_by: uid(2) });
      const task = (id, project_id, title) => ({ id, project_id, title, assignee_id: null, status: "todo", priority: "medium", labels: [], created_by: uid(2) });
      s.tasks.push(task(T_INT, P_INT, "Tâche ouverte"), task(T_PRIV, P_PRIV, "Plan secret"));
    },
  });
});
after(() => app?.stop());

describe("lien direct vers une tâche", () => {
  test("renvoie le projet de la tâche", async () => {
    const r = await get(T_INT, 1);
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, { id: T_INT, projectId: P_INT, projectName: "Projet ouvert", title: "Tâche ouverte" });
  });
  test("projet privé : visible pour un membre, 404 pour les autres", async () => {
    assert.equal((await get(T_PRIV, 2)).json.projectId, P_PRIV);
    assert.equal((await get(T_PRIV, 1)).status, 404);
  });
  test("identifiant invalide ou inconnu : 404 ; sans droit de lecture : 403 ; autre organisation : refus", async () => {
    assert.equal((await get("pas-un-uuid", 1)).status, 404);
    assert.equal((await get("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb9", 1)).status, 404);
    assert.equal((await get(T_INT, 3)).status, 403);
    assert.ok([403, 404].includes((await get(T_INT, 4, OTHER_ORG)).status) || (await get(T_INT, 4)).status === 403);
  });
});

describe("lien dans l'e-mail", () => {
  test("le message mène à la tâche", async () => {
    const { renderEmail } = await import("../src/notifications.js"); // après boot() : la base est alors simulée
    process.env.APP_URL = "https://projets.example.com/";
    const m = renderEmail({ type: "task_assigned", title: "T", orgId: ORG, taskId: T_INT });
    const url = `https://projets.example.com/#/o/${ORG}/t/${T_INT}`;
    assert.ok(m.text.includes(url) && m.html.includes(url));
    assert.ok(!renderEmail({ type: "task_assigned", title: "T" }).text.includes("#/o/"), "sans tâche : lien général");
  });
});
