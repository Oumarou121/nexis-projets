import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify } from "jose";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const issuer = `${(process.env.IDENTITY_SUPABASE_URL ?? "").replace(/\/+$/, "")}/auth/v1`;
const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
const hs256 = process.env.IDENTITY_JWT_SECRET
  ? new TextEncoder().encode(process.env.IDENTITY_JWT_SECRET)
  : null;

export const httpError = (status, message) => Object.assign(new Error(message), { status });

/** Vérifie le JWT Supabase (même règles que NEXIS Identity) → req.auth. */
export async function requireAuth(req, _res, next) {
  try {
    const token = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    if (!token) throw httpError(401, "Connexion requise.");

    let payload;
    try {
      const alg = decodeProtectedHeader(token).alg;
      if (alg === "HS256" && !hs256) {
        throw httpError(
          401,
          "Le projet Identity signe ses jetons en HS256 : renseignez IDENTITY_JWT_SECRET dans server/.env.",
        );
      }
      const useSecret = alg === "HS256";
      ({ payload } = await jwtVerify(token, useSecret ? hs256 : jwks, {
        issuer,
        audience: "authenticated",
        algorithms: useSecret ? ["HS256"] : ["ES256", "RS256", "EdDSA"],
        clockTolerance: 5,
      }));
    } catch (err) {
      if (err.status) throw err;
      // La cause réelle (issuer différent, signature, expiration…) reste dans ce terminal.
      console.warn(`[auth] JWT refusé : ${err.code ?? err.name} — ${err.message} (issuer attendu : ${issuer})`);
      throw httpError(401, "Jeton invalide ou expiré.");
    }
    if (!UUID_RE.test(payload.sub ?? "") || payload.role !== "authenticated" || payload.is_anonymous) {
      throw httpError(401, "Jeton invalide.");
    }
    req.auth = { userId: payload.sub, email: payload.email ?? null, token };
    next();
  } catch (e) {
    next(e);
  }
}

// Droits venant de NEXIS Identity (GET /api/me), mis en cache 30 s par utilisateur.
const cache = new Map();
const TTL_MS = 30_000;

export async function getAccess(auth) {
  const hit = cache.get(auth.userId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

  let res;
  try {
    res = await fetch(`${process.env.NEXIS_IDENTITY_URL.replace(/\/+$/, "")}/api/me`, {
      headers: { Authorization: `Bearer ${auth.token}` },
    });
  } catch {
    throw httpError(502, "NEXIS Identity est injoignable.");
  }
  if (res.status === 401) throw httpError(401, "Session refusée par NEXIS Identity.");
  if (!res.ok) throw httpError(502, "Réponse inattendue de NEXIS Identity.");

  const data = await res.json();
  cache.set(auth.userId, { at: Date.now(), data });
  return data;
}

// Membres actifs d'une organisation, via NEXIS Identity avec le jeton de l'appelant
// (exige users.read là-bas : on ne contourne pas ses droits). Cache 30 s.
const membersCache = new Map();

export async function listOrgMembers(auth, orgId) {
  const key = `${auth.userId}:${orgId}`;
  const hit = membersCache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

  let res;
  try {
    res = await fetch(`${process.env.NEXIS_IDENTITY_URL.replace(/\/+$/, "")}/api/organizations/${orgId}/members`, {
      headers: { Authorization: `Bearer ${auth.token}` },
    });
  } catch {
    throw httpError(502, "NEXIS Identity est injoignable.");
  }
  if (res.status === 401) throw httpError(401, "Session refusée par NEXIS Identity.");
  if (res.status === 403) throw httpError(403, "Le droit de consulter les membres est requis pour affecter une tâche.");
  if (!res.ok) throw httpError(502, "Réponse inattendue de NEXIS Identity.");

  const { members = [] } = await res.json();
  const data = members
    .filter((m) => m.status === "active")
    .map((m) => ({ userId: m.userId, email: m.email, firstName: m.firstName, lastName: m.lastName }));
  membersCache.set(key, { at: Date.now(), data });
  return data;
}

/** Exige une permission dans l'organisation :orgId (admin plateforme = tout). */
export const requirePermission = (permission) => async (req, _res, next) => {
  try {
    const { orgId } = req.params;
    if (!UUID_RE.test(orgId)) throw httpError(400, "Organisation invalide.");
    const access = await getAccess(req.auth);
    if (access.platformAdmin) return next();
    const org = access.organizations?.find((o) => o.organizationId === orgId);
    if (!org?.permissions?.includes(permission)) throw httpError(403, "Accès refusé.");
    next();
  } catch (e) {
    next(e);
  }
};

/** Vrai si l'appelant a cette permission dans l'organisation (admin plateforme = oui). */
export async function hasPermission(auth, orgId, permission) {
  const access = await getAccess(auth);
  if (access.platformAdmin) return true;
  return !!access.organizations?.find((o) => o.organizationId === orgId)?.permissions?.includes(permission);
}
