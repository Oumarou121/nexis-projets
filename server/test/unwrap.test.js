import { describe, test } from "node:test";
import assert from "node:assert/strict";
// util.js importe le client Supabase : il lui faut une URL (aucun appel réseau n'est fait ici).
process.env.DATA_SUPABASE_URL ??= "http://127.0.0.1:9";
process.env.DATA_SUPABASE_SERVICE_ROLE_KEY ??= "test-key";
process.env.IDENTITY_SUPABASE_URL ??= "https://identity.test";
const { unwrap } = await import("../src/util.js");

const code = (r) => { try { unwrap(r); return 200; } catch (e) { return e.status; } };

describe("unwrap : panne réseau ≠ erreur de requête", () => {
  test("fetch failed → 503", () => assert.equal(code({ data: null, error: { message: "TypeError: fetch failed", code: "" }, status: 0 }), 503));
  test("page 502 du fournisseur → 503", () => assert.equal(code({ data: null, error: { message: "Bad gateway", code: "" }, status: 502 }), 503));
  test("PGRST000 (base injoignable) → 503", () => assert.equal(code({ data: null, error: { message: "Could not connect to the database", code: "PGRST000" }, status: 500 }), 503));
  test("pool saturé 53300 → 503", () => assert.equal(code({ data: null, error: { message: "too many connections", code: "53300" }, status: 500 }), 503));
  test("page HTML de passerelle (corps non JSON) → 503", () => assert.equal(code({ data: null, error: { message: "<!DOCTYPE html><html>Error 522", code: "" }, status: 500 }), 503));
  test("Cloudflare 522 → 503", () => assert.equal(code({ data: null, error: { message: "Connection timed out", code: "" }, status: 522 }), 503));
  test("erreur SQL → 500", () => assert.equal(code({ data: null, error: { message: "column x does not exist", code: "42703" }, status: 400 }), 500));
  test("succès → données", () => assert.deepEqual(unwrap({ data: [1], error: null }), [1]));
});
