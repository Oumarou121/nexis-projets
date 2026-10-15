// E-mail des rappels d'échéance : accès de serveur à serveur (clé de module), sans appelant.
import { after, before, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { ORG, MODULE_KEY, boot, uid, ALL } from "./helpers.js";

const P = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const A = 5; // assigné, membre actif d'Identity
const GONE = 6; // assigné, plus membre d'Identity (introuvable côté annuaire)
const NOW = new Date("2026-10-12T09:00:00Z");
const sent = [];
let app, run, idle;
const task = (n, over) => ({ id: `bbbbbbbb-bbbb-4bbb-8bbb-${String(n).padStart(12, "0")}`, project_id: P, title: `T${n}`, status: "todo", priority: "medium", assignee_id: uid(A), created_by: uid(A), labels: [], is_milestone: false, parent_id: null, due_date: "2026-10-13", ...over });

before(async () => {
  app = await boot({
    access: { [uid(A)]: { platformAdmin: false, organizations: [{ organizationId: ORG, permissions: ALL }] } },
    orgMembers: [uid(A)],
    seed: (s) => {
      s.projects.push({ id: P, organization_id: ORG, name: "P", visibility: "internal", status: "active", priority: "medium", created_by: uid(A) });
      s.tasks.push(task(1), task(2, { assignee_id: uid(GONE) }));
    },
  });
  ({ runDueReminders: run } = await import("../src/reminders.js"));
  ({ idle } = await import("../src/notifications.js"));
  process.env.RESEND_API_KEY = "re_test";
  process.env.MAIL_FROM = "NEXIS <x@d.fr>";
  const real = globalThis.fetch;
  mock.method(globalThis, "fetch", async (url, init) => {
    if (String(url).startsWith("https://api.resend.com")) {
      sent.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ id: "m" }), { status: 200 });
    }
    return real(url, init);
  });
  mock.method(console, "warn", () => {});
});
after(() => {
  mock.restoreAll();
  for (const k of ["RESEND_API_KEY", "MAIL_FROM", "IDENTITY_MODULE_KEY"]) delete process.env[k];
  app?.stop();
});

describe("e-mail des rappels d'échéance", () => {
  test("sans clé de module : la cloche est alimentée, aucun e-mail, aucun appel à l'annuaire", async () => {
    delete process.env.IDENTITY_MODULE_KEY;
    app.store.tasks.length = 0;
    app.store.tasks.push(task(1));
    assert.equal(await run(NOW), 1);
    await idle();
    assert.equal(sent.length, 0);
    assert.equal(app.internalCalls.length, 0);
  });

  test("avec la clé : l'assigné reçoit l'e-mail du rappel, adresse trouvée chez Identity", async () => {
    process.env.IDENTITY_MODULE_KEY = MODULE_KEY;
    app.store.notifications.length = 0;
    assert.equal(await run(NOW), 1);
    await idle();
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0].to, [`${uid(A)}@test.example`]);
    assert.equal(sent[0].subject, "Échéance demain : « T1 » (projet « P »)");
    assert.deepEqual(app.internalCalls[0], { organizationId: ORG, userIds: [uid(A)] });
  });

  test("assigné introuvable chez Identity : la cloche reçoit, pas d'e-mail, pas d'erreur", async () => {
    sent.length = 0;
    app.store.tasks.push(task(2, { assignee_id: uid(GONE) }));
    assert.equal(await run(NOW), 1);
    await idle();
    assert.equal(sent.length, 0);
  });

  test("mauvaise clé : la cloche reçoit quand même, aucun e-mail", async () => {
    process.env.IDENTITY_MODULE_KEY = "mauvaise-cle-mauvaise-cle-123456";
    (await import("../src/auth.js")).clearEmailCache();
    sent.length = 0;
    app.store.notifications.length = 0;
    app.store.tasks.push(task(3, { assignee_id: uid(A) }));
    assert.ok((await run(NOW)) >= 1);
    await idle();
    assert.equal(sent.length, 0);
  });
});
