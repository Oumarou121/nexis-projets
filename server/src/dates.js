// « Aujourd'hui » : une seule définition pour tout le serveur.
//   - Écrans (tableau de bord, liste des projets, portail) : la date locale du navigateur, envoyée dans l'en-tête
//     X-Nexis-Today, pour que les compteurs disent la même chose que les cartes (labels.js todayISO). Acceptée
//     seulement si elle est à un jour au plus de la date UTC (fuseaux de -12 h à +14 h).
//   - Passes automatiques (rappels, résumé) et en-tête absent : APP_TZ (à défaut DIGEST_TZ, sinon UTC).
const DAY = 86_400_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Fuseau IANA du serveur. */
export function appTz() {
  const tz = (process.env.APP_TZ ?? "").trim() || (process.env.DIGEST_TZ ?? "").trim() || "UTC";
  try {
    new Intl.DateTimeFormat("fr-FR", { timeZone: tz });
    return tz;
  } catch {
    console.warn(`[dates] fuseau inconnu « ${tz} » : UTC utilisé.`);
    return "UTC";
  }
}

/** Date (AAAA-MM-JJ) et heure locales d'un instant, dans le fuseau donné. */
export function localTime(now, tz) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(now)
      .map((x) => [x.type, x.value]),
  );
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}

export const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

/** Aujourd'hui dans le fuseau du serveur. */
export const serverToday = (now = new Date()) => localTime(now, appTz()).day;

/** Aujourd'hui pour cette requête : celui du navigateur s'il est plausible, sinon celui du serveur. */
export function todayFor(req, now = new Date()) {
  const sent = String(req.get?.("x-nexis-today") ?? "");
  const utc = now.toISOString().slice(0, 10);
  if (DATE_RE.test(sent) && sent >= addDays(utc, -1) && sent <= addDays(utc, 1)) return sent;
  return serverToday(now);
}
