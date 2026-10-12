// Notifications push côté navigateur (Firebase Cloud Messaging). La bibliothèque Firebase n'est chargée qu'au moment
// où la personne active l'option : elle n'alourdit pas le chargement normal de l'application.
// Config (publique, non secrète) : VITE_FIREBASE_API_KEY, VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_MESSAGING_SENDER_ID,
// VITE_FIREBASE_APP_ID, VITE_FIREBASE_VAPID_KEY. Sans elles, l'option n'est pas proposée.
const env = import.meta.env;
const CONFIG = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};
const VAPID = env.VITE_FIREBASE_VAPID_KEY;
const STORE = "nexis-push-token";

/** Vrai si ce navigateur sait faire du push ET que la config Firebase est renseignée. */
export const pushSupported = () =>
  typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator && "PushManager" in window &&
  !!(CONFIG.apiKey && CONFIG.projectId && CONFIG.messagingSenderId && CONFIG.appId && VAPID);

const configured = () => !!(CONFIG.apiKey && CONFIG.projectId && CONFIG.messagingSenderId && CONFIG.appId && VAPID);

/** iPhone / iPad (iPadOS se présente comme un Mac tactile). */
const isIOS = () => typeof navigator !== "undefined" && (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
/** Application lancée depuis l'écran d'accueil (et non dans un onglet Safari). */
const isStandalone = () => typeof window !== "undefined" && (window.navigator.standalone === true || window.matchMedia?.("(display-mode: standalone)").matches);

/** Sur iOS, le push web n'existe QUE pour une application ajoutée à l'écran d'accueil (iOS 16.4 minimum). */
export const pushNeedsInstall = () => configured() && isIOS() && !isStandalone() && !("PushManager" in window);

/** « granted » + un jeton enregistré sur cet appareil. */
export const pushActive = () => pushSupported() && Notification.permission === "granted" && !!localStorage.getItem(STORE);
export const pushBlocked = () => pushSupported() && Notification.permission === "denied";

async function messaging() {
  const [{ initializeApp, getApps }, { getMessaging }] = await Promise.all([import("firebase/app"), import("firebase/messaging")]);
  return getMessaging(getApps()[0] ?? initializeApp(CONFIG));
}

/** Demande la permission, obtient le jeton FCM de cet appareil. Retourne le jeton ; lève une erreur lisible sinon. */
export async function enablePush() {
  if (!pushSupported()) throw new Error("Les notifications push ne sont pas disponibles sur ce navigateur.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notifications refusées : autorisez-les dans les réglages du navigateur pour ce site.");
  const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
  await navigator.serviceWorker.ready;
  const { getToken } = await import("firebase/messaging");
  const token = await getToken(await messaging(), { vapidKey: VAPID, serviceWorkerRegistration: registration });
  if (!token) throw new Error("Impossible d'obtenir le jeton de notification.");
  localStorage.setItem(STORE, token);
  return token;
}

/** Désactive le push sur cet appareil. Retourne l'ancien jeton (à retirer côté serveur) ou null. */
export async function disablePush() {
  const token = localStorage.getItem(STORE);
  localStorage.removeItem(STORE);
  try {
    const { deleteToken } = await import("firebase/messaging");
    await deleteToken(await messaging());
  } catch {
    /* le serveur supprime de toute façon le jeton ; FCM purgera le reste */
  }
  return token;
}

export const storedPushToken = () => localStorage.getItem(STORE);
