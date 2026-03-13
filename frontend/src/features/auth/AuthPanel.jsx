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
    setStatus("正在确认身份...");
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
      setStatus("登录成功，正在回到学习工作台。");
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
  const title = isExpired ? "重新登录后继续学习" : "先登录，再开始生成课程";
  const description = isExpired
    ? authStatusMessage || "当前登录已失效。重新登录后，课程进度、上传状态和点数才会继续同步。"
    : "只要登录一次，上传、课程历史和点数都会跟着这个账号走。";
  const footerMessage = isExpired
    ? hasStoredToken
      ? "重新登录后会覆盖本地已失效的登录状态。"
      : "重新登录后即可继续。"
    : "没有账号也没关系，直接注册后就能继续。";
  const guideSteps = [
    { title: "输入邮箱和密码", note: "登录和注册都只需要这两项。" },
    { title: "确认身份", note: "成功后，系统会把你带回学习工作台。" },
    { title: "继续上传或学习", note: "之后的课程、进度和点数都会自动同步。" },
  ];

  return (
    <Card>
      <CardHeader className="space-y-0">
        <div className="manual-kicker">{isExpired ? "登录已过期" : "开始使用"}</div>
        <CardTitle className="manual-title">{title}</CardTitle>
        <CardDescription className="manual-subtitle">{description}</CardDescription>
        <div className="manual-steps">
          {guideSteps.map((step, index) => (
            <div key={step.title} className="manual-step">
              <span className="manual-step-index">{index + 1}</span>
              <div>
                <p className="manual-step-title">{step.title}</p>
                <p className="manual-step-note">{step.note}</p>
              </div>
            </div>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="manual-soft-card space-y-4">
          <div className="flex flex-wrap gap-2">
            <span className="manual-chip manual-chip-info">上传后自动同步到账号</span>
            <span className="manual-chip manual-chip-neutral">支持直接注册新账号</span>
          </div>
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
                placeholder="至少 6 位"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={loading}>
                登录账号
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={loading}
                onClick={() => submit(ENDPOINTS.auth.register)}
              >
                注册新账号
              </Button>
            </div>
          </form>
        </div>
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
