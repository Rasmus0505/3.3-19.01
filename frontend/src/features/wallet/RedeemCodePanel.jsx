import { Gift } from "lucide-react";
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

  const guideSteps = [
    { title: "输入兑换码", note: "支持一次输入一串完整兑换码。" },
    { title: "系统立即核销", note: "校验通过后，不需要额外确认。" },
    { title: "点数立刻到账", note: "到账后可以马上回去继续生成课程。" },
  ];

  return (
    <Card>
      <CardHeader className="space-y-0">
        <div className="manual-kicker">补充点数</div>
        <CardTitle className="manual-title flex items-center gap-2">
          <Gift className="size-4" />
          输入兑换码，立刻补充点数
        </CardTitle>
        <CardDescription className="manual-subtitle">已有兑换码时在这里录入。成功后，点数会直接回到当前账号。</CardDescription>
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
      <CardContent className="space-y-4">
        <div className="manual-soft-card space-y-4">
          <div className="flex flex-wrap gap-2">
            <span className="manual-chip manual-chip-info">到账后立刻可用</span>
            <span className="manual-chip manual-chip-neutral">不会影响已有课程</span>
          </div>
          <form className="space-y-3" onSubmit={submitRedeem}>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="例如 ABCD-EFGH-IJKL-MNPQ" />
            <Button type="submit" disabled={loading} className="h-11 w-full">
              {loading ? "正在核销..." : "立即兑换"}
            </Button>
          </form>
        </div>
        {status ? (
          <Alert>
            <AlertDescription>{status}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
