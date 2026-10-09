import { randomUUID } from "node:crypto";
import express from "express";
import { Router } from "express";
import { db } from "../db.js";
import { UUID_RE, hasPermission, httpError, requirePermission } from "../auth.js";
import { assertProject, assertTask, unwrap } from "../util.js";
import { logActivity } from "../activity.js";
import { BUCKET, MAX_FILES_PER_TASK, MAX_FILE_BYTES, cleanFileName, removeFiles } from "../storage.js";

// Monté sous .../projects/:projectId/tasks/:taskId/attachments.
// Lister / télécharger = projects.read ; envoyer = projects.update ;
// supprimer : son propre fichier (projects.update) ou n'importe lequel avec projects.delete.
// Le fichier transite par ce serveur (corps brut, 10 Mo max) : le navigateur ne parle jamais à Supabase.
const COLS = "id, task_id, uploaded_by, file_name, size_bytes, mime_type, storage_path, created_at";

const toApi = (r, userId, canModerate) => ({
  id: r.id,
  taskId: r.task_id,
  uploadedBy: r.uploaded_by,
  fileName: r.file_name,
  size: r.size_bytes,
  mimeType: r.mime_type,
  createdAt: r.created_at,
  canDelete: r.uploaded_by === userId || canModerate,
});

const router = Router({ mergeParams: true });

router.get("/", requirePermission("projects.read"), async (req, res) => {
  const { projectId, taskId, orgId } = req.params;
  await assertProject(req.params);
  await assertTask(taskId, projectId);
  const rows = unwrap(
    await db.from("task_attachments").select(COLS).eq("task_id", taskId).order("created_at", { ascending: true }),
  );
  const canModerate = await hasPermission(req.auth, orgId, "projects.delete");
  res.json(rows.map((r) => toApi(r, req.auth.userId, canModerate)));
});

// Corps = les octets du fichier (Content-Type application/octet-stream). Nom et type en paramètres d'URL.
router.post(
  "/",
  requirePermission("projects.update"),
  express.raw({ type: () => true, limit: MAX_FILE_BYTES }),
  async (req, res) => {
    const { projectId, taskId, orgId } = req.params;
    const buf = req.body;
    if (!Buffer.isBuffer(buf) || buf.length === 0) throw httpError(400, "Fichier vide ou absent.");
    if (buf.length > MAX_FILE_BYTES) throw httpError(413, "Fichier trop volumineux (10 Mo maximum).");
    const fileName = cleanFileName(req.query.name);
    const mimeType = /^[\w.+-]+\/[\w.+-]+$/.test(String(req.query.type ?? "")) ? String(req.query.type) : "application/octet-stream";

    const project = await assertProject(req.params);
    const task = await assertTask(taskId, projectId);
    const { count, error: countError } = await db
      .from("task_attachments")
      .select("id", { count: "exact", head: true })
      .eq("task_id", task.id);
    if (countError) {
      console.error(countError);
      throw httpError(500, "Erreur base de données.");
    }
    if ((count ?? 0) >= MAX_FILES_PER_TASK) throw httpError(400, `${MAX_FILES_PER_TASK} fichiers au maximum par tâche.`);

    // Chemin choisi par le serveur (jamais le nom envoyé par le client).
    const id = randomUUID();
    const path = `${task.id}/${id}`;
    const up = await db.storage.from(BUCKET).upload(path, buf, { contentType: "application/octet-stream", upsert: false });
    if (up.error) {
      console.error("[storage] envoi impossible :", up.error.message);
      throw httpError(500, "Envoi du fichier impossible.");
    }
    const { data, error } = await db
      .from("task_attachments")
      .insert({ id, task_id: task.id, uploaded_by: req.auth.userId, file_name: fileName, size_bytes: buf.length, mime_type: mimeType, storage_path: path })
      .select(COLS)
      .single();
    if (error) {
      console.error(error);
      await removeFiles([path]); // pas de fichier orphelin si la ligne n'a pas pu être écrite
      throw httpError(500, "Erreur base de données.");
    }
    await logActivity({
      orgId, actorId: req.auth.userId, action: "update", entityType: "task",
      entityId: task.id, projectId: project.id, label: task.title,
      details: { project: project.name, attachment: "added" },
    });
    res.status(201).json(toApi(data, req.auth.userId, false));
  },
);

router.get("/:attachmentId", requirePermission("projects.read"), async (req, res) => {
  const { attachmentId, taskId, projectId } = req.params;
  if (!UUID_RE.test(attachmentId)) throw httpError(404, "Fichier introuvable.");
  await assertProject(req.params);
  await assertTask(taskId, projectId);
  const row = unwrap(await db.from("task_attachments").select(COLS).eq("id", attachmentId).eq("task_id", taskId).maybeSingle());
  if (!row) throw httpError(404, "Fichier introuvable.");
  const { data, error } = await db.storage.from(BUCKET).download(row.storage_path);
  if (error || !data) {
    console.error("[storage] lecture impossible :", error?.message);
    throw httpError(404, "Fichier introuvable dans le stockage.");
  }
  // Toujours en téléchargement, jamais affiché dans la page (pas d'exécution de HTML/SVG envoyé par un membre).
  res.set({
    "Content-Type": "application/octet-stream",
    "Content-Disposition": `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(row.file_name)}`,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-store",
  });
  res.send(Buffer.from(await data.arrayBuffer()));
});

router.delete("/:attachmentId", requirePermission("projects.update"), async (req, res) => {
  const { attachmentId, taskId, projectId, orgId } = req.params;
  if (!UUID_RE.test(attachmentId)) throw httpError(404, "Fichier introuvable.");
  const project = await assertProject(req.params);
  const task = await assertTask(taskId, projectId);
  const row = unwrap(await db.from("task_attachments").select(COLS).eq("id", attachmentId).eq("task_id", taskId).maybeSingle());
  if (!row) throw httpError(404, "Fichier introuvable.");
  if (row.uploaded_by !== req.auth.userId && !(await hasPermission(req.auth, orgId, "projects.delete"))) {
    throw httpError(403, "Seul l’auteur ou un responsable peut supprimer ce fichier.");
  }
  unwrap(await db.from("task_attachments").delete().eq("id", attachmentId));
  await removeFiles([row.storage_path]);
  await logActivity({
    orgId, actorId: req.auth.userId, action: "update", entityType: "task",
    entityId: task.id, projectId: project.id, label: task.title,
    details: { project: project.name, attachment: "removed" },
  });
  res.status(204).end();
});

export default router;
