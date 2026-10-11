import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { captureLaunch, getToken, goToNexis } from "./session.js";
import { applyTheme } from "./theme.js";
import "./index.css";

applyTheme(); // avant le premier rendu : pas de flash de thème
captureLaunch(); // range le jeton reçu de NEXIS Identity avant tout rendu

// Pas de session : on part vers NEXIS Identity AVANT tout rendu (aucun écran de l'application n'est
// affiché pour rien). Si le garde-fou anti-boucle refuse, on affiche l'application et son message d'erreur.
if (getToken() || !goToNexis()) createRoot(document.getElementById("root")).render(<App />);
