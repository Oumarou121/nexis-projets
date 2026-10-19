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
// Deux façons d'envoyer et de télécharger :
//  * par ce serveur (corps brut, 10 Mo max) : POST / et GET /:id — serveur Node classique ;
//  * en direct avec le stockage, par URL signée : POST /upload-url + /confirm et GET /:id?link=1 — utilisé par
//    le client, et seul possible sur Vercel (corps et réponses limités à 4,5 Mo).
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

// ───── Envoi direct vers le stockage (hébergement serverless : Vercel refuse les corps de plus de 4,5 Mo) ─────
// 1. upload-url : le serveur vérifie droits, taille et quota, choisit le chemin et renvoie une URL d'envoi signée ;
// 2. le navigateur envoie le fichier directement au stockage Supabase avec cette URL ;
// 3. confirm : le serveur vérifie que le fichier existe vraiment (et sa taille) avant d'écrire la ligne.

async function assertRoomForFile(taskId) {
  const { count, error } = await db.from("task_attachments").select("id", { count: "exact", head: true }).eq("task_id", taskId);
  if (error) {
    console.error(error);
    throw httpError(500, "Erreur base de données.");
  }
  if ((count ?? 0) >= MAX_FILES_PER_TASK) throw httpError(400, `${MAX_FILES_PER_TASK} fichiers au maximum par tâche.`);
}

const cleanMime = (raw) => (/^[\w.+-]+\/[\w.+-]+$/.test(String(raw ?? "")) ? String(raw) : "application/octet-stream");

router.post("/upload-url", requirePermission("projects.update"), async (req, res) => {
  const { projectId, taskId } = req.params;
  const size = Number(req.body?.size);
  if (!Number.isInteger(size) || size <= 0) throw httpError(400, "Fichier vide ou absent.");
  if (size > MAX_FILE_BYTES) throw httpError(413, "Fichier trop volumineux (10 Mo maximum).");
  await assertProject(req.params);
  const task = await assertTask(taskId, projectId);
  await assertRoomForFile(task.id);

  const uploadId = randomUUID();
  const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(`${task.id}/${uploadId}`);
  if (error || !data?.signedUrl) {
    console.error("[storage] URL d'envoi impossible :", error?.message);
    throw httpError(500, "Envoi du fichier impossible.");
  }
  res.set("Cache-Control", "no-store").json({ uploadId, uploadUrl: data.signedUrl });
});

router.post("/confirm", requirePermission("projects.update"), async (req, res) => {
  const { projectId, taskId, orgId } = req.params;
  const uploadId = String(req.body?.uploadId ?? "");
  if (!UUID_RE.test(uploadId)) throw httpError(400, "Envoi inconnu.");
  const project = await assertProject(req.params);
  const task = await assertTask(taskId, projectId);
  await assertRoomForFile(task.id);

  // Chemin recalculé par le serveur : le client ne désigne jamais un fichier d'une autre tâche.
  const path = `${task.id}/${uploadId}`;
  const { data: found, error: listError } = await db.storage.from(BUCKET).list(task.id, { search: uploadId, limit: 1 });
  const object = listError ? null : (found ?? []).find((f) => f.name === uploadId);
  if (!object) throw httpError(400, "Le fichier n’a pas été reçu. Réessayez l’envoi.");
  const size = Number(object.metadata?.size ?? 0);
  if (size <= 0 || size > MAX_FILE_BYTES) {
    await removeFiles([path]);
    throw httpError(413, "Fichier trop volumineux (10 Mo maximum).");
  }

  const { data, error } = await db
    .from("task_attachments")
    .insert({
      id: uploadId, task_id: task.id, uploaded_by: req.auth.userId, file_name: cleanFileName(req.body?.name),
      size_bytes: size, mime_type: cleanMime(req.body?.type), storage_path: path,
    })
    .select(COLS)
    .single();
  if (error) {
    console.error(error);
    await removeFiles([path]);
    throw httpError(500, "Erreur base de données.");
  }
  await logActivity({
    orgId, actorId: req.auth.userId, action: "update", entityType: "task",
    entityId: task.id, projectId: project.id, label: task.title,
    details: { project: project.name, attachment: "added" },
  });
  res.status(201).json(toApi(data, req.auth.userId, false));
});

router.get("/:attachmentId", requirePermission("projects.read"), async (req, res) => {
  const { attachmentId, taskId, projectId } = req.params;
  if (!UUID_RE.test(attachmentId)) throw httpError(404, "Fichier introuvable.");
  await assertProject(req.params);
  await assertTask(taskId, projectId);
  const row = unwrap(await db.from("task_attachments").select(COLS).eq("id", attachmentId).eq("task_id", taskId).maybeSingle());
  if (!row) throw httpError(404, "Fichier introuvable.");

  // ?link=1 : lien de téléchargement signé, valable 60 s, toujours en pièce jointe (Content-Disposition: attachment).
  // Le fichier ne transite pas par ce serveur (limite de 4,5 Mo des réponses serverless).
  if (req.query.link === "1") {
    const { data: signed, error: signError } = await db.storage
      .from(BUCKET)
      .createSignedUrl(row.storage_path, 60, { download: row.file_name });
    if (signError || !signed?.signedUrl) {
      console.error("[storage] lien de téléchargement impossible :", signError?.message);
      throw httpError(404, "Fichier introuvable dans le stockage.");
    }
    return res.set("Cache-Control", "private, no-store").json({ url: signed.signedUrl });
  }
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
