import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { captureLaunch } from "./session.js";
import { applyTheme } from "./theme.js";
import "./index.css";

applyTheme(); // avant le premier rendu : pas de flash de thème
captureLaunch(); // range le jeton reçu de NEXIS Identity avant tout rendu
createRoot(document.getElementById("root")).render(<App />);
