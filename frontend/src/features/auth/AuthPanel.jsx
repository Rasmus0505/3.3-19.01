import { useState } from "react";

import { ENDPOINTS } from "../../shared/api/endpoints";
import { api, parseResponse, toErrorText } from "../../shared/api/client";
import { Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Input, Label } from "../../shared/ui";

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
        setStatus(toErrorText(data, "请求失败"));
        return;
      }
      localStorage.setItem(tokenKey, data.access_token);
      localStorage.setItem(refreshKey, data.refresh_token);
      setStatus("登录成功");
      onAuthed(data);
    } catch (error) {
      setStatus(`网络错误: ${String(error)}`);
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
        <div className="grid gap-2">
          <Label htmlFor="email">邮箱</Label>
          <Input id="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">密码</Label>
          <Input id="password" placeholder="至少6位" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <Button disabled={loading} onClick={() => submit(ENDPOINTS.auth.login)}>登录</Button>
          <Button variant="outline" disabled={loading} onClick={() => submit(ENDPOINTS.auth.register)}>注册</Button>
        </div>
      </CardContent>
      <CardFooter>
        {status ? <p className="text-sm text-muted-foreground">{status}</p> : <p className="text-sm text-muted-foreground">未登录状态</p>}
      </CardFooter>
    </Card>
  );
}
