// Limiteur de débit en mémoire (fenêtre fixe). Suffisant pour une instance ; derrière plusieurs
// instances, chacune a son compteur (la limite réelle est alors multipliée) : à remplacer par Redis si besoin.
export function createLimiter({ windowMs, max }) {
  const hits = new Map(); // clé → { count, resetAt }
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  }, windowMs);
  sweep.unref?.();
  return {
    /** Compte un passage ; false si la clé a dépassé la limite. */
    hit(key) {
      const now = Date.now();
      const cur = hits.get(key);
      if (!cur || cur.resetAt <= now) {
        hits.set(key, { count: 1, resetAt: now + windowMs });
        return true;
      }
      cur.count += 1;
      return cur.count <= max;
    },
    /** Vrai si la clé est déjà au-dessus de la limite (sans compter de passage). */
    blocked(key) {
      const cur = hits.get(key);
      return !!cur && cur.resetAt > Date.now() && cur.count > max;
    },
    reset() {
      hits.clear();
    },
  };
}
