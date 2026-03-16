import { useEffect } from "react";
import { NavLink } from "react-router-dom";

import { AdminApp } from "../AdminApp";
import { AuthPanel } from "../features/auth/AuthPanel";
import { adminApi } from "../shared/api/adminClient";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton } from "../shared/ui";
import { useAppStore } from "../store";
import { REFRESH_KEY, TOKEN_KEY } from "./authStorage";

export function AdminShellStandalone() {
  const accessToken = useAppStore((state) => state.accessToken);
  const hasStoredToken = useAppStore((state) => state.hasStoredToken);
  const authStatus = useAppStore((state) => state.authStatus);
  const authStatusMessage = useAppStore((state) => state.authStatusMessage);
  const isAdminUser = useAppStore((state) => state.isAdminUser);
  const adminAuthState = useAppStore((state) => state.adminAuthState);
  const detectAdmin = useAppStore((state) => state.detectAdmin);
  const hydrateAccessToken = useAppStore((state) => state.hydrateAccessToken);
  const logout = useAppStore((state) => state.logout);

  useEffect(() => {
    hydrateAccessToken();
  }, [hydrateAccessToken]);

  useEffect(() => {
    if (!accessToken) return;
    void detectAdmin(adminApi);
  }, [accessToken, detectAdmin]);

  if (!accessToken) {
    const expired = authStatus === "expired";
    return (
      <div className="section-soft min-h-screen bg-background">
        <div className="container-wrapper py-8">
          <div className="container">
            <Card>
              <CardHeader>
                <CardTitle>{expired ? "管理员登录已失效" : "未登录"}</CardTitle>
                <CardDescription>{expired ? authStatusMessage || "请重新登录管理员账号后继续。" : "请使用管理员账号登录后访问独立管理后台。"}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <AuthPanel onAuthed={hydrateAccessToken} tokenKey={TOKEN_KEY} refreshKey={REFRESH_KEY} />
                {hasStoredToken ? (
                  <div className="flex justify-end">
                    <Button variant="outline" onClick={logout}>
                      退出登录
                    </Button>
                  </div>
                ) : null}
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
                  <NavLink to="/admin/health">刷新重试</NavLink>
                </Button>
                <Button onClick={logout}>退出登录</Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return <AdminApp apiCall={(path, options = {}) => adminApi(path, options, accessToken)} onLogout={logout} />;
}
