import { Copy, RefreshCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AdminSystemTab } from "../admin-system/AdminSystemTab";
import { buildAdminHealthCopyText, copyTextToClipboard, formatNetworkError, parseJsonSafely } from "../../shared/lib/errorFormatter";
import { useErrorHandler } from "../../shared/hooks/useErrorHandler";
import { Button } from "../../shared/ui";

export function AdminHealthPage({ apiCall }) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [snapshot, setSnapshot] = useState(null);
  const { error, clearError, captureError } = useErrorHandler();

  async function loadSystemSnapshot() {
    setLoading(true);
    setStatus("");
    clearError();
    try {
      const [healthResp, readyResp] = await Promise.all([apiCall("/health"), apiCall("/health/ready")]);
      const [healthData, readyData] = await Promise.all([parseJsonSafely(healthResp), parseJsonSafely(readyResp)]);

      setSnapshot({
        health: { ok: healthResp.ok, status: healthResp.status, data: healthData },
        ready: { ok: readyResp.ok, status: readyResp.status, data: readyData },
      });
    } catch (requestError) {
      const formattedError = captureError(
        formatNetworkError(requestError, {
          component: "AdminHealthPage",
          action: "加载系统健康快照",
          endpoint: "/health + /health/ready",
          method: "GET",
        }),
      );
      setStatus(formattedError.displayMessage);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSystemSnapshot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function copyHealthPackage(audience) {
    if (!snapshot) {
      toast.error("诊断结果还没加载完成");
      return;
    }
    try {
      await copyTextToClipboard(buildAdminHealthCopyText({ snapshot, audience }));
      toast.success(audience === "zeabur" ? "已复制给 Zeabur AI 的诊断包" : "已复制给编程 AI 的诊断包");
    } catch (requestError) {
      toast.error(`复制失败: ${String(requestError)}`);
    }
  }

  return (
    <div className="space-y-4">
      <section className="flex flex-col gap-3 rounded-3xl border bg-card px-5 py-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => copyHealthPackage("zeabur")} disabled={!snapshot}>
            <Copy className="size-4" />
            复制给 Zeabur AI
          </Button>
          <Button variant="outline" size="sm" onClick={() => copyHealthPackage("developer")} disabled={!snapshot}>
            <Copy className="size-4" />
            复制给编程 AI
          </Button>
          <Button size="sm" onClick={loadSystemSnapshot} disabled={loading}>
            <RefreshCcw className="size-4" />
            重新诊断
          </Button>
        </div>
      </section>

      <AdminSystemTab apiCall={apiCall} snapshot={snapshot} loading={loading} status={status} error={error} />
    </div>
  );
}
