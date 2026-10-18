// MAQUETTE (développement uniquement) — comparaison de 3 propositions de header unifié.
// Page d'entrée séparée : http://localhost:5173/header-preview.html
// Elle n'est PAS listée dans vite.config.js (build = index.html seul) : absente de la production.
// Aucun appel API, aucune session NEXIS, aucun écrit dans le stockage du navigateur.
import "../index.css"; // jetons de thème réels (--pri, --card, --tx…), repris par la maquette
import { mountHeaderPreview } from "./header-preview.engine";
import logoProjets from "../assets/logo.png";
import logoDocuments from "./logo-documents.png";

const root = document.getElementById("root");
if (!import.meta.env.DEV) {
  root.textContent = "Prévisualisation disponible uniquement en développement.";
} else {
  mountHeaderPreview(root, { projets: logoProjets, documents: logoDocuments });
}
