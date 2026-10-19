// Hébergement Vercel : tâches planifiées appelées par pg_cron, pièces jointes envoyées et téléchargées en direct
// avec le stockage (URL signées), limiteur de débit partagé dans Redis (Upstash).
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { ALL, ORG, PROJECT, TASK, boot, uid } from "./helpers.js";
import { createLimiter } from "../src/rateLimit.js";

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
      store.tasks.push({ id: TASK, project_id: PROJECT, title: "Tâche", created_by: uid(1) });
    },
  });
});
after(() => app?.stop());

const call = (...args) => app.call(...args);
const files = `/api/organizations/${ORG}/projects/${PROJECT}/tasks/${TASK}/attachments`;
const CRON_SECRET = "cron-secret-cron-secret-cron-secret-1234";

describe("tâches planifiées (/api/cron)", () => {
  test("fermées sans CRON_SECRET côté serveur, même avec un en-tête", async () => {
    delete process.env.CRON_SECRET;
    const res = await call("POST", "/api/cron/reminders", { headers: { Authorization: "Bearer n-importe-quoi" } });
    assert.equal(res.status, 401);
  });

  test("refusées sans le bon secret", async () => {
    process.env.CRON_SECRET = CRON_SECRET;
    assert.equal((await call("POST", "/api/cron/reminders")).status, 401);
    assert.equal((await call("POST", "/api/cron/digest", { headers: { Authorization: `Bearer ${CRON_SECRET}x` } })).status, 401);
  });

  test("lancent la passe avec le bon secret", async () => {
    process.env.CRON_SECRET = CRON_SECRET;
    const auth = { headers: { Authorization: `Bearer ${CRON_SECRET}` } };
    const reminders = await call("POST", "/api/cron/reminders", auth);
    assert.equal(reminders.status, 200);
    assert.deepEqual(reminders.json, { ok: true, created: 0 });
    const digest = await call("POST", "/api/cron/digest", auth);
    assert.equal(digest.status, 200);
    assert.equal(digest.json.ok, true);
  });

  test("/api/health répond", async () => {
    assert.equal((await call("GET", "/api/health")).status, 200);
  });
});

describe("pièces jointes en direct avec le stockage", () => {
  test("URL d'envoi : droits, fichier vide et taille contrôlés avant tout", async () => {
    assert.equal((await call("POST", `${files}/upload-url`, { as: 2, body: { name: "a.txt", size: 10 } })).status, 403);
    assert.equal((await call("POST", `${files}/upload-url`, { as: 1, body: { name: "a.txt", size: 0 } })).status, 400);
    assert.equal((await call("POST", `${files}/upload-url`, { as: 1, body: { name: "a.txt", size: 10 * 1024 * 1024 + 1 } })).status, 413);
  });

  test("envoi complet : URL signée, dépôt dans le stockage, confirmation", async () => {
    const start = await call("POST", `${files}/upload-url`, { as: 1, body: { name: "rapport.pdf", type: "application/pdf", size: 2048 } });
    assert.equal(start.status, 200);
    assert.match(start.json.uploadId, /^[0-9a-f-]{36}$/);
    assert.match(start.json.uploadUrl, new RegExp(`${TASK}/${start.json.uploadId}`));

    // Confirmer avant que le fichier soit arrivé : refusé, aucune ligne écrite.
    const early = await call("POST", `${files}/confirm`, { as: 1, body: { uploadId: start.json.uploadId, name: "rapport.pdf" } });
    assert.equal(early.status, 400);
    assert.equal(app.store.task_attachments.length, 0);

    // Le navigateur dépose le fichier avec l'URL signée.
    app.store.objects.set(`${TASK}/${start.json.uploadId}`, 2048);
    const done = await call("POST", `${files}/confirm`, {
      as: 1,
      body: { uploadId: start.json.uploadId, name: "../../rapport.pdf", type: "application/pdf" },
    });
    assert.equal(done.status, 201);
    assert.equal(done.json.fileName, "rapport.pdf"); // nom nettoyé
    assert.equal(done.json.size, 2048); // taille lue dans le stockage, pas celle annoncée
    assert.equal(app.store.task_attachments[0].storage_path, `${TASK}/${start.json.uploadId}`);

    // Lien de téléchargement signé, en pièce jointe.
    const link = await call("GET", `${files}/${done.json.id}?link=1`, { as: 2 });
    assert.equal(link.status, 200);
    assert.match(link.json.url, /expires=60&download=rapport\.pdf/);
  });

  test("confirmation : identifiant invalide refusé, fichier trop gros supprimé du stockage", async () => {
    assert.equal((await call("POST", `${files}/confirm`, { as: 1, body: { uploadId: "../autre-tache/x" } })).status, 400);
    const start = await call("POST", `${files}/upload-url`, { as: 1, body: { name: "gros.bin", size: 100 } });
    const path = `${TASK}/${start.json.uploadId}`;
    app.store.objects.set(path, 10 * 1024 * 1024 + 1); // taille réelle supérieure à celle annoncée
    const res = await call("POST", `${files}/confirm`, { as: 1, body: { uploadId: start.json.uploadId, name: "gros.bin" } });
    assert.equal(res.status, 413);
    assert.equal(app.store.objects.has(path), false);
  });

  test("lecteur sans droit d'écriture : confirmation refusée", async () => {
    const res = await call("POST", `${files}/confirm`, { as: 2, body: { uploadId: uid(99) } });
    assert.equal(res.status, 403);
  });
});

