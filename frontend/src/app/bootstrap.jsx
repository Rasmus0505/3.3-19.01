import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { LEARNING_PAGE_PATHS } from "./learning-shell/panelRoutes";

const LearningPage = lazy(() => import("../pages/LearningPage").then((module) => ({ default: module.LearningPage })));
const AdminPage = lazy(() => import("../pages/AdminPage").then((module) => ({ default: module.AdminPage })));

export function BootstrapApp() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">页面加载中...</div>}>
      <Routes>
        {LEARNING_PAGE_PATHS.map((path) => (
          <Route key={path} path={path} element={<LearningPage />} />
        ))}
        <Route path="/models" element={<Navigate to="/upload" replace />} />
        <Route path="/admin/*" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
