import { useEffect } from "react";
import { NavLink } from "react-router-dom";

import { AdminApp } from "../AdminApp";
import { api } from "../shared/api/client";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton } from "../shared/ui";
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
    return (
      <div className="section-soft min-h-screen bg-background">
        <div className="container-wrapper py-8">
          <div className="container">
            <Card>
              <CardHeader>
                <CardTitle>{expired ? "登录已失效" : "未登录"}</CardTitle>
                <CardDescription>{expired ? authStatusMessage || "请返回学习页重新登录后再访问管理员后台。" : "请先登录后再访问管理员后台。"}</CardDescription>
              </CardHeader>
              <CardContent className="flex gap-2">
                <Button asChild>
                  <NavLink to="/">返回学习页登录</NavLink>
                </Button>
                {hasStoredToken ? <Button variant="outline" onClick={logout}>退出登录</Button> : null}
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
                <CardTitle>权限不足</CardTitle>
                <CardDescription>需要管理员权限</CardDescription>
              </CardHeader>
              <CardContent className="flex gap-2">
                <Button variant="outline" asChild>
                  <NavLink to="/">返回学习页</NavLink>
                </Button>
                <Button onClick={logout}>退出登录</Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return <AdminApp apiCall={(path, options = {}) => api(path, options, accessToken)} onLogout={logout} />;
}
