import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";

import { AdminApp } from "../AdminApp";
import { AuthPanel } from "../features/auth/AuthPanel";
import { adminApi } from "../shared/api/adminClient";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton } from "../shared/ui";
import { clearAuthStorage, REFRESH_KEY, TOKEN_KEY } from "./authStorage";

export function AdminShellStandalone() {
  const [accessToken, setAccessToken] = useState(() => localStorage.getItem(TOKEN_KEY) || "");
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [adminAuthState, setAdminAuthState] = useState("idle");

  async function detectAdmin() {
    if (!accessToken) {
      setAdminAuthState("idle");
      setIsAdminUser(false);
      return;
    }
    setAdminAuthState("checking");
    const resp = await adminApi("/api/admin/billing-rates", {}, accessToken);
    if (resp.ok) {
      setIsAdminUser(true);
      setAdminAuthState("ready");
      return;
    }
    if (resp.status === 403) {
      setIsAdminUser(false);
      setAdminAuthState("forbidden");
      return;
    }
    setIsAdminUser(false);
    setAdminAuthState("forbidden");
  }

  useEffect(() => {
    detectAdmin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  function handleLogout() {
    clearAuthStorage();
    setAccessToken("");
    setIsAdminUser(false);
    setAdminAuthState("idle");
  }

  function handleAuthed() {
    setAccessToken(localStorage.getItem(TOKEN_KEY) || "");
  }

  if (!accessToken) {
    return (
      <div className="section-soft min-h-screen bg-background">
        <div className="container-wrapper py-8">
          <div className="container">
            <Card>
              <CardHeader>
                <CardTitle>未登录</CardTitle>
                <CardDescription>请使用管理员账号登录后访问独立管理后台。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <AuthPanel onAuthed={handleAuthed} tokenKey={TOKEN_KEY} refreshKey={REFRESH_KEY} />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  if (adminAuthState === "idle" || adminAuthState === "checking") {
    return (
      <div className="section-soft min-h-screen bg-background">
        <div className="container-wrapper py-8">
          <div className="container">
            <Card>
              <CardContent className="space-y-3 p-6">
                <p className="text-sm text-muted-foreground">正在验证管理员权限...</p>
                <Skeleton className="h-4 w-52" />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  if (!isAdminUser) {
    return (
      <div className="section-soft min-h-screen bg-background">
        <div className="container-wrapper py-8">
          <div className="container">
            <Card>
              <CardHeader>
                <CardTitle>无管理员权限</CardTitle>
                <CardDescription>当前账号不在 `ADMIN_EMAILS` 白名单内。</CardDescription>
              </CardHeader>
              <CardContent className="flex gap-2">
                <Button variant="outline" asChild>
                  <NavLink to="/admin/users">刷新重试</NavLink>
                </Button>
                <Button onClick={handleLogout}>退出登录</Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return <AdminApp apiCall={(path, options = {}) => adminApi(path, options, accessToken)} onLogout={handleLogout} />;
}
