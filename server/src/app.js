import express from "express";
import cors from "cors";
import { getAccess, listOrgMembers, requireAuth, requirePermission } from "./auth.js";
import projects from "./routes/projects.js";
import myTasks from "./routes/myTasks.js";
import dashboard from "./routes/dashboard.js";
import activity from "./routes/activity.js";
import search from "./routes/search.js";
import notifications from "./routes/notifications.js";
import portal from "./routes/portal.js";
import { templateRouter } from "./routes/stages.js";

const app = express();
// Derrière un proxy (Render, Nginx…), TRUST_PROXY=1 : sans cela, tous les visiteurs partagent l'IP du proxy
// et la limitation de débit du portail les pénaliserait ensemble.
if (process.env.TRUST_PROXY) app.set("trust proxy", /^\d+$/.test(process.env.TRUST_PROXY) ? Number(process.env.TRUST_PROXY) : process.env.TRUST_PROXY);
app.use(cors({ origin: process.env.CLIENT_ORIGIN?.split(",") ?? false }));
app.use(express.json({ limit: "100kb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

// Relais des droits NEXIS Identity (utilisateur, organisations, permissions).
app.get("/api/me", requireAuth, async (req, res) => {
  res.set("Cache-Control", "no-store").json(await getAccess(req.auth));
});

// Membres affectables. Sans users.read dans NEXIS Identity : liste vide, affectation indisponible.
app.get("/api/organizations/:orgId/members", requireAuth, requirePermission("projects.read"), async (req, res) => {
  try {
    res.set("Cache-Control", "no-store").json({ members: await listOrgMembers(req.auth, req.params.orgId), canAssign: true });
  } catch (e) {
    // 403 : le rôle n'a pas users.read. 502 : NEXIS Identity injoignable ou en erreur. Dans les deux cas
    // l'écran reste utilisable, mais il doit savoir POURQUOI l'assignation est indisponible.
    if (e.status === 403) return res.json({ members: [], canAssign: false, reason: "forbidden" });
    if (e.status === 502) return res.json({ members: [], canAssign: false, reason: "unavailable" });
    throw e;
  }
});

app.use("/api/organizations/:orgId/activity", requireAuth, activity);
app.use("/api/organizations/:orgId/dashboard", requireAuth, dashboard);
app.use("/api/organizations/:orgId/search", requireAuth, search);
// Portail des invités : SANS authentification NEXIS (le jeton d'invitation est l'identifiant). Doit rester
// totalement séparé du reste : il n'utilise ni requireAuth ni projectGuard.
app.use("/api/portal", portal);
app.use("/api/organizations/:orgId/notifications", requireAuth, notifications);
app.use("/api/organizations/:orgId/my-tasks", requireAuth, myTasks);
app.use("/api/organizations/:orgId/stage-template", requireAuth, templateRouter);
app.use("/api/organizations/:orgId/projects", requireAuth, projects);

// Express 5 relaie les promesses rejetées des handlers async vers ce gestionnaire.
app.use((err, _req, res, _next) => {
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: "Erreur interne." });
});

export { app };
