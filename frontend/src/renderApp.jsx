import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router-dom";

import { Toaster, TooltipProvider } from "./shared/ui";
import "./index.css";

const AppRouter = import.meta.env.VITE_DESKTOP_RENDERER_BUILD === "1" ? HashRouter : BrowserRouter;

export function renderApp(BootstrapComponent) {
  createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <AppRouter>
        <TooltipProvider delayDuration={150}>
          <BootstrapComponent />
          <Toaster />
        </TooltipProvider>
      </AppRouter>
    </React.StrictMode>,
  );
}
