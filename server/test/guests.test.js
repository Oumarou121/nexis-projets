// Mode « public » : invités externes en lecture seule. Ce qu'on vérifie surtout : qu'un invité ne voit
// QUE la liste blanche de champs, qu'aucun jeton ne fuit, et que révocation / expiration / sortie du
// niveau « public » ferment bien l'accès.
import { after, before, beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { ORG, boot, uid, ALL } from "./helpers.js";

const P_PUB = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const P_INT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const P_PRIV = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";
const MANAGER = 6; // projects.update
const READER = 5; // projects.read seulement

const org = (permissions) => ({ platformAdmin: false, organizations: [{ organizationId: ORG, permissions }] });
const access = {
  [uid(MANAGER)]: org(["projects.read", "projects.update", "users.read"]), // responsable des trois projets (voir seed)
  [uid(READER)]: org(["projects.read"]),
};

let app;
let portalLimits; // importé après boot() : la base est simulée à ce moment-là
const call = (...a) => app.call(...a);
const guests = (p = P_PUB) => `/api/organizations/${ORG}/projects/${p}/guests`;
const portal = (token) => call("GET", "/api/portal", { headers: token === undefined ? {} : { "X-Portal-Token": token } });
const tokenFromLink = (link) => link.split("#/p/")[1];

const sent = [];
const resend = { status: 200 }; // 200 = l'e-mail part ; autre = erreur renvoyée par Resend
before(async () => {
  app = await boot({
    access,
    orgMembers: [MANAGER, READER].map(uid),
    seed: (s) => {
      const project = (id, name, visibility) => ({ id, organization_id: ORG, name, description: "Description publique", visibility, status: "active", priority: "medium", created_by: uid(MANAGER) });
      s.projects.push(project(P_PUB, "Projet partagé", "public"), project(P_INT, "Projet interne", "internal"), project(P_PRIV, "Projet secret", "private"));
      for (const id of [P_PUB, P_INT, P_PRIV]) s.project_members.push({ project_id: id, user_id: uid(MANAGER), added_by: uid(MANAGER), role: "manager" });
      s.tasks.push(
        { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1", project_id: P_PUB, title: "Maquettes", status: "done", priority: "high", assignee_id: uid(MANAGER), created_by: uid(MANAGER), description: "Budget interne : 50 k€", labels: ["confidentiel"], due_date: "2020-01-01", start_date: null, is_milestone: false, parent_id: null },
        { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2", project_id: P_PUB, title: "Livraison", status: "todo", priority: "medium", assignee_id: uid(READER), created_by: uid(MANAGER), description: null, labels: [], due_date: "2020-02-01", start_date: null, is_milestone: true, parent_id: null },
        { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3", project_id: P_PRIV, title: "Tâche privée", status: "todo", priority: "medium", assignee_id: null, created_by: uid(MANAGER), labels: [], is_milestone: false, parent_id: null },
      );
    },
  });
  ({ portalLimits } = await import("../src/routes/portal.js"));
  process.env.RESEND_API_KEY = "re_test";
  process.env.MAIL_FROM = "NEXIS <x@d.fr>";
  process.env.APP_URL = "https://projets.example.com";
  const real = globalThis.fetch;
  mock.method(globalThis, "fetch", async (url, init) => {
    if (String(url).startsWith("https://api.resend.com")) {
      if (resend.status === 200) sent.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ id: "m" }), { status: resend.status });
    }
    return real(url, init);
  });
  mock.method(console, "log", () => {});
  mock.method(console, "error", () => {});
});
after(() => {
  mock.restoreAll();
  for (const k of ["RESEND_API_KEY", "MAIL_FROM", "APP_URL"]) delete process.env[k];
  app?.stop();
});
beforeEach(() => {
  portalLimits.failures.reset();
  portalLimits.requests.reset();
  resend.status = 200;
  sent.length = 0;
});

const invite = (email, extra = {}, project = P_PUB, as = MANAGER) => call("POST", guests(project), { as, body: { email, ...extra } });
const linkOf = () => /https:\/\/projets\.example\.com\/#\/p\/[A-Za-z0-9_-]{43}/.exec(sent.at(-1).text)[0];
/** Invite et renvoie { id, token } : le jeton vient de l'e-mail, comme pour un vrai invité. */
async function invited(email, extra) {
  const r = await invite(email, extra);
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return { id: r.json.guest.id, token: tokenFromLink(linkOf()) };
}
const stored = (email) => app.store.project_guests.find((g) => g.email === email);

describe("invitation", () => {
  test("invite par e-mail : lien personnel dans le fragment, jeton jamais stocké ni renvoyé", async () => {
    const r = await invite("  Sophie@Client.FR ");
    assert.equal(r.status, 201);
    assert.deepEqual([r.json.emailSent, r.json.guest.email, r.json.guest.status], [true, "sophie@client.fr", "active"]);
    assert.equal(r.json.link, undefined, "le lien n'est pas rendu à l'invitant quand l'e-mail est parti");
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0].to, ["sophie@client.fr"]);
    assert.ok(sent[0].subject.includes("Projet partagé"));
    const token = tokenFromLink(linkOf());
    const row = stored("sophie@client.fr");
    assert.notEqual(row.token_hash, token);
    const listed = JSON.stringify((await call("GET", guests(), { as: MANAGER })).json);
    for (const secret of [token, row.token_hash]) {
      assert.ok(!JSON.stringify(r.json).includes(secret) && !listed.includes(secret), "aucun secret dans les réponses");
    }
  });

  test("seul le niveau « public » peut inviter ; interne et privé → 400", async () => {
    assert.equal((await invite("a@b.fr", {}, P_INT)).status, 400);
    assert.equal((await invite("a@b.fr", {}, P_PRIV)).status, 400);
    assert.equal(sent.length, 0);
  });

  test("droits : lire la liste et inviter exigent projects.update", async () => {
    assert.equal((await invite("a@b.fr", {}, P_PUB, READER)).status, 403);
    assert.equal((await call("GET", guests(), { as: READER })).status, 403);
    assert.equal((await call("GET", guests())).status, 401);
  });

  test("entrées invalides → 400", async () => {
    for (const body of [{ email: "pas-un-mail" }, { email: "" }, {}, { email: "a@b.fr", expiresInDays: 0 }, { email: "a@b.fr", expiresInDays: 400 }, { email: "a@b.fr", expiresInDays: "7" }]) {
      assert.equal((await call("POST", guests(), { as: MANAGER, body })).status, 400, JSON.stringify(body));
    }
  });

  test("e-mail impossible (quota Resend) : l'invité est créé et le lien est rendu à l'invitant", async () => {
    resend.status = 429;
    const r = await invite("quota@client.fr");
    assert.equal(r.status, 201);
    assert.equal(r.json.emailSent, false);
    assert.ok(r.json.emailError && r.json.link);
    assert.equal((await portal(tokenFromLink(r.json.link))).status, 200, "le lien rendu fonctionne");
  });
});

