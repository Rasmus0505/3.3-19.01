import { Activity, Gift, RefreshCcw, ScrollText, Ticket } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { AdminRedeemAuditTab } from "../admin-redeem/AdminRedeemAuditTab";
import { AdminRedeemBatchesTab } from "../admin-redeem/AdminRedeemBatchesTab";
import { AdminRedeemCodesTab } from "../admin-redeem/AdminRedeemCodesTab";
import { AdminErrorNotice } from "../../shared/components/AdminErrorNotice";
import { readStringParam } from "../../shared/lib/adminSearchParams";
import { formatNetworkError, formatResponseError, parseJsonSafely } from "../../shared/lib/errorFormatter";
import { useErrorHandler } from "../../shared/hooks/useErrorHandler";
import { Button, CardDescription, CardTitle, MetricCard } from "../../shared/ui";

function scrollIntoSection(sectionId) {
  const target = document.getElementById(sectionId);
  if (!target) return;
  requestAnimationFrame(() => target.scrollIntoView({ behavior: "smooth", block: "start" }));
}

function resolveRedeemSectionId(panel) {
  if (panel === "codes") return "admin-redeem-codes";
  if (panel === "audit") return "admin-redeem-audit";
  if (panel === "batches") return "admin-redeem-batches";
  return "";
}

export function AdminRedeemPage({ apiCall }) {
  const [searchParams] = useSearchParams();
  const requestedPanel = readStringParam(searchParams, "panel");
  const [loading, setLoading] = useState(false);
  const [overviewCards, setOverviewCards] = useState([]);
  const { error, clearError, captureError } = useErrorHandler();

  async function loadOverview() {
    setLoading(true);
    clearError();
    try {
      const [overviewResp, codesResp, auditResp] = await Promise.all([
        apiCall("/api/admin/overview"),
        apiCall("/api/admin/redeem-codes?page=1&page_size=1"),
        apiCall("/api/admin/redeem-audit?page=1&page_size=1"),
      ]);
      const [overviewData, codesData, auditData] = await Promise.all([
        parseJsonSafely(overviewResp),
        parseJsonSafely(codesResp),
        parseJsonSafely(auditResp),
      ]);
      if (!overviewResp.ok || !codesResp.ok || !auditResp.ok) {
        throw captureError(
          formatResponseError(overviewResp.ok ? (codesResp.ok ? auditResp : codesResp) : overviewResp, overviewResp.ok ? (codesResp.ok ? auditData : codesData) : overviewData, {
            component: "AdminRedeemPage",
            action: "加载活动兑换总览",
            endpoint: "/api/admin/overview + redeem",
            method: "GET",
            fallbackMessage: "加载活动兑换总览失败",
          }),
        );
      }

      setOverviewCards([
        {
          label: "进行中批次",
          value: Number(overviewData?.metrics?.active_batches || 0),
          hint: "当前还可以继续兑换的活动批次",
          tone: "success",
          icon: Gift,
        },
        {
          label: "兑换码总数",
          value: Number(codesData?.total || 0),
          hint: "所有批次下的兑换码总量",
          tone: "info",
          icon: Ticket,
        },
        {
          label: "审计记录",
          value: Number(auditData?.total || 0),
          hint: "成功与失败兑换的累计记录",
          tone: "default",
          icon: ScrollText,
        },
        {
          label: "近 24 小时异常",
          value: Number(overviewData?.metrics?.incidents_24h || 0),
          hint: "先看批次是否过期，再回查失败原因",
          tone: "warning",
          icon: Activity,
        },
      ]);
    } catch (requestError) {
      if (!requestError?.displayMessage) {
        captureError(
          formatNetworkError(requestError, {
            component: "AdminRedeemPage",
            action: "加载活动兑换总览",
            endpoint: "/api/admin/overview + redeem",
            method: "GET",
          }),
        );
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const sectionId = resolveRedeemSectionId(requestedPanel);
    if (sectionId) scrollIntoSection(sectionId);
  }, [requestedPanel]);

  return (
    <div className="space-y-6">
      <section className="flex justify-end">
        <Button variant="outline" size="sm" onClick={loadOverview} disabled={loading}>
          <RefreshCcw className="size-4" />
          刷新概览
        </Button>
      </section>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {overviewCards.map((item) => (
          <MetricCard key={item.label} icon={item.icon} label={item.label} value={item.value} hint={item.hint} tone={item.tone} loading={loading && overviewCards.length === 0} />
        ))}
      </div>

      <section id="admin-redeem-batches" className="scroll-mt-24 space-y-3">
        <div className="space-y-1">
          <CardTitle className="text-base">批次</CardTitle>
          <CardDescription>先看活动批次是否还在正常发放，再处理复制参数和状态调整。</CardDescription>
        </div>
        <AdminRedeemBatchesTab apiCall={apiCall} queryPrefix="batches" />
      </section>

      <section id="admin-redeem-codes" className="scroll-mt-24 space-y-3 border-t pt-6">
        <div className="space-y-1">
          <CardTitle className="text-base">兑换码</CardTitle>
          <CardDescription>同页继续看兑换码状态、批量停用和导出。</CardDescription>
        </div>
        <AdminRedeemCodesTab apiCall={apiCall} queryPrefix="codes" />
      </section>

      <section id="admin-redeem-audit" className="scroll-mt-24 space-y-3 border-t pt-6">
        <div className="space-y-1">
          <CardTitle className="text-base">审计</CardTitle>
          <CardDescription>最后核对兑换成功、失败和导出记录。</CardDescription>
        </div>
        <AdminRedeemAuditTab apiCall={apiCall} queryPrefix="audit" />
      </section>

      {error ? <AdminErrorNotice error={error} /> : null}
    </div>
  );
}
