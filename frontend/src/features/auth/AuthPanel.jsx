import { ShieldCheck, Sparkles, WandSparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ENDPOINTS } from "../../shared/api/endpoints";
import { api, parseResponse, toErrorText } from "../../shared/api/client";
import { Alert, AlertDescription, Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Input, Label } from "../../shared/ui";

const benefitItems = [
  {
    icon: Sparkles,
    title: "更像产品，不像工具",
    description: "登录后即可进入品牌化学习工作台，上传素材、管理课程与开始沉浸学习。",
  },
  {
    icon: WandSparkles,
    title: "上传后自动生成课程",
    description: "沿用现有转写链路，不改接口和业务字段，只升级外观与层级。",
  },
  {
    icon: ShieldCheck,
    title: "同账号同步积分与权限",
    description: "钱包余额、兑换码和管理员入口保持原有逻辑，仍可直接继续使用。",
  },
];

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
          Welcome
        </div>
        <div className="space-y-1.5">
          <CardTitle className="text-[1.8rem] tracking-tight">登录后继续你的学习进度</CardTitle>
          <CardDescription className="max-w-md">保留现有登录 / 注册逻辑，把入口收敛为更直接、更像主操作区的表单体验。</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <form
          className="space-y-4 rounded-[1.85rem] border border-white/72 bg-white/80 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.74),0_18px_42px_-38px_rgba(15,23,42,0.16)] md:p-6"
          onSubmit={(event) => {
            event.preventDefault();
            submit(ENDPOINTS.auth.login);
          }}
        >
          <div className="space-y-1">
            <p className="apple-eyebrow">Sign In</p>
            <p className="text-sm leading-6 text-slate-500">用同一账户继续课程、积分与上传记录。</p>
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

        <div className="grid gap-2.5 sm:grid-cols-3">
          {benefitItems.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="rounded-[1.35rem] border border-white/72 bg-white/68 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]"
              >
                <Icon className="size-4 text-slate-700" />
                <p className="mt-3 text-sm font-medium text-slate-950">{item.title}</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">{item.description}</p>
              </div>
            );
          })}
        </div>
      </CardContent>
      <CardFooter className="pt-0">
        {status ? (
          <Alert className="w-full border-white/75 bg-white/76 py-3">
            <AlertDescription>{status}</AlertDescription>
          </Alert>
        ) : (
          <p className="text-sm text-slate-500">未登录状态，可直接注册后开始上传素材。</p>
        )}
      </CardFooter>
    </Card>
  );
}
