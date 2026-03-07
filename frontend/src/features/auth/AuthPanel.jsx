import { Sparkles } from "lucide-react";
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
    <Card className="apple-panel">
      <CardHeader className="space-y-3.5">
        <div className="apple-kicker w-fit">
          <Sparkles className="size-3.5" />
          登录
        </div>
        <div className="space-y-1.5">
          <CardTitle className="text-[1.8rem] tracking-tight">登录开始学习</CardTitle>
          <CardDescription className="max-w-md">登录后上传素材，系统会自动生成课程。</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <form
          className="space-y-4 rounded-[1.85rem] border border-white/72 bg-white/80 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.74),0_18px_42px_-38px_rgba(15,23,42,0.16)] md:p-6"
          onSubmit={(event) => {
            event.preventDefault();
            submit(ENDPOINTS.auth.login);
          }}
        >
          <div className="space-y-1">
            <p className="apple-eyebrow">开始学习</p>
            <p className="text-sm leading-6 text-slate-500">用同一个账号继续课程和进度。</p>
          </div>
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
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" className="flex-1" disabled={loading}>
              登录
            </Button>
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              disabled={loading}
              onClick={() => submit(ENDPOINTS.auth.register)}
            >
              注册
            </Button>
          </div>
        </form>
      </CardContent>
      <CardFooter className="pt-0">
        {status ? (
          <Alert className="w-full border-white/75 bg-white/76 py-3">
            <AlertDescription>{status}</AlertDescription>
          </Alert>
        ) : (
          <p className="text-sm text-slate-500">没有账号也可以直接注册。</p>
        )}
      </CardFooter>
    </Card>
  );
}
