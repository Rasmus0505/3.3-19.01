import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { LEARNING_PAGE_PATHS } from "./learning-shell/panelRoutes";

const LearningPage = lazy(() => import("../pages/LearningPage").then((module) => ({ default: module.LearningPage })));
const AdminPage = lazy(() => import("../pages/AdminPage").then((module) => ({ default: module.AdminPage })));
const ImmersivePage = lazy(() => import("../pages/ImmersivePage").then((module) => ({ default: module.default })));
const CoursePlayerPage = lazy(() => import("../features/course/CoursePlayerPage").then((module) => ({ default: module.CoursePlayerPage })));
const CourseCreatePage = lazy(() => import("../features/course/CourseCreatePage").then((module) => ({ default: module.CourseCreatePage })));
const CourseListPage = lazy(() => import("../features/course/CourseListPage").then((module) => ({ default: module.CourseListPage })));
const GenerationPreviewPage = lazy(() => import("../features/course/generation/GenerationPreview").then((module) => ({ default: module.GenerationPreview })));

export function BootstrapApp() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">页面加载中...</div>}>
      <Routes>
        {LEARNING_PAGE_PATHS.map((path) => (
          <Route key={path} path={path} element={<LearningPage />} />
        ))}
        <Route path="/models" element={<Navigate to="/upload" replace />} />
        <Route path="/admin/*" element={<AdminPage />} />
        <Route path="/immersive/:lessonId" element={<ImmersivePage />} />
        <Route path="/course/create" element={<CourseCreatePage />} />
        <Route path="/course" element={<CourseListPage />} />
        <Route path="/course/:courseId" element={<CoursePlayerPage />} />
        <Route path="/course/:courseId/generate" element={<GenerationPreviewPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
