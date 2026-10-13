// GET /api/organizations/:orgId/members : la liste vide doit dire POURQUOI (rôle sans users.read, ou NEXIS Identity en panne).
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { ALL, ORG, boot, uid } from "./helpers.js";

const access = {
  [uid(1)]: { platformAdmin: false, organizations: [{ organizationId: ORG, permissions: [...ALL, "users.read"] }] },
  [uid(2)]: { platformAdmin: false, organizations: [{ organizationId: ORG, permissions: ["projects.read", "projects.update"] }] },
  [uid(6)]: { platformAdmin: false, organizations: [{ organizationId: ORG, permissions: [...ALL, "users.read"] }] },
};
let app;
before(async () => { app = await boot({ access, orgMembers: [uid(1), uid(2)] }); });
after(() => app?.stop());

describe("membres affectables", () => {
  test("avec users.read : la liste et canAssign", async () => {
    const r = await app.call("GET", `/api/organizations/${ORG}/members`, { as: 1 });
    assert.equal(r.status, 200);
    assert.equal(r.json.canAssign, true);
    assert.equal(r.json.members.length, 2);
  });

  test("sans users.read : liste vide, canAssign faux, raison « forbidden »", async () => {
    const r = await app.call("GET", `/api/organizations/${ORG}/members`, { as: 2 });
    assert.equal(r.status, 200);
    assert.deepEqual({ canAssign: r.json.canAssign, reason: r.json.reason, n: r.json.members.length }, { canAssign: false, reason: "forbidden", n: 0 });
  });

  test("NEXIS Identity injoignable : raison « unavailable » (et non une erreur silencieuse)", async () => {
    await app.call("GET", "/api/me", { as: 6 }); // met les droits en cache : seule la liste des membres échouera
    const url = process.env.NEXIS_IDENTITY_URL;
    process.env.NEXIS_IDENTITY_URL = "http://127.0.0.1:9";
    try {
      const r = await app.call("GET", `/api/organizations/${ORG}/members`, { as: 6 });
      assert.equal(r.status, 200);
      assert.deepEqual({ canAssign: r.json.canAssign, reason: r.json.reason }, { canAssign: false, reason: "unavailable" });
    } finally {
      process.env.NEXIS_IDENTITY_URL = url;
    }
  });
});
