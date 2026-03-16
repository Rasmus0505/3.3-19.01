import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

const AdminShellStandalone = lazy(() =>
  import("./AdminShellStandalone").then((module) => ({ default: module.AdminShellStandalone })),
);

export function BootstrapAdminApp() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">页面加载中...</div>}>
      <Routes>
        <Route path="/admin/*" element={<AdminShellStandalone />} />
        <Route path="*" element={<Navigate to="/admin/health" replace />} />
      </Routes>
    </Suspense>
  );
}
