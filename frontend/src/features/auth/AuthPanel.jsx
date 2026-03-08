import { useState } from "react";
import { toast } from "sonner";

import { ENDPOINTS } from "../../shared/api/endpoints";
import { api, parseResponse, toErrorText } from "../../shared/api/client";
import { Alert, AlertDescription, Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Input, Label } from "../../shared/ui";

export function AuthPanel({ onAuthed, tokenKey, refreshKey }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  async function submit(path) {
    setLoading(true);
    setStatus("提交中...");
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
      setStatus("登录成功");
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>登录 / 注册</CardTitle>
        <CardDescription>先登录后再上传素材并开始句级练习。</CardDescription>
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
        ) : (
          <p className="text-sm text-muted-foreground">未登录状态</p>
        )}
      </CardFooter>
    </Card>
  );
}
