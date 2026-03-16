import { Settings2, Sparkles } from "lucide-react";
import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";

import { AdminRatesTab } from "../admin-rates/AdminRatesTab";
import { AdminSubtitleSettingsTab } from "../admin-subtitle-settings/AdminSubtitleSettingsTab";
import { mergeSearchParams, readStringParam } from "../../shared/lib/adminSearchParams";
import { Badge, Button, Card, CardDescription, CardHeader, CardTitle } from "../../shared/ui";

function scrollIntoSection(sectionId) {
  const target = document.getElementById(sectionId);
  if (!target) return;
  requestAnimationFrame(() => target.scrollIntoView({ behavior: "smooth", block: "start" }));
}

export function AdminModelsPage({ apiCall }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedPanel = readStringParam(searchParams, "panel", "rates");
  const currentPanelRef = useRef(requestedPanel || "rates");

  useEffect(() => {
    const nextPanel = requestedPanel === "strategy" ? "strategy" : "rates";
    currentPanelRef.current = nextPanel;
    if (requestedPanel !== nextPanel) {
      setSearchParams(mergeSearchParams(searchParams, { panel: nextPanel }), { replace: true });
      return;
    }
    scrollIntoSection(nextPanel === "strategy" ? "admin-models-strategy" : "admin-models-rates");
  }, [requestedPanel, searchParams, setSearchParams]);

  function jumpTo(panel) {
    currentPanelRef.current = panel;
    setSearchParams(mergeSearchParams(searchParams, { panel }), { replace: panel === requestedPanel });
    scrollIntoSection(panel === "strategy" ? "admin-models-strategy" : "admin-models-rates");
  }

  return (
    <div className="space-y-4">
      <Card className="rounded-3xl border shadow-sm">
        <CardHeader className="space-y-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">模型参数</Badge>
              <Badge variant="outline">默认 ASR</Badge>
              <Badge variant="outline">字幕/翻译策略</Badge>
            </div>
            <div>
              <CardTitle className="text-lg">模型管理页把计费参数和默认策略收成一个配置中心</CardTitle>
              <CardDescription>上半区维护模型启停、计费和并发，下半区维护默认 ASR、字幕切分和翻译批次。改完后新任务会按这里的后台默认值执行。</CardDescription>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant={requestedPanel === "strategy" ? "outline" : "default"} size="sm" onClick={() => jumpTo("rates")}>
              <Settings2 className="size-4" />
              模型参数
            </Button>
            <Button variant={requestedPanel === "strategy" ? "default" : "outline"} size="sm" onClick={() => jumpTo("strategy")}>
              <Sparkles className="size-4" />
              默认策略
            </Button>
          </div>
        </CardHeader>
      </Card>

      <section id="admin-models-rates" className="scroll-mt-24 space-y-3">
        <div className="space-y-1">
          <CardTitle className="text-base">模型参数区</CardTitle>
          <CardDescription>这里保留现有模型启停、计费、并发阈值和分段参数。</CardDescription>
        </div>
        <AdminRatesTab apiCall={apiCall} />
      </section>

      <section id="admin-models-strategy" className="scroll-mt-24 space-y-3">
        <div className="space-y-1">
          <CardTitle className="text-base">默认策略区</CardTitle>
          <CardDescription>默认 ASR 模型、字幕切分和翻译批次策略统一在这里维护。</CardDescription>
        </div>
        <AdminSubtitleSettingsTab apiCall={apiCall} />
      </section>
    </div>
  );
}
