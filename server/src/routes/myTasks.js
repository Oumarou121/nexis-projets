import { Router } from "express";
import { db } from "../db.js";
import { requirePermission } from "../auth.js";
import { unwrap } from "../util.js";

// Monté sous /api/organizations/:orgId/my-tasks.
// Toutes les tâches assignées à l'appelant, tous projets confondus (filtrage côté client).
const router = Router({ mergeParams: true });

router.get("/", requirePermission("projects.read"), async (req, res) => {
  const rows = unwrap(
    await db
      .from("tasks")
      .select(
        "id, project_id, title, description, status, priority, assignee_id, due_date, labels, parent_id, created_at, updated_at, projects!inner(name, organization_id)",
      )
      .eq("assignee_id", req.auth.userId)
      .eq("projects.organization_id", req.params.orgId)
      .order("due_date", { ascending: true, nullsFirst: false }),
  );
  res.json(
    rows.map((r) => ({
      id: r.id,
      projectId: r.project_id,
      projectName: r.projects.name,
      title: r.title,
      description: r.description,
      status: r.status,
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
