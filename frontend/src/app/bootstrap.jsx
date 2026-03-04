import { AdminPage } from "../pages/AdminPage";
import { LearningPage } from "../pages/LearningPage";

export function BootstrapApp() {
  const isAdminRoute = window.location.pathname.startsWith("/admin");
  return isAdminRoute ? <AdminPage /> : <LearningPage />;
}
