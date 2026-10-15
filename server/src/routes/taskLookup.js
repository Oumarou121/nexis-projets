import { Router } from "express";
import { db } from "../db.js";
import { UUID_RE, httpError, requirePermission } from "../auth.js";
import { unwrap } from "../util.js";
import { excludeHidden, getScope } from "../access.js";

// Monté sous /api/organizations/:orgId/tasks.
// Retrouve le projet d'une tâche à partir de son seul identifiant : c'est ce qui permet un lien direct vers
// une tâche (e-mails, notifications) sans connaître son projet. Mêmes règles de visibilité que la recherche :
// une tâche d'un projet privé que l'appelant ne voit pas répond 404 (son existence n'est pas révélée).
const router = Router({ mergeParams: true });

router.get("/:taskId", requirePermission("projects.read"), async (req, res) => {
  const notFound = () => httpError(404, "Tâche introuvable.");
  if (!UUID_RE.test(req.params.taskId)) throw notFound();
  const scope = await getScope(req);
  const rows = unwrap(
    await excludeHidden(
      db
        .from("tasks")
        .select("id, project_id, title, projects!inner(name, organization_id)")
        .eq("id", req.params.taskId)
        .eq("projects.organization_id", req.params.orgId),
      "project_id",
      scope,
    ).limit(1),
  );
  if (rows.length === 0) throw notFound();
  const t = rows[0];
  res.set("Cache-Control", "no-store").json({ id: t.id, projectId: t.project_id, projectName: t.projects.name, title: t.title });
});

export default router;
