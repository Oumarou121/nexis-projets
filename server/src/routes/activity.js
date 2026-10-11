import { Router } from "express";
import { db } from "../db.js";
import { requirePermission } from "../auth.js";
import { unwrap } from "../util.js";
import { getScope } from "../access.js";

// Monté sous /api/organizations/:orgId/activity. Lecture = projects.read.
const router = Router({ mergeParams: true });

router.get("/", requirePermission("projects.read"), async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
  const action = ["create", "update", "delete"].includes(req.query.action) ? req.query.action : null;
  let before = null;
  if (req.query.before) {
    const d = new Date(String(req.query.before));
    if (!Number.isNaN(d.getTime())) before = d.toISOString();
  }
  const scope = await getScope(req);

  // Un filtre commun, appliqué avant order/limit.
  const query = (restricted, projectIds) => {
    let q = db
      .from("activity_log")
      .select("id, actor_id, action, entity_type, entity_id, project_id, label, details, created_at")
      .eq("organization_id", req.params.orgId);
    if (restricted !== null) q = q.eq("restricted", restricted);
    if (projectIds) q = q.in("project_id", projectIds);
    if (action) q = q.eq("action", action);
    if (before) q = q.lt("created_at", before);
    return q.order("created_at", { ascending: false }).limit(limit);
  };

  let rows;
  if (scope.full) {
    rows = unwrap(await query(null, null));
  } else {
    // Entrées publiques + entrées des projets privés dont l'appelant est membre. Celles d'un projet privé
    // supprimé ou inaccessible restent « restricted » et ne sont vues que des responsables.
    const mine = [...scope.memberOf];
    const [open, own] = await Promise.all([query(false, null), mine.length ? query(true, mine) : { data: [], error: null }]);
    rows = [...unwrap(open), ...unwrap(own)]
      .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))
      .slice(0, limit);
  }
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
