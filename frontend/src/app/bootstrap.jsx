import { Navigate, Route, Routes } from "react-router-dom";

import { AdminPage } from "../pages/AdminPage";
import { LearningPage } from "../pages/LearningPage";

export function BootstrapApp() {
  return (
    <Routes>
      <Route path="/" element={<LearningPage />} />
      <Route path="/upload" element={<LearningPage />} />
      <Route path="/redeem" element={<LearningPage />} />
      <Route path="/admin/*" element={<AdminPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
