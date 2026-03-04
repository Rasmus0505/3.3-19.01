import { useEffect, useState } from "react";

import { AdminApp } from "../AdminApp";
import { api } from "../shared/api/client";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "../shared/ui";
import { clearAuthStorage, TOKEN_KEY } from "./authStorage";

export function AdminShell() {
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
    const resp = await api("/api/admin/billing-rates", {}, accessToken);
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

  if (!accessToken) {
    return (
      <div className="style-vega section-soft min-h-screen bg-background">
        <div className="container-wrapper py-8">
          <div className="container">
            <Card>
              <CardHeader>
                <CardTitle>未登录</CardTitle>
                <CardDescription>请先登录后再访问管理员后台。</CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={() => { window.location.href = "/"; }}>返回学习页登录</Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  if (adminAuthState === "idle" || adminAuthState === "checking") {
    return (
      <div className="style-vega section-soft min-h-screen bg-background">
        <div className="container-wrapper py-8">
          <div className="container">
            <Card>
              <CardContent className="p-6">
                <p className="text-sm text-muted-foreground">正在验证管理员权限...</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  if (!isAdminUser) {
    return (
      <div className="style-vega section-soft min-h-screen bg-background">
        <div className="container-wrapper py-8">
          <div className="container">
            <Card>
              <CardHeader>
                <CardTitle>无管理员权限</CardTitle>
                <CardDescription>当前账号不在 `ADMIN_EMAILS` 白名单中。</CardDescription>
              </CardHeader>
              <CardContent className="flex gap-2">
                <Button variant="outline" onClick={() => { window.location.href = "/"; }}>返回学习页</Button>
                <Button onClick={handleLogout}>退出登录</Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AdminApp
      apiCall={(path, options = {}) => api(path, options, accessToken)}
      onLogout={handleLogout}
    />
  );
}
