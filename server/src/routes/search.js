import { Router } from "express";
import { db } from "../db.js";
import { httpError, requirePermission } from "../auth.js";
import { unwrap } from "../util.js";

// Monté sous /api/organizations/:orgId/search.
// Recherche globale (projets par nom, tâches par titre) dans l'organisation de l'appelant.
const router = Router({ mergeParams: true });

// « % », « _ » et « \ » sont des jokers dans un ILIKE : on les neutralise pour une recherche littérale.
const escapeLike = (s) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

router.get("/", requirePermission("projects.read"), async (req, res) => {
  const q = String(req.query.q ?? "").trim().replace(/\s+/g, " ");
  if (q.length > 80) throw httpError(400, "Recherche trop longue (80 caractères).");
  if (q.length < 2) return res.set("Cache-Control", "no-store").json({ projects: [], tasks: [] });
  const like = `%${escapeLike(q)}%`;

  const [projects, tasks] = await Promise.all([
    db.from("projects").select("id, name, status").eq("organization_id", req.params.orgId).ilike("name", like).order("updated_at", { ascending: false }).limit(6),
    db
      .from("tasks")
      .select("id, project_id, title, status, projects!inner(name, organization_id)")
      .eq("projects.organization_id", req.params.orgId)
      .ilike("title", like)
      .order("updated_at", { ascending: false })
      .limit(12),
  ]);

  res.set("Cache-Control", "no-store").json({
    projects: unwrap(projects).map((p) => ({ id: p.id, name: p.name, status: p.status })),
    tasks: unwrap(tasks).map((t) => ({ id: t.id, projectId: t.project_id, projectName: t.projects.name, title: t.title, status: t.status })),
  });
});

export default router;
