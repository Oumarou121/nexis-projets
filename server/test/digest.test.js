// Résumé quotidien par e-mail : qui le reçoit, une seule fois par jour, jamais là où on n'a pas le droit.
import { after, before, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { ORG, MODULE_KEY, boot, uid, ALL } from "./helpers.js";

const P_INT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const P_PRIV = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const A = 5; // assigné, reçoit le résumé
const GONE = 6; // plus membre d'Identity : pas d'adresse
const C = 7; // a désactivé le résumé
const D = 8; // a désactivé les e-mails
const B = 9; // membre du projet privé
const DAY = 86_400_000;
// Tunis = UTC+1 toute l'année : 07:30 UTC = 08:30 locale, dans la fenêtre d'envoi (8 h à 12 h).
const at = (dayOffset, hhmm = "07:30") => new Date(Date.parse(`2026-10-12T${hhmm}:00Z`) + dayOffset * DAY);
const sent = [];
let failMail = false;
let app, run, render, localTime;
const task = (n, over) => ({ id: `bbbbbbbb-bbbb-4bbb-8bbb-${String(n).padStart(12, "0")}`, project_id: P_INT, title: `T${n}`, status: "todo", priority: "medium", assignee_id: uid(A), created_by: uid(A), labels: [], is_milestone: false, parent_id: null, due_date: "2026-10-12", ...over });
const mailTo = (user) => sent.filter((m) => m.to[0] === `${uid(user)}@test.example`);

before(async () => {
  app = await boot({
    access: { [uid(A)]: { platformAdmin: false, organizations: [{ organizationId: ORG, permissions: ALL }] } },
    orgMembers: [A, C, D, B].map(uid),
    seed: (s) => {
      s.projects.push(
        { id: P_INT, organization_id: ORG, name: "Site <web>", visibility: "internal", status: "active", priority: "medium", created_by: uid(A) },
        { id: P_PRIV, organization_id: ORG, name: "Secret", visibility: "private", status: "active", priority: "medium", created_by: uid(B) },
      );
      s.project_members.push({ project_id: P_PRIV, user_id: uid(B), added_by: uid(B) });
      s.notification_prefs.push({ user_id: uid(C), digest_enabled: false }, { user_id: uid(D), email_enabled: false });
      s.tasks.push(
        task(1, { title: "Rapport <b>", due_date: "2026-10-09" }), // en retard
        task(9, { due_date: "2026-10-10" }), // en retard, plus récent : après T1
        task(2), // aujourd'hui
        task(3, { due_date: "2026-10-14" }), // à venir
        task(4, { due_date: "2026-10-20" }), // trop loin
        task(5, { status: "done" }), // terminée
        task(6, { is_milestone: true }), // jalon
        task(7, { project_id: P_PRIV }), // A n'est pas membre du projet privé
        task(8, { due_date: "2026-08-01" }), // en retard depuis plus de 30 jours
        task(10, { project_id: P_PRIV, assignee_id: uid(B), title: "Dossier confidentiel" }),
        task(11, { assignee_id: uid(GONE) }),
        task(12, { assignee_id: uid(C) }),
        task(13, { assignee_id: uid(D) }),
      );
    },
  });
  ({ runDailyDigests: run, renderDigest: render, localTime } = await import("../src/digest.js"));
  process.env.RESEND_API_KEY = "re_test";
  process.env.MAIL_FROM = "NEXIS <x@d.fr>";
  process.env.DIGEST_TZ = "Africa/Tunis";
  process.env.DIGEST_HOUR = "8";
  process.env.APP_URL = "https://projets.example.com";
  const real = globalThis.fetch;
  mock.method(globalThis, "fetch", async (url, init) => {
    if (String(url).startsWith("https://api.resend.com")) {
      if (failMail) return new Response("{}", { status: 503 });
      sent.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ id: "m" }), { status: 200 });
    }
    return real(url, init);
  });
  mock.method(console, "warn", () => {});
  mock.method(console, "error", () => {});
});
after(() => {
  mock.restoreAll();
  for (const k of ["RESEND_API_KEY", "MAIL_FROM", "IDENTITY_MODULE_KEY", "DIGEST_TZ", "DIGEST_HOUR", "APP_URL", "DAILY_DIGEST"]) delete process.env[k];
  app?.stop();
});

