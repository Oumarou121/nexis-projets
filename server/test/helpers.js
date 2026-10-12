// Montage commun des tests : un faux NEXIS Identity (droits + membres de l'organisation), des jetons
// HS256 et une base en mémoire (fakeDb.js) qui remplace src/db.js. Lancer avec
// « node --experimental-test-module-mocks --test » (déjà dans « npm test »).
import { mock } from "node:test";
import http from "node:http";
import { SignJWT } from "jose";
import { createFakeDb } from "./fakeDb.js";

export const SECRET = "test-secret-test-secret-test-secret-123";
export const IDENTITY = "https://identity.test";
export const ORG = "11111111-1111-4111-8111-111111111111";
export const OTHER_ORG = "22222222-2222-4222-8222-222222222222";
export const PROJECT = "33333333-3333-4333-8333-333333333333";
export const TASK = "44444444-4444-4444-8444-444444444444";
export const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const MODULE_KEY = "module-key-module-key-module-key-123";
export const ALL = ["projects.read", "projects.create", "projects.update", "projects.delete"];

export async function token(n, { secret = SECRET, expiresIn = "5m", claims = {} } = {}) {
  return new SignJWT({ role: "authenticated", ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(uid(n))
    .setIssuer(`${IDENTITY}/auth/v1`)
    .setAudience("authenticated")
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(new TextEncoder().encode(secret));
}

/**
 * Démarre le faux Identity et l'application.
 *   access  : { [uid] : réponse de /api/me }
 *   orgMembers : userIds actifs de ORG (réponse de /members, réservée à ceux qui ont users.read)
 *   seed    : (store) => void, pour remplir la base en mémoire
 */
export async function boot({ access, orgMembers = [], seed = () => {} }) {
  const { db, store } = createFakeDb();
  seed(store);
  mock.module(new URL("../src/db.js", import.meta.url).href, { namedExports: { db } });

  const internalCalls = [];
  const identity = http.createServer((req, res) => {
    // Accès de serveur à serveur (clé de module) : e-mail des membres actifs demandés.
    if (req.url === "/api/internal/users/emails" && req.method === "POST") {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        const reply = (status, body) => res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(body));
        if ((req.headers.authorization ?? "") !== `Bearer ${MODULE_KEY}`) return reply(401, {});
        const { organizationId, userIds } = JSON.parse(raw || "{}");
        internalCalls.push({ organizationId, userIds });
        if (organizationId !== ORG) return reply(200, { users: [] });
        reply(200, { users: userIds.filter((id) => orgMembers.includes(id)).map((id) => ({ userId: id, email: `${id}@test.example`, firstName: "P", lastName: id.slice(-2) })) });
      });
      return;
    }
    const tok = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    const sub = JSON.parse(Buffer.from(tok.split(".")[1] ?? "", "base64url").toString() || "{}").sub;
    const json = (status, body) => res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(body));
    if (!access[sub]) return json(401, {});
    if (req.url === "/api/me") return json(200, access[sub]);
    const m = req.url.match(/^\/api\/organizations\/([^/]+)\/members$/);
    if (m) {
      const org = access[sub].organizations.find((o) => o.organizationId === m[1]);
      if (!org?.permissions.includes("users.read")) return json(403, {});
      return json(200, { members: orgMembers.map((id) => ({ userId: id, email: `${id}@test.example`, firstName: "P", lastName: id.slice(-2), status: "active" })) });
    }
    return json(404, {});
  });
  await new Promise((r) => identity.listen(0, "127.0.0.1", r));

  process.env.IDENTITY_SUPABASE_URL = IDENTITY;
  process.env.IDENTITY_JWT_SECRET = SECRET;
  process.env.NEXIS_IDENTITY_URL = `http://127.0.0.1:${identity.address().port}`;
  process.env.DATA_SUPABASE_URL = "http://127.0.0.1:9";
  process.env.DATA_SUPABASE_SERVICE_ROLE_KEY = "test-key";

  const { app } = await import("../src/app.js");
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;

  async function call(method, path, { as, body, rawToken, headers } = {}) {
    const t = rawToken ?? (as ? await token(as) : null);
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { ...(t ? { Authorization: `Bearer ${t}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, json: await res.json().catch(() => ({})) };
  }

  return { base, call, store, internalCalls, stop: () => { identity.close(); server.close(); } };
}
