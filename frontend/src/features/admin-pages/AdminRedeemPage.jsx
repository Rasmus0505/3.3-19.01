import { Activity, Gift, RefreshCcw, ScrollText, Ticket } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { AdminRedeemAuditTab } from "../admin-redeem/AdminRedeemAuditTab";
import { AdminRedeemBatchesTab } from "../admin-redeem/AdminRedeemBatchesTab";
import { AdminRedeemCodesTab } from "../admin-redeem/AdminRedeemCodesTab";
import { AdminErrorNotice } from "../../shared/components/AdminErrorNotice";
import { mergeSearchParams, readStringParam } from "../../shared/lib/adminSearchParams";
import { formatNetworkError, formatResponseError, parseJsonSafely } from "../../shared/lib/errorFormatter";
import { useErrorHandler } from "../../shared/hooks/useErrorHandler";
import { Badge, Button, Card, CardDescription, CardHeader, CardTitle, MetricCard } from "../../shared/ui";

const PANELS = [
  { value: "batches", label: "批次", description: "建批次、复制参数和判断活动是否健康。", icon: Gift },
  { value: "codes", label: "兑换码", description: "追单个兑换码状态、批量停用和导出。", icon: Ticket },
  { value: "audit", label: "审计", description: "核对兑换成功、失败与导出记录。", icon: ScrollText },
];

function getPanel(value) {
  return PANELS.find((item) => item.value === value) || PANELS[0];
}

export function AdminRedeemPage({ apiCall }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedPanel = readStringParam(searchParams, "panel", "batches");
  const activePanel = getPanel(requestedPanel).value;
  const [loading, setLoading] = useState(false);
  const [overviewCards, setOverviewCards] = useState([]);
  const { error, clearError, captureError } = useErrorHandler();

  useEffect(() => {
    if (requestedPanel === activePanel) return;
    setSearchParams(mergeSearchParams(searchParams, { panel: activePanel }), { replace: true });
  }, [activePanel, requestedPanel, searchParams, setSearchParams]);

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
          formatResponseError(overviewResp.ok ? codesResp.ok ? auditResp : codesResp : overviewResp, overviewResp.ok ? codesResp.ok ? auditData : codesData : overviewData, {
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
          hint: "当前还可继续兑换的活动批次",
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
          hint: "成功与失败兑换累计记录",
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

  function switchPanel(nextPanel) {
    setSearchParams(mergeSearchParams(searchParams, { panel: nextPanel, page: null }), { replace: nextPanel === activePanel });
  }

  const currentPanel = useMemo(() => getPanel(activePanel), [activePanel]);

  return (
    <div className="space-y-4">
      <Card className="rounded-3xl border shadow-sm">
        <CardHeader className="space-y-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">活动总览</Badge>
              <Badge variant="outline">批次 / 兑换码 / 审计</Badge>
            </div>
            <div>
              <CardTitle className="text-lg">活动兑换页先给活动健康，再进入批次、兑换码和审计</CardTitle>
              <CardDescription>上半区先判断当前活动是否还在健康发放，下半区按批次、兑换码和审计三段继续操作，不再拆成多个一级导航。</CardDescription>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {PANELS.map((item) => {
              const Icon = item.icon;
              const active = item.value === activePanel;
              return (
                <Button key={item.value} variant={active ? "default" : "outline"} size="sm" onClick={() => switchPanel(item.value)}>
                  <Icon className="size-4" />
                  {item.label}
                </Button>
              );
            })}
            <Button variant="outline" size="sm" onClick={loadOverview} disabled={loading}>
              <RefreshCcw className="size-4" />
              刷新总览
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">{currentPanel.description}</p>
        </CardHeader>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {overviewCards.map((item) => (
          <MetricCard key={item.label} icon={item.icon} label={item.label} value={item.value} hint={item.hint} tone={item.tone} loading={loading && overviewCards.length === 0} />
        ))}
      </div>

      {activePanel === "batches" ? <AdminRedeemBatchesTab apiCall={apiCall} /> : null}
      {activePanel === "codes" ? <AdminRedeemCodesTab apiCall={apiCall} /> : null}
      {activePanel === "audit" ? <AdminRedeemAuditTab apiCall={apiCall} /> : null}

      {error ? <AdminErrorNotice error={error} /> : null}
    </div>
  );
}
