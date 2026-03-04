import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { BootstrapApp } from "./app/bootstrap";
import { Toaster } from "./shared/ui";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <BootstrapApp />
      <Toaster />
    </BrowserRouter>
  </React.StrictMode>,
);
