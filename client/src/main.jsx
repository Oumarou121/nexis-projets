import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import Portal, { portalToken } from "./Portal.jsx";
import { captureLaunch, getToken, goToNexis } from "./session.js";
import { applyTheme } from "./theme.js";
import "./index.css";

applyTheme(); // avant le premier rendu : pas de flash de thème

// Invité externe (lien « #/p/<jeton> » reçu par e-mail) : page en lecture seule, SANS session NEXIS.
// Branche entièrement séparée : ni captureLaunch, ni redirection vers NEXIS, ni appel à l'API de l'organisation.
const guestToken = portalToken();
if (guestToken) {
  createRoot(document.getElementById("root")).render(<Portal token={guestToken} />);
} else {
captureLaunch(); // range le jeton reçu de NEXIS Identity avant tout rendu

// Pas de session : on part vers NEXIS Identity AVANT tout rendu (aucun écran de l'application n'est
// affiché pour rien). Si le garde-fou anti-boucle refuse, on affiche l'application et son message d'erreur.
if (getToken() || !goToNexis()) createRoot(document.getElementById("root")).render(<App />);
}
