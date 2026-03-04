import React from "react";
import { createRoot } from "react-dom/client";

import { BootstrapApp } from "./app/bootstrap";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BootstrapApp />
  </React.StrictMode>,
);
