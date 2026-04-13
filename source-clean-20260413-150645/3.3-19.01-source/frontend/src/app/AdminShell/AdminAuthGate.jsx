import { NavLink } from "react-router-dom";

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton } from "../../shared/ui";

export function AdminNotLoggedIn({ expired, authStatusMessage, hasStoredToken, onLogout }) {
  return (
    <div className="section-soft min-h-screen bg-background">
      <div className="container-wrapper py-8">
        <div className="container">
          <Card>
            <CardHeader>
              <CardTitle>{expired ? "登录已失效" : "未登录"}</CardTitle>
              <CardDescription>
                {expired ? authStatusMessage || "请返回学习页重新登录后再访问管理员后台。" : "请先登录后再访问管理员后台。"}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2">
              <Button asChild>
                <NavLink to="/">返回学习页登录</NavLink>
              </Button>
              {hasStoredToken ? (
                <Button variant="outline" onClick={onLogout}>
                  退出登录
                </Button>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export function AdminAuthChecking() {
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

export function AdminNoPermission({ onLogout }) {
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
              <Button onClick={onLogout}>退出登录</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
