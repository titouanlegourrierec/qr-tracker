import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router";

import { App } from "./App.js";
import "./styles.css";

const container = document.getElementById("root");
if (container === null) throw new Error("Missing #root element");

createRoot(container).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);
