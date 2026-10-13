import { Router } from "express";
import { db } from "../db.js";
import { requirePermission } from "../auth.js";
import { unwrap } from "../util.js";
import { excludeHidden, getScope } from "../access.js";

// Monté sous /api/organizations/:orgId/my-tasks.
// Toutes les tâches assignées à l'appelant, tous projets confondus (filtrage côté client).
const router = Router({ mergeParams: true });

router.get("/", requirePermission("projects.read"), async (req, res) => {
  const scope = await getScope(req); // une tâche assignée dans un projet privé qu'on ne voit plus n'apparaît pas
  const rows = unwrap(
    await excludeHidden(
      db
        .from("tasks")
        .select(
          "id, project_id, title, description, status, stage_id, priority, assignee_id, due_date, labels, parent_id, created_at, updated_at, projects!inner(name, organization_id)",
        )
        .eq("assignee_id", req.auth.userId)
        .eq("projects.organization_id", req.params.orgId),
      "project_id",
      scope,
    ).order("due_date", { ascending: true, nullsFirst: false }),
  );
  // Nom de l'étape (propre à chaque projet) : une seule requête pour toutes les tâches.
  const stageIds = [...new Set(rows.map((r) => r.stage_id).filter(Boolean))];
  const names = new Map(); // id → { name, color }
  if (stageIds.length > 0) {
    const { data } = await db.from("project_stages").select("id, name, color").in("id", stageIds);
    for (const st of data ?? []) names.set(st.id, st);
  }
  res.json(
    rows.map((r) => ({
      id: r.id,
      projectId: r.project_id,
      projectName: r.projects.name,
      title: r.title,
      description: r.description,
      status: r.status,
      stageId: r.stage_id ?? null,
      stage: names.get(r.stage_id)?.name ?? null,
      stageColor: names.get(r.stage_id)?.color ?? null,
      priority: r.priority,
      assigneeId: r.assignee_id,
      dueDate: r.due_date,
      labels: r.labels ?? [],
      parentId: r.parent_id ?? null,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  );
});

export default router;
