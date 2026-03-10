import { Navigate, Route, Routes } from "react-router-dom";

import { AdminShellStandalone } from "./AdminShellStandalone";

export function BootstrapAdminApp() {
  return (
    <Routes>
      <Route path="/admin/*" element={<AdminShellStandalone />} />
      <Route path="*" element={<Navigate to="/admin/ops" replace />} />
    </Routes>
  );
}
