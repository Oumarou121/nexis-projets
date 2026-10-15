import { describe, test, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
process.env.IDENTITY_SUPABASE_URL ??= "https://identity.test";
const { identityGet } = await import("../src/auth.js");

let hits = 0;
let plan = [];
const srv = http.createServer((_req, res) => {
  const status = plan[Math.min(hits++, plan.length - 1)];
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end("{}");
});
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${srv.address().port}/x`;
after(() => srv.close());

describe("appels vers NEXIS Identity", () => {
  test("un 503 passager est rejoué puis réussit", async () => {
    hits = 0; plan = [503, 200];
    assert.equal((await identityGet(url, {}, 1)).status, 200);
    assert.equal(hits, 2);
  });
  test("un 401 n'est pas rejoué", async () => {
    hits = 0; plan = [401, 200];
    assert.equal((await identityGet(url, {}, 1)).status, 401);
    assert.equal(hits, 1);
  });
  test("503 persistant : 3 essais puis la réponse remonte", async () => {
    hits = 0; plan = [503];
    assert.equal((await identityGet(url, {}, 1)).status, 503);
    assert.equal(hits, 3);
  });
});
