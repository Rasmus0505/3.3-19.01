import { useEffect } from "react";

import { AdminApp } from "../AdminApp";
import { AdminAuthChecking, AdminNoPermission, AdminNotLoggedIn } from "./AdminShell";
import { api } from "../shared/api/client";
import { useAppStore } from "../store";

export function AdminShell() {
  const accessToken = useAppStore((state) => state.accessToken);
  const hasStoredToken = useAppStore((state) => state.hasStoredToken);
  const authStatus = useAppStore((state) => state.authStatus);
  const authStatusMessage = useAppStore((state) => state.authStatusMessage);
  const isAdminUser = useAppStore((state) => state.isAdminUser);
  const adminAuthState = useAppStore((state) => state.adminAuthState);
  const detectAdmin = useAppStore((state) => state.detectAdmin);
  const logout = useAppStore((state) => state.logout);

  useEffect(() => {
    if (!accessToken) return;
    void detectAdmin(api);
  }, [accessToken, detectAdmin]);

  if (!accessToken) {
    const expired = authStatus === "expired";
    return <AdminNotLoggedIn expired={expired} authStatusMessage={authStatusMessage} hasStoredToken={hasStoredToken} onLogout={logout} />;
  }

  if (adminAuthState === "idle" || adminAuthState === "checking") {
    return <AdminAuthChecking />;
  }

  if (!isAdminUser) {
    return <AdminNoPermission onLogout={logout} />;
  }

  return <AdminApp apiCall={(path, options = {}) => api(path, options, accessToken)} onLogout={logout} />;
}