describe("portail : ce que voit un invité", () => {
  test("liste blanche stricte : aucun assigné, auteur, description de tâche, étiquette ni autre projet", async () => {
    const { token } = await invited("lecteur@client.fr");
    const r = await portal(token);
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.json).sort(), ["guest", "project", "stages", "stats", "tasks"]);
    assert.ok(r.json.stages.every((st) => JSON.stringify(Object.keys(st).sort()) === JSON.stringify(["category", "id", "name"])), "étapes : nom et catégorie seulement");
    assert.deepEqual(Object.keys(r.json.project).sort(), ["color", "description", "dueDate", "name", "status"]);
    assert.deepEqual(Object.keys(r.json.tasks[0]).sort(), ["dueDate", "id", "isMilestone", "parentId", "priority", "stage", "stageColor", "stageId", "startDate", "status", "title"]);
    assert.deepEqual(r.json.tasks.map((t) => t.title), ["Maquettes", "Livraison"], "uniquement les tâches de CE projet");
    assert.deepEqual(r.json.stats, { total: 1, done: 1, late: 0 }); // « Livraison » est un jalon : ni tâche, ni retard
    const raw = JSON.stringify(r.json);
    for (const leak of ["Budget interne", "confidentiel", uid(MANAGER), uid(READER), "Tâche privée", "Projet secret"]) {
      assert.ok(!raw.includes(leak), `fuite : ${leak}`);
    }
  });

  test("tout jeton invalide donne exactement la même réponse 404", async () => {
    const replies = [await portal(), await portal("trop-court"), await portal("A".repeat(43)), await portal("é".repeat(43))];
    for (const r of replies) assert.deepEqual([r.status, r.json], [404, { error: "Ce lien n’est plus valide." }]);
  });

  test("un jeton d'invité n'ouvre RIEN dans l'API de l'organisation", async () => {
    const { token } = await invited("curieux@client.fr");
    for (const path of [`/api/organizations/${ORG}/projects`, `/api/organizations/${ORG}/projects/${P_PUB}/tasks`, `/api/organizations/${ORG}/notifications`]) {
      assert.equal((await call("GET", path, { rawToken: token })).status, 401, path);
    }
  });

  test("dernier accès enregistré", async () => {
    const { token } = await invited("trace@client.fr");
    assert.ok(!stored("trace@client.fr").last_access_at);
    await portal(token);
    assert.ok(stored("trace@client.fr").last_access_at);
  });
});

