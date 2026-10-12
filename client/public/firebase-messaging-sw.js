// Service worker des notifications push (messages FCM « data-only » envoyés par le serveur).
// Règle iOS : chaque push reçu DOIT afficher une notification, sinon Safari révoque l'abonnement.
// Pas de bibliothèque Firebase ici : l'événement « push » standard suffit, ce qui garde le worker léger.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let d = {};
  try {
    const p = event.data?.json() ?? {};
    d = p.data ?? p; // FCM data-only : { data: {...} } ; tolère aussi un JSON à plat
  } catch {
    /* charge illisible : on affiche quand même une notification générique */
  }
  const title = d.title || "NEXIS Projets";
  event.waitUntil(
    (async () => {
      // Prévient les fenêtres ouvertes (la cloche se rafraîchit) puis affiche la notification système.
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      wins.forEach((w) => w.postMessage({ type: "nexis-push" }));
      await self.registration.showNotification(title, {
        body: d.body || "",
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        tag: d.notificationId || d.taskId || undefined,
        data: { projectId: d.projectId || null, taskId: d.taskId || null },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const { projectId, taskId } = event.notification.data || {};
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = wins[0];
      if (open) {
        await open.focus();
        open.postMessage({ type: "nexis-push-open", projectId, taskId });
        return;
      }
      await self.clients.openWindow("/");
    })(),
  );
});
