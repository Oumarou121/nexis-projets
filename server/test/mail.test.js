import { test, describe, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { sendMail, escapeHtml } from "../src/mail.js";

const base = { to: "a@b.fr", subject: "Bonjour", text: "Salut" };
const status = async (p) => p.then(() => 200, (e) => e.status);

describe("mail", () => {
  let calls;
  beforeEach(() => {
    calls = [];
    mock.method(console, "log", () => {});
    mock.method(console, "error", () => {});
  });
  afterEach(() => {
    mock.restoreAll();
    delete process.env.RESEND_API_KEY;
    delete process.env.MAIL_FROM;
  });
  const configure = (reply) => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.MAIL_FROM = "NEXIS <x@d.fr>";
    mock.method(globalThis, "fetch", async (url, init) => {
      calls.push({ url, init });
      return reply instanceof Error ? Promise.reject(reply) : reply;
    });
  };

  test("sans clé : rien n'est envoyé, aucun appel réseau", async () => {
    mock.method(globalThis, "fetch", async () => assert.fail("pas d'appel"));
    assert.deepEqual(await sendMail(base), { sent: false, id: null });
  });

  test("avec clé : appel Resend correct", async () => {
    configure(new Response(JSON.stringify({ id: "m1" }), { status: 200 }));
    assert.deepEqual(await sendMail({ ...base, replyTo: "r@b.fr", idempotencyKey: "k1" }), { sent: true, id: "m1" });
    const { url, init } = calls[0];
    assert.equal(url, "https://api.resend.com/emails");
    assert.equal(init.headers.Authorization, "Bearer re_test");
    assert.equal(init.headers["Idempotency-Key"], "k1");
    const body = JSON.parse(init.body);
    assert.deepEqual([body.from, body.to, body.reply_to], ["NEXIS <x@d.fr>", ["a@b.fr"], "r@b.fr"]);
  });

  test("entrées invalides refusées (400), même sans clé", async () => {
    for (const bad of [
      { ...base, to: "pas-un-mail" },
      { ...base, to: ["a@b.fr", "x@y"] },
      { ...base, to: [] },
      { ...base, subject: "Hi\r\nBcc: z@z.fr" },
      { ...base, subject: " " },
      { to: "a@b.fr", subject: "x" },
      { ...base, replyTo: "nope" },
    ]) assert.equal(await status(sendMail(bad)), 400, JSON.stringify(bad));
  });

  test("quota Resend atteint (429) et panne (5xx, réseau) → 503 ; autre 4xx → 500", async () => {
    configure(new Response("{}", { status: 429 }));
    assert.equal(await status(sendMail(base)), 503);
    mock.restoreAll(); mock.method(console, "error", () => {});
    configure(new Response("{}", { status: 502 }));
    assert.equal(await status(sendMail(base)), 503);
    mock.restoreAll(); mock.method(console, "error", () => {});
    configure(new Error("ECONNRESET"));
    assert.equal(await status(sendMail(base)), 503);
    mock.restoreAll(); mock.method(console, "error", () => {});
    configure(new Response("{}", { status: 403 }));
    assert.equal(await status(sendMail(base)), 500);
  });

  test("escapeHtml", () => {
    assert.equal(escapeHtml(`<b a="x">&'`), "&lt;b a=&quot;x&quot;&gt;&amp;&#39;");
  });
});