describe("limiteur de débit", () => {
  test("en mémoire : bloque au-delà du maximum", async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    const limiter = createLimiter({ name: "t", windowMs: 60_000, max: 2 });
    assert.equal(await limiter.hit("ip"), true);
    assert.equal(await limiter.hit("ip"), true);
    assert.equal(await limiter.blocked("ip"), false);
    assert.equal(await limiter.hit("ip"), false);
    assert.equal(await limiter.blocked("ip"), true);
    limiter.reset();
    assert.equal(await limiter.hit("ip"), true);
  });

  test("avec Upstash : compteurs partagés dans Redis, laisse passer si Redis ne répond pas", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.test/";
    process.env.UPSTASH_REDIS_REST_TOKEN = "jeton";
    const realFetch = globalThis.fetch;
    const calls = [];
    let counter = 0;
    let down = false;
    globalThis.fetch = async (url, init) => {
      if (!String(url).startsWith("https://redis.test")) return realFetch(url, init);
      if (down) throw new Error("réseau");
      const commands = JSON.parse(init.body);
      calls.push({ url, auth: init.headers.Authorization, commands });
      if (commands[0][0] === "INCR") counter += 1;
      return new Response(JSON.stringify(commands.map((c) => ({ result: c[0] === "PEXPIRE" ? 1 : counter }))));
    };
    try {
      const limiter = createLimiter({ name: "portal-requests", windowMs: 60_000, max: 1 });
      assert.equal(await limiter.hit("1.2.3.4"), true);
      assert.equal(await limiter.hit("1.2.3.4"), false);
      assert.equal(await limiter.blocked("1.2.3.4"), true);
      assert.equal(calls[0].url, "https://redis.test/pipeline");
      assert.equal(calls[0].auth, "Bearer jeton");
      assert.deepEqual(calls[0].commands, [
        ["INCR", "nexis-projets:rl:portal-requests:1.2.3.4"],
        ["PEXPIRE", "nexis-projets:rl:portal-requests:1.2.3.4", "60000", "NX"],
      ]);
      down = true;
      assert.equal(await limiter.hit("1.2.3.4"), true);
      assert.equal(await limiter.blocked("1.2.3.4"), false);
    } finally {
      globalThis.fetch = realFetch;
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
    }
  });
});
