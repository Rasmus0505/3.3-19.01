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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Gift className="size-4" />
          兑换码充值
        </CardTitle>
        <CardDescription>输入兑换码充值账户</CardDescription>
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
  );
}