describe("fin de l'accès", () => {
  test("révoquer ferme l'accès ; inviter de nouveau donne un NOUVEAU lien et l'ancien reste mort", async () => {
    const { id, token } = await invited("revoque@client.fr");
    assert.equal((await call("DELETE", `${guests()}/${id}`, { as: MANAGER })).status, 204);
    assert.equal((await portal(token)).status, 404);
    assert.equal((await call("GET", guests(), { as: MANAGER })).json.find((g) => g.id === id).status, "revoked");
    const again = await invited("revoque@client.fr");
    assert.notEqual(again.token, token);
    assert.equal((await portal(token)).status, 404);
    assert.equal((await portal(again.token)).status, 200);
    assert.equal((await call("DELETE", `${guests()}/${uid(999)}`, { as: MANAGER })).status, 404);
    assert.equal((await call("DELETE", `${guests()}/pas-un-uuid`, { as: MANAGER })).status, 404);
  });

  test("expiration : lien refusé une fois la date passée", async () => {
    const { token } = await invited("expire@client.fr", { expiresInDays: 7 });
    assert.equal((await portal(token)).status, 200);
    stored("expire@client.fr").expires_at = new Date(Date.now() - 1000).toISOString();
    assert.equal((await portal(token)).status, 404);
    assert.equal((await call("GET", guests(), { as: MANAGER })).json.find((g) => g.email === "expire@client.fr").status, "expired");
  });

  test("renvoyer : nouveau jeton, l'ancien cesse de marcher ; impossible pour une invitation révoquée", async () => {
    const { id, token } = await invited("renvoi@client.fr");
    const r = await call("POST", `${guests()}/${id}/resend`, { as: MANAGER, body: {} });
    assert.equal(r.status, 200);
    const fresh = tokenFromLink(linkOf());
    assert.notEqual(fresh, token);
    assert.equal((await portal(token)).status, 404);
    assert.equal((await portal(fresh)).status, 200);
    await call("DELETE", `${guests()}/${id}`, { as: MANAGER });
    assert.equal((await call("POST", `${guests()}/${id}/resend`, { as: MANAGER, body: {} })).status, 400);
  });

  test("quitter « public » révoque tous les invités : repasser en public ne les rouvre pas", async () => {
    const { token } = await invited("sortie@client.fr");
    const project = `/api/organizations/${ORG}/projects/${P_PUB}`;
    assert.equal((await call("PATCH", project, { as: MANAGER, body: { visibility: "internal" } })).status, 200);
    assert.equal((await portal(token)).status, 404);
    assert.equal((await call("PATCH", project, { as: MANAGER, body: { visibility: "public" } })).status, 200);
    assert.equal((await portal(token)).status, 404, "pas de réouverture silencieuse");
    assert.equal(stored("sortie@client.fr").revoked_at !== null, true);
    assert.equal((await invite("sortie@client.fr")).status, 201, "on peut ré-inviter explicitement");
  });

  test("un invité enregistré sur un projet qui n'est pas public n'a aucun accès", async () => {
    // Cas anormal (ligne créée hors de l'API) : le portail revérifie la visibilité à chaque requête.
    const token = "Z".repeat(43);
    const { hashToken } = await import("../src/routes/guests.js");
    app.store.project_guests.push({ id: uid(777), project_id: P_PRIV, email: "x@y.fr", token_hash: hashToken(token), expires_at: null, revoked_at: null, last_access_at: null });
    assert.equal((await portal(token)).status, 404);
  });
});

describe("limitation de débit", () => {
  test("trop de jetons invalides : 429, y compris pour un jeton valide ; remise à zéro ensuite", async () => {
    const { token } = await invited("limite@client.fr");
    for (let i = 0; i < 11; i++) assert.equal((await portal("x".repeat(43))).status, 404);
    assert.equal((await portal(token)).status, 429);
    portalLimits.failures.reset();
    assert.equal((await portal(token)).status, 200);
  });
});

describe("niveau « public »", () => {
  test("un projet interne peut passer en public et reste visible comme avant pour l'organisation", async () => {
    const url = `/api/organizations/${ORG}/projects/${P_INT}`;
    const r = await call("PATCH", url, { as: MANAGER, body: { visibility: "public" } });
    assert.equal(r.status, 200);
    assert.equal(r.json.visibility, "public");
    assert.equal((await call("GET", url, { as: READER })).status, 200);
  });
});
