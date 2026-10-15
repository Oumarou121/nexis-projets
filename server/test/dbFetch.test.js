import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { resilientFetch } from "../src/dbFetch.js";

const reply = (status) => ({ status, ok: status < 400 });
const seq = (...steps) => {
  let n = 0;
  const f = async () => {
    const s = steps[Math.min(n++, steps.length - 1)];
    if (s instanceof Error) throw s;
    return reply(s);
  };
  f.calls = () => n;
  return f;
};

describe("fetch résilient vers la base", () => {
  test("une lecture rejouée après une coupure réseau réussit", async () => {
    const f = seq(new TypeError("fetch failed"), 200);
    const res = await resilientFetch(f, 1)("https://db.test/x", { method: "GET" });
    assert.equal(res.status, 200);
    assert.equal(f.calls(), 2);
  });

  test("une lecture rejouée après un 503", async () => {
    const f = seq(503, 503, 200);
    assert.equal((await resilientFetch(f, 1)("https://db.test/x")).status, 200);
    assert.equal(f.calls(), 3);
  });

  test("abandon après 4 essais : l'erreur remonte", async () => {
    const f = seq(new TypeError("fetch failed"));
    await assert.rejects(resilientFetch(f, 1)("https://db.test/x"), /fetch failed/);
    assert.equal(f.calls(), 4);
  });

  test("une écriture n'est JAMAIS rejouée", async () => {
    const f = seq(new TypeError("fetch failed"), 200);
    await assert.rejects(resilientFetch(f, 1)("https://db.test/x", { method: "POST" }), /fetch failed/);
    assert.equal(f.calls(), 1);
    const g = seq(503, 200);
    assert.equal((await resilientFetch(g, 1)("https://db.test/x", { method: "PATCH" })).status, 503);
    assert.equal(g.calls(), 1);
  });

  test("une lecture rejouée après un 522 (Cloudflare)", async () => {
    const f = seq(522, 200);
    assert.equal((await resilientFetch(f, 1)("https://db.test/x")).status, 200);
    assert.equal(f.calls(), 2);
  });

  test("un 500 « base injoignable » (PGRST000) est rejoué, un 500 SQL non", async () => {
    let n = 0;
    const down = async () => (n++ ? { status: 200, clone() { return this; }, text: async () => "" } : { status: 500, clone() { return this; }, text: async () => '{"code":"PGRST000","message":"Could not connect to the database"}' });
    assert.equal((await resilientFetch(down, 1)("https://db.test/x")).status, 200);
    assert.equal(n, 2);
    let m = 0;
    const sql = async () => (m++ ? { status: 200 } : { status: 500, clone() { return this; }, text: async () => '{"code":"42703","message":"column x does not exist"}' });
    assert.equal((await resilientFetch(sql, 1)("https://db.test/x")).status, 500);
    assert.equal(m, 1);
  });

  test("une erreur 4xx n'est pas rejouée", async () => {
    const f = seq(404, 200);
    assert.equal((await resilientFetch(f, 1)("https://db.test/x")).status, 404);
    assert.equal(f.calls(), 1);
  });
});
