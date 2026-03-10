import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

const LearningPage = lazy(() => import("../pages/LearningPage").then((module) => ({ default: module.LearningPage })));
const AdminPage = lazy(() => import("../pages/AdminPage").then((module) => ({ default: module.AdminPage })));

export function BootstrapApp() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">页面加载中...</div>}>
      <Routes>
        <Route path="/" element={<LearningPage />} />
        <Route path="/upload" element={<LearningPage />} />
        <Route path="/redeem" element={<LearningPage />} />
        <Route path="/admin/*" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
