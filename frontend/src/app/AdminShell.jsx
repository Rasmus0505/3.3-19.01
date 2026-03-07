import { ArrowLeft, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";

import { AdminApp } from "../AdminApp";
import { api } from "../shared/api/client";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton } from "../shared/ui";
import { clearAuthStorage, TOKEN_KEY } from "./authStorage";

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
                  <Badge variant="outline">Admin Access</Badge>
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
      <AdminStateLayout
        eyebrow="Admin Login"
        title="先从主站登录，再进入管理后台"
        description="当前入口复用主站账号体系。你无需新增部署步骤，只要先在学习页完成登录。"
        actions={
          <Button asChild>
            <NavLink to="/">
              <ArrowLeft className="size-4" />
              返回学习页登录
            </NavLink>
          </Button>
        }
      >
        <div className="rounded-[1.75rem] border border-white/70 bg-white/72 p-5">
          <p className="text-sm font-medium text-slate-950">为什么这样做</p>
          <p className="mt-2 text-sm leading-6 text-slate-500">保持现有鉴权逻辑与部署结构不变，避免额外的 Zeabur 配置和运维成本。</p>
        </div>
      </AdminStateLayout>
    );
  }

  if (adminAuthState === "idle" || adminAuthState === "checking") {
    return (
      <AdminStateLayout
        eyebrow="Checking Access"
        title="正在验证管理员权限"
        description="系统会沿用当前白名单逻辑检查 `ADMIN_EMAILS`，只要验证通过就会进入新后台。"
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
        description="账号已登录，但不在 `ADMIN_EMAILS` 白名单中，因此无法进入管理工作台。"
        actions={
          <>
            <Button variant="outline" asChild>
              <NavLink to="/">
                <ArrowLeft className="size-4" />
                返回学习页
              </NavLink>
            </Button>
            <Button onClick={handleLogout}>
              <ShieldCheck className="size-4" />
              退出登录
            </Button>
          </>
        }
      >
        <div className="rounded-[1.75rem] border border-white/70 bg-white/72 p-5">
          <p className="text-sm font-medium text-slate-950">处理建议</p>
          <p className="mt-2 text-sm leading-6 text-slate-500">请确认当前邮箱是否被加入环境变量 `ADMIN_EMAILS`，修改后重新登录即可。</p>
        </div>
      </AdminStateLayout>
    );
  }

  return <AdminApp apiCall={(path, options = {}) => api(path, options, accessToken)} onLogout={handleLogout} />;
}
