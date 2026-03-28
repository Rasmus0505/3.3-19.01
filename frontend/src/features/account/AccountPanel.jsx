import { CircleUserRound, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { writeStoredUser } from "../../app/authStorage";
import { parseResponse, toErrorText } from "../../shared/api/client";
import { Alert, AlertDescription, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from "../../shared/ui";
import { useAppStore } from "../../store";
import { RedeemCodePanel } from "../wallet/components/RedeemCodePanel";

export function AccountPanel({ apiCall, currentUser, onWalletChanged }) {
  const setCurrentUser = useAppStore((state) => state.setCurrentUser);
  const [username, setUsername] = useState(currentUser?.username || "");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    setUsername(currentUser?.username || "");
  }, [currentUser?.username]);

  async function handleRename(event) {
    event.preventDefault();
    if (!username.trim()) {
      setStatus("请输入新的用户名");
      return;
    }
    setLoading(true);
    setStatus("");
    try {
      const resp = await apiCall("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim() }),
      });
      const data = await parseResponse(resp);
      if (!resp.ok) {
        const message = toErrorText(data, "更新用户名失败");
        setStatus(message);
        toast.error(message);
        return;
      }
      writeStoredUser(data);
      setCurrentUser(data);
      setUsername(String(data?.username || ""));
      setStatus("用户名已更新");
      toast.success("用户名已更新");
    } catch (error) {
      const message = `网络错误: ${String(error)}`;
      setStatus(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CircleUserRound className="size-4" />
            个人中心
          </CardTitle>
          <CardDescription>这里统一管理用户名、登录身份和兑换码充值，不再单独拆分账户入口。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border bg-muted/10 px-4 py-3">
              <p className="text-xs text-muted-foreground">当前用户名</p>
              <p className="mt-1 text-sm font-medium">{currentUser?.username || "未设置"}</p>
            </div>
            <div className="rounded-2xl border bg-muted/10 px-4 py-3">
              <p className="text-xs text-muted-foreground">登录邮箱</p>
              <p className="mt-1 text-sm font-medium">{currentUser?.email || "未读取到邮箱"}</p>
            </div>
          </div>

          <form className="space-y-3" onSubmit={handleRename}>
            <div className="space-y-2">
              <p className="text-sm font-medium">修改用户名</p>
              <Input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="例如 Bottle Learner" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={loading} className="h-9 px-4">
                <Save className="size-4" />
                {loading ? "保存中..." : "保存用户名"}
              </Button>
            </div>
          </form>

          {status ? (
            <Alert>
              <AlertDescription>{status}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <RedeemCodePanel apiCall={apiCall} onWalletChanged={onWalletChanged} />
    </div>
  );
}
