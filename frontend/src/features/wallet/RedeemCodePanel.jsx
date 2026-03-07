import { Gift, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ENDPOINTS } from "../../shared/api/endpoints";
import { Alert, AlertDescription, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from "../../shared/ui";

async function jsonOrEmpty(resp) {
  try {
    return await resp.json();
  } catch (_) {
    return {};
  }
}

function toError(data, fallback) {
  return `${data?.error_code || "ERROR"}: ${data?.message || fallback}`;
}

export function RedeemCodePanel({ apiCall, onWalletChanged }) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  async function submitRedeem(event) {
    event.preventDefault();
    if (!code.trim()) {
      setStatus("请输入兑换码");
      return;
    }

    setLoading(true);
    setStatus("");
    try {
      const resp = await apiCall(ENDPOINTS.walletRedeemCode, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await jsonOrEmpty(resp);
      if (!resp.ok) {
        const message = toError(data, "兑换失败");
        setStatus(message);
        toast.error(message);
        return;
      }

      const message = `兑换成功：+${Number(data.redeemed_points || 0)} 点`;
      setStatus(message);
      toast.success(message);
      setCode("");
      await onWalletChanged();
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
      <CardHeader className="space-y-3">
        <div className="apple-kicker w-fit">
          <Sparkles className="size-3.5" />
          Wallet
        </div>
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Gift className="size-4" />
            兑换码充值
          </CardTitle>
          <CardDescription>输入兑换码后自动充值到当前账户，适合活动发放与补贴到账。</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-[1.5rem] border border-white/70 bg-white/70 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
          <p className="text-sm font-medium text-slate-900">快速到账</p>
          <p className="mt-1 text-sm leading-6 text-slate-500">兑换成功后会立即同步到当前登录账户，上传页可直接继续使用。</p>
        </div>
        <form className="space-y-3" onSubmit={submitRedeem}>
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="例如 ABCD-EFGH-IJKL-MNPQ" />
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "兑换中..." : "立即兑换"}
          </Button>
        </form>
        {status ? (
          <Alert className="border-white/75 bg-white/76">
            <AlertDescription>{status}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