describe("résumé quotidien", () => {
  test("sans clé de module : aucun envoi", async () => {
    delete process.env.IDENTITY_MODULE_KEY;
    assert.equal(await run(at(0)), 0);
    assert.equal(sent.length, 0);
    assert.equal(app.store.digest_log.length, 0);
  });

  test("avant ou après la fenêtre d'envoi : rien", async () => {
    process.env.IDENTITY_MODULE_KEY = MODULE_KEY;
    assert.equal(await run(at(0, "05:30")), 0); // 06:30 à Tunis
    assert.equal(await run(at(0, "11:30")), 0); // 12:30 à Tunis
    assert.equal(sent.length, 0);
  });

  test("dans la fenêtre : un e-mail par personne concernée, avec le bon contenu", async () => {
    assert.equal(await run(at(0)), 2); // A et B ; ni C (résumé coupé), ni D (e-mails coupés), ni GONE (pas d'adresse)
    assert.deepEqual(sent.map((m) => m.to[0]).sort(), [`${uid(A)}@test.example`, `${uid(B)}@test.example`].sort());

    const [a] = mailTo(A);
    assert.equal(a.subject, "Résumé du 12 oct. : 2 en retard, 1 pour aujourd’hui, 1 à venir");
    for (const t of ["« Rapport <b> »", "« T9 »", "« T2 »", "« T3 »"]) assert.ok(a.text.includes(t), t);
    for (const t of ["T4", "T5", "T6", "T7", "T8", "Dossier confidentiel"]) assert.ok(!a.text.includes(`« ${t} »`) && !a.text.includes(t + " »"), `absent : ${t}`);
    assert.ok(a.text.indexOf("Rapport") < a.text.indexOf("« T9 »"), "retards triés par échéance");
    assert.ok(a.text.indexOf("En retard") < a.text.indexOf("Pour aujourd’hui") && a.text.indexOf("Pour aujourd’hui") < a.text.indexOf("À venir"));
    assert.ok(a.html.includes("Rapport &lt;b&gt;") && a.html.includes("Site &lt;web&gt;"), "titres et projets échappés dans le HTML");
    assert.ok(!a.html.includes("<b>"), "aucun HTML injecté");
    assert.ok(a.text.includes("https://projets.example.com"));
  });

  test("projet privé : seul un membre voit la tâche", () => {
    const [b] = mailTo(B);
    assert.ok(b.text.includes("« Dossier confidentiel » · Secret"));
    assert.equal(b.subject, "Résumé du 12 oct. : 1 pour aujourd’hui");
    assert.ok(!mailTo(A)[0].text.includes("Secret"), "A n'est pas membre : rien du projet privé");
  });

  test("une seconde passe le même jour ne renvoie rien", async () => {
    assert.equal(await run(at(0, "08:30")), 0);
    assert.equal(sent.length, 2);
  });

  test("échec d'envoi : la réservation est libérée, la passe suivante réessaie", async () => {
    sent.length = 0;
    failMail = true;
    assert.equal(await run(at(1)), 0);
    assert.equal(app.store.digest_log.filter((r) => r.day === "2026-10-13").length, 0, "aucune réservation conservée");
    failMail = false;
    assert.equal(await run(at(1, "08:30")), 2);
  });

  test("le lendemain, un nouveau résumé part (les jours ne se bloquent pas entre eux)", () => {
    assert.ok(mailTo(A).some((m) => m.subject.startsWith("Résumé du 13 oct.")));
  });

  test("DAILY_DIGEST=off : désactivé", async () => {
    sent.length = 0;
    process.env.DAILY_DIGEST = "off";
    assert.equal(await run(at(2)), 0);
    delete process.env.DAILY_DIGEST;
    assert.equal(sent.length, 0);
  });

  test("rien à signaler : aucun e-mail", async () => {
    app.store.tasks.length = 0;
    assert.equal(await run(at(3)), 0);
    assert.equal(sent.length, 0);
  });
});

describe("gabarit et fuseau", () => {
  test("plus de 10 tâches dans une section : les premières puis « … et N autres »", () => {
    const late = Array.from({ length: 12 }, (_, i) => ({ title: `L${String(i).padStart(2, "0")}`, project: "P", due: "2026-10-01" }));
    const m = render({ today: "2026-10-12", late, dueToday: [], soon: [] });
    assert.ok(m.text.includes("En retard (12)") && m.text.includes("« L09 »") && !m.text.includes("« L10 »"));
    assert.ok(m.text.includes("… et 2 autres") && m.html.includes("… et 2 autres"));
    assert.ok(m.subject.length <= 200 && !/[\r\n]/.test(m.subject));
  });

  test("« aujourd'hui » suit le fuseau configuré", () => {
    const t = new Date("2026-10-12T23:30:00Z");
    assert.deepEqual(localTime(t, "UTC"), { day: "2026-10-12", hour: 23 });
    assert.deepEqual(localTime(t, "Africa/Tunis"), { day: "2026-10-13", hour: 0 });
  });
});
