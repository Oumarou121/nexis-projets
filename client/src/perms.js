import { createContext, useContext } from "react";

/**
 * Droits de l'utilisateur dans l'organisation active (voir App.jsx). Par défaut : tout permis.
 * Mêmes règles que le serveur (server/src/access.js) ; le serveur reste seul juge, ceci ne fait
 * qu'afficher ou masquer.
 *   canEdit   : contribuer (créer des tâches, modifier les siennes, commenter, joindre des fichiers)
 *   canManage : gérer le projet (paramètres, visibilité, membres, invités, étapes) et toutes les tâches
 *   canEditTask(t, parent?) : modifier cette tâche (gestionnaire, ou tâche créée par soi / assignée à soi,
 *                             ou sous-tâche d'une telle tâche)
 *   canDeleteTask(t)        : supprimer cette tâche (gestionnaire ou créateur)
 *   canAssignTo(userId)     : un contributeur ne s'assigne qu'à lui-même
 */
const all = () => true;
export const PermsContext = createContext({
  canCreate: true, canEdit: true, canDelete: true, canManage: true, userId: null,
  canEditTask: all, canDeleteTask: all, canAssignTo: all,
});
export const usePerms = () => useContext(PermsContext);

/** Construit les droits à partir des permissions de l'organisation et de l'utilisateur connecté. */
export function buildPerms(has, userId) {
  const canEdit = has("projects.update");
  const canManage = canEdit && (has("projects.manage") || has("projects.delete"));
  const owns = (t) => !!t && !!userId && (t.createdBy === userId || t.assigneeId === userId);
  return {
    canCreate: has("projects.create"),
    canEdit,
    canDelete: has("projects.delete"),
    canManage,
    userId,
    canEditTask: (t, parent) => canManage || (canEdit && (owns(t) || owns(parent))),
    canDeleteTask: (t) => canManage || (canEdit && !!t && t.createdBy === userId),
    canAssignTo: (id) => canManage || (canEdit && (!id || id === userId)),
  };
}

/**
 * Droits DANS un projet, d'après le rôle effectif que renvoie le serveur (project.myRole) :
 *   manager (responsable) : tout ; contributor : ses tâches ; viewer (observateur) : lire et commenter.
 * Sans myRole (ancien serveur), on garde les droits de l'organisation.
 */
export function projectPerms(base, myRole) {
  if (!myRole) return { ...base, canComment: base.canEdit };
  const canManage = myRole === "manager";
  const canEdit = canManage || myRole === "contributor";
  const userId = base.userId;
  const owns = (t) => !!t && !!userId && (t.createdBy === userId || t.assigneeId === userId);
  return {
    ...base,
    myRole,
    canEdit,
    canManage,
    canComment: true,
    canEditTask: (t, parent) => canManage || (canEdit && (owns(t) || owns(parent))),
    canDeleteTask: (t) => canManage || (canEdit && !!t && t.createdBy === userId),
    canAssignTo: (id) => canManage || (canEdit && (!id || id === userId)),
  };
}

export const ROLE_LABELS = { manager: "Responsable", contributor: "Contributeur", viewer: "Observateur" };
export const ROLE_HINTS = {
  manager: "Gère le projet : paramètres, membres, étapes et toutes les tâches.",
  contributor: "Crée des tâches et fait avancer les siennes.",
  viewer: "Lit et commente.",
};

/** Fonction activée dans les « Paramètres du projet » (dependencies, milestones, timesheets…). */
export const featureOn = (project, key) => !!project?.settings?.[key];
