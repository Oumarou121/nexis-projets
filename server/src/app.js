import express from "express";
import cors from "cors";
import { getAccess, listOrgMembers, requireAuth, requirePermission } from "./auth.js";
import projects from "./routes/projects.js";
import myTasks from "./routes/myTasks.js";
import dashboard from "./routes/dashboard.js";
import activity from "./routes/activity.js";

const app = express();
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
    if (e.status !== 403) throw e;
    res.json({ members: [], canAssign: false });
  }
});

app.use("/api/organizations/:orgId/activity", requireAuth, activity);
app.use("/api/organizations/:orgId/dashboard", requireAuth, dashboard);
app.use("/api/organizations/:orgId/my-tasks", requireAuth, myTasks);
app.use("/api/organizations/:orgId/projects", requireAuth, projects);

// Express 5 relaie les promesses rejetées des handlers async vers ce gestionnaire.
app.use((err, _req, res, _next) => {
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: "Erreur interne." });
});

export { app };
