import { useState } from "react";
import { toast } from "sonner";

import { ENDPOINTS } from "../../shared/api/endpoints";
import { api, parseResponse, toErrorText } from "../../shared/api/client";
import { Alert, AlertDescription, Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Input, Label } from "../../shared/ui";
import { useAppStore } from "../../store";

export function AuthPanel({ onAuthed, tokenKey, refreshKey }) {
  const setAccessToken = useAppStore((state) => state.setAccessToken);
  const setGlobalStatus = useAppStore((state) => state.setGlobalStatus);
  const authStatus = useAppStore((state) => state.authStatus);
  const authStatusMessage = useAppStore((state) => state.authStatusMessage);
  const hasStoredToken = useAppStore((state) => state.hasStoredToken);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  async function submit(path) {
    setLoading(true);
    setStatus("正在提交...");
    try {
      const resp = await api(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await parseResponse(resp);
      if (!resp.ok) {
        const message = toErrorText(data, "请求失败");
        setStatus(message);
        toast.error(message);
        return;
      }
      localStorage.setItem(tokenKey, data.access_token);
      localStorage.setItem(refreshKey, data.refresh_token);
      setAccessToken(data.access_token);
      setStatus("登录成功，正在进入首页");
      setGlobalStatus("");
      toast.success("登录成功");
      onAuthed(data);
    } catch (error) {
      const message = `网络错误: ${String(error)}`;
      setStatus(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  const isExpired = authStatus === "expired";
  const description = isExpired ? authStatusMessage || "当前登录已失效，请重新登录后继续。" : "上传素材，同步学习进度";
  const footerMessage = isExpired
    ? hasStoredToken
      ? "重新登录后会覆盖当前已失效的本地令牌。"
      : "请重新登录后继续。"
    : "登录后即可开始上传和学习。";

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isExpired ? "登录已失效" : "登录"}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            submit(ENDPOINTS.auth.login);
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="email">邮箱</Label>
            <Input id="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">密码</Label>
            <Input
              id="password"
              placeholder="至少6位"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={loading}>
              登录
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => submit(ENDPOINTS.auth.register)}
            >
              注册
            </Button>
          </div>
        </form>
      </CardContent>
      <CardFooter>
        {status ? (
          <Alert className="w-full py-2">
            <AlertDescription>{status}</AlertDescription>
          </Alert>
        ) : isExpired ? (
          <Alert variant="destructive" className="w-full py-2">
            <AlertDescription>{footerMessage}</AlertDescription>
          </Alert>
        ) : (
          <p className="text-sm text-muted-foreground">{footerMessage}</p>
        )}
      </CardFooter>
    </Card>
  );
}
