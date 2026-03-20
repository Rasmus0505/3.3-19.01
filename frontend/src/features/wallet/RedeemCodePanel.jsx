import { Gift } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ENDPOINTS } from "../../shared/api/endpoints";
import { formatMoneyCents } from "../../shared/lib/money";
import { Alert, AlertDescription, Button, Card, CardContent, CardHeader, CardTitle, Input } from "../../shared/ui";

const PURCHASE_REDEEM_CODE_URL = "https://m.tb.cn/h.iT16n9h?tk=qFDFUz9cEn8 MF278";

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

      const message = `兑换成功：+${formatMoneyCents(data.redeemed_amount_cents ?? data.redeemed_points ?? 0)}`;
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
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Gift className="size-4" />
            兑换码充值
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="space-y-3" onSubmit={submitRedeem}>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="例如 ABCD-EFGH-IJKL-MNPQ" />
            <Button type="submit" disabled={loading} className="h-11 w-full">
              {loading ? "兑换中..." : "立即兑换"}
            </Button>
          </form>
          {status ? (
            <Alert>
              <AlertDescription>{status}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-primary/20 bg-primary/[0.03]">
        <CardHeader>
          <CardTitle className="text-base">获取兑换码</CardTitle>
        </CardHeader>
        <CardContent>
          <Button asChild className="h-12 w-full text-base font-semibold shadow-sm">
            <a href={PURCHASE_REDEEM_CODE_URL} target="_blank" rel="noreferrer">
              获取兑换码
            </a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
