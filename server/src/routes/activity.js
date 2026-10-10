import { Router } from "express";
import { db } from "../db.js";
import { requirePermission } from "../auth.js";
import { unwrap } from "../util.js";

// Monté sous /api/organizations/:orgId/activity. Lecture = projects.read.
const router = Router({ mergeParams: true });

router.get("/", requirePermission("projects.read"), async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
  let q = db
    .from("activity_log")
    .select("id, actor_id, action, entity_type, entity_id, project_id, label, details, created_at")
    .eq("organization_id", req.params.orgId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (["create", "update", "delete"].includes(req.query.action)) q = q.eq("action", req.query.action);
  if (req.query.before) {
    const d = new Date(String(req.query.before));
    if (!Number.isNaN(d.getTime())) q = q.lt("created_at", d.toISOString());
  }
  const rows = unwrap(await q);
  res.json(
    rows.map((r) => ({
      id: r.id,
      actorId: r.actor_id,
      action: r.action,
      entityType: r.entity_type,
      entityId: r.entity_id,
      projectId: r.project_id,
      label: r.label,
      details: r.details,
      createdAt: r.created_at,
    })),
  );
});

export default router;
