import { AdminApp } from "../../AdminApp";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
} from "../../shared/ui";

export function LearningShellAdminContent({
  accessToken,
  hasStoredToken,
  authStatus,
  authStatusMessage,
  adminAuthState,
  isAdminUser,
  onGoToLogin,
  onGoToHistory,
  onLogout,
  apiCall,
}) {
  if (!accessToken) {
    const expired = authStatus === "expired";
    return (
      <Card>
        <CardHeader>
          <CardTitle>{expired ? "登录已失效" : "未登录"}</CardTitle>
          <CardDescription>
            {expired ? authStatusMessage || "请返回学习页重新登录后再访问管理台。" : "请先登录后再访问管理台。"}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button onClick={onGoToLogin}>返回学习页登录</Button>
          {hasStoredToken ? (
            <Button variant="outline" onClick={onLogout}>
              退出登录
            </Button>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  if (adminAuthState === "idle" || adminAuthState === "checking") {
    return (
      <Card>
        <CardContent className="space-y-3 p-6">
          <p className="text-sm text-muted-foreground">正在验证管理员权限...</p>
          <Skeleton className="h-4 w-52" />
        </CardContent>
      </Card>
    );
  }

  if (!isAdminUser) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>权限不足</CardTitle>
          <CardDescription>需要管理员权限</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button variant="outline" onClick={onGoToHistory}>
            返回学习页
          </Button>
          <Button onClick={onLogout}>退出登录</Button>
        </CardContent>
      </Card>
    );
  }

  return <AdminApp apiCall={apiCall} onLogout={onLogout} />;
}
