import { createContext, useContext } from "react";

/** Droits de l'utilisateur dans l'organisation active (voir App.jsx). Par défaut : tout permis. */
export const PermsContext = createContext({ canCreate: true, canEdit: true, canDelete: true });
export const usePerms = () => useContext(PermsContext);

/** Fonction activée dans les « Paramètres du projet » (dependencies, milestones, timesheets…). */
export const featureOn = (project, key) => !!project?.settings?.[key];
