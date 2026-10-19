// Limiteur de débit à fenêtre fixe.
//  * UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN définis : compteurs partagés dans Redis (Upstash, API REST,
//    sans dépendance). Indispensable en serverless (Vercel) : chaque instance aurait sinon son propre compteur.
//  * Sinon : compteurs en mémoire, suffisants pour une seule instance (développement, serveur Node classique).
// Les méthodes sont asynchrones dans les deux cas. Si Redis ne répond pas, la requête est laissée passer
// (journalisé) : une panne du limiteur ne doit pas couper le portail.

function memoryStore(windowMs, max) {
  const hits = new Map(); // clé → { count, resetAt }
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  }, windowMs);
  sweep.unref?.();
  return {
    async hit(key) {
      const now = Date.now();
      const cur = hits.get(key);
      if (!cur || cur.resetAt <= now) {
        hits.set(key, { count: 1, resetAt: now + windowMs });
        return true;
      }
      cur.count += 1;
      return cur.count <= max;
    },
    async blocked(key) {
      const cur = hits.get(key);
      return !!cur && cur.resetAt > Date.now() && cur.count > max;
    },
    reset() {
      hits.clear();
    },
  };
}

function redisStore(name, windowMs, max, { url, token }) {
  const base = url.replace(/\/+$/, "");
  const k = (key) => `nexis-projets:rl:${name}:${key}`;
  const call = async (commands) => {
    const res = await fetch(`${base}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(commands),
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) throw new Error(`Upstash ${res.status}`);
    return res.json();
  };
  return {
    async hit(key) {
      try {
        // INCR puis expiration posée au premier passage seulement (NX) : fenêtre fixe.
        const [incr] = await call([["INCR", k(key)], ["PEXPIRE", k(key), String(windowMs), "NX"]]);
        return Number(incr?.result ?? 0) <= max;
      } catch (e) {
        console.error(`[rate-limit] ${name} indisponible :`, e.message);
        return true;
      }
    },
    async blocked(key) {
      try {
        const [get] = await call([["GET", k(key)]]);
        return Number(get?.result ?? 0) > max;
      } catch (e) {
        console.error(`[rate-limit] ${name} indisponible :`, e.message);
        return false;
      }
    },
    reset() {
      /* les clés expirent seules */
    },
  };
}

/** `name` distingue les compteurs dans Redis (ex. « portal-failures »). */
export function createLimiter({ name = "default", windowMs, max }) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? redisStore(name, windowMs, max, { url, token }) : memoryStore(windowMs, max);
}
