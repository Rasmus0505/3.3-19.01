import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { BootstrapAdminApp } from "./app/bootstrap-admin";
import { Toaster, TooltipProvider } from "./shared/ui";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <TooltipProvider delayDuration={150}>
        <BootstrapAdminApp />
        <Toaster />
      </TooltipProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
