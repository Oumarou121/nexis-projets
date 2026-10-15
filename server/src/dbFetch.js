// Appels réseau vers Supabase (base de données de CE module) : une coupure brève ne doit pas devenir une erreur 500.
// On ne rejoue QUE les lectures (GET/HEAD) : rejouer une écriture risquerait de la dupliquer.
const RETRIES = 3;
const TIMEOUT_MS = 20_000;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Pannes passagères du fournisseur : passerelle (502-504), Cloudflare (520-526), limitation (429).
const TRANSIENT_STATUS = (s) => s === 429 || (s >= 502 && s <= 504) || (s >= 520 && s <= 526);
// Un 500 de PostgREST est transitoire quand la base est injoignable, saturée ou redémarre (et non une erreur de requête).
export const TRANSIENT_DB_CODE = /\b(PGRST00[0-3]|08[0-9A-Z]{3}|53300|57P0[1-3]|57014)\b/;

async function transient(res) {
  if (TRANSIENT_STATUS(res.status)) return true;
  if (res.status !== 500) return false;
  try {
    return TRANSIENT_DB_CODE.test(await res.clone().text());
  } catch {
    return false;
  }
}

/** @param {typeof fetch} base  @param {number} delay délai de base entre deux essais (ms) */
export function resilientFetch(base = fetch, delay = 200) {
  return async (input, init = {}) => {
    const method = String(init.method ?? input?.method ?? "GET").toUpperCase();
    const readOnly = method === "GET" || method === "HEAD";
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await base(input, { ...init, signal: init.signal ?? AbortSignal.timeout(TIMEOUT_MS) });
        if (readOnly && attempt < RETRIES && (await transient(res))) {
          await wait(delay * 2 ** attempt);
          continue;
        }
        return res;
      } catch (e) {
        if (!readOnly || attempt >= RETRIES || init.signal?.aborted) throw e;
        await wait(delay * 2 ** attempt);
      }
    }
  };
}
