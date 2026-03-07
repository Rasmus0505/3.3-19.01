import { ArrowLeft, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";

import { AdminApp } from "../AdminApp";
import { AuthPanel } from "../features/auth/AuthPanel";
import { adminApi } from "../shared/api/adminClient";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton } from "../shared/ui";
import { clearAuthStorage, REFRESH_KEY, TOKEN_KEY } from "./authStorage";

function AdminStateLayout({ eyebrow, title, description, actions, children }) {
  return (
    <div className="section-soft min-h-screen bg-background">
      <div className="container-wrapper py-8 md:py-12">
        <div className="container">
          <div className="mx-auto max-w-4xl">
            <Card className="apple-panel">
              <CardHeader className="space-y-4">
                <div className="apple-kicker w-fit">
                  <Sparkles className="size-3.5" />
                  {eyebrow}
                </div>
                <div className="space-y-2">
                  <CardTitle className="text-3xl">{title}</CardTitle>
                  <CardDescription>{description}</CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">Standalone Admin</Badge>
                  <Badge variant="outline">与主站共享账户体系</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                {children}
                {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

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
      <AdminStateLayout
        eyebrow="Standalone Login"
        title="使用管理员账号登录独立后台"
        description="此入口用于独立部署的管理前端，仍然沿用当前 token 与刷新逻辑。"
        actions={
          <Button variant="outline" asChild>
            <NavLink to="/admin/users">
              <ArrowLeft className="size-4" />
              前往后台首页
            </NavLink>
          </Button>
        }
      >
        <AuthPanel onAuthed={handleAuthed} tokenKey={TOKEN_KEY} refreshKey={REFRESH_KEY} />
      </AdminStateLayout>
    );
  }

  if (adminAuthState === "idle" || adminAuthState === "checking") {
    return (
      <AdminStateLayout
        eyebrow="Checking Access"
        title="正在验证管理员权限"
        description="系统会先检查管理员白名单，通过后再进入新后台工作台。"
      >
        <div className="space-y-3 rounded-[1.75rem] border border-white/70 bg-white/72 p-5">
          <Skeleton className="h-5 w-48 rounded-full" />
          <Skeleton className="h-4 w-full rounded-full" />
          <Skeleton className="h-4 w-2/3 rounded-full" />
        </div>
      </AdminStateLayout>
    );
  }

  if (!isAdminUser) {
    return (
      <AdminStateLayout
        eyebrow="Access Limited"
        title="当前账号没有管理员权限"
        description="请确认该邮箱已加入 `ADMIN_EMAILS` 白名单，之后重新登录即可。"
        actions={
          <>
            <Button variant="outline" asChild>
              <NavLink to="/admin/users">刷新重试</NavLink>
            </Button>
            <Button onClick={handleLogout}>
              <ShieldCheck className="size-4" />
              退出登录
            </Button>
          </>
        }
      >
        <div className="rounded-[1.75rem] border border-white/70 bg-white/72 p-5">
          <p className="text-sm font-medium text-slate-950">当前状态</p>
          <p className="mt-2 text-sm leading-6 text-slate-500">接口可访问，但鉴权结果显示当前账户不是管理员。</p>
        </div>
      </AdminStateLayout>
    );
  }

  return <AdminApp apiCall={(path, options = {}) => adminApi(path, options, accessToken)} onLogout={handleLogout} />;
}
