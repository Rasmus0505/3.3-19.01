import { AudioLines, Settings2, Sparkles } from "lucide-react";
import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";

import { AdminRatesTab } from "../admin-rates/AdminRatesTab";
import { AdminSenseVoiceSettingsTab } from "../admin-sensevoice-settings/AdminSenseVoiceSettingsTab";
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
    const nextPanel = ["strategy", "sensevoice"].includes(requestedPanel) ? requestedPanel : "rates";
    currentPanelRef.current = nextPanel;
    if (requestedPanel !== nextPanel) {
      setSearchParams(mergeSearchParams(searchParams, { panel: nextPanel }), { replace: true });
      return;
    }
    scrollIntoSection(nextPanel === "strategy" ? "admin-models-strategy" : nextPanel === "sensevoice" ? "admin-models-sensevoice" : "admin-models-rates");
  }, [requestedPanel, searchParams, setSearchParams]);

  function jumpTo(panel) {
    currentPanelRef.current = panel;
    setSearchParams(mergeSearchParams(searchParams, { panel }), { replace: panel === requestedPanel });
    scrollIntoSection(panel === "strategy" ? "admin-models-strategy" : panel === "sensevoice" ? "admin-models-sensevoice" : "admin-models-rates");
  }

  return (
    <div className="space-y-4">
      <Card className="rounded-3xl border shadow-sm">
        <CardHeader className="space-y-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">模型参数</Badge>
              <Badge variant="outline">默认策略</Badge>
              <Badge variant="outline">SenseVoice</Badge>
            </div>
            <div>
              <CardTitle className="text-lg">模型管理页统一维护计费、默认策略和 SenseVoice 服务端参数</CardTitle>
              <CardDescription>上半区保留现有模型费率和并发参数，中间维护默认 ASR 与字幕策略，底部单独维护 SenseVoice 加载和推理参数。</CardDescription>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant={requestedPanel === "strategy" || requestedPanel === "sensevoice" ? "outline" : "default"} size="sm" onClick={() => jumpTo("rates")}>
              <Settings2 className="size-4" />
              模型参数
            </Button>
            <Button variant={requestedPanel === "strategy" ? "default" : "outline"} size="sm" onClick={() => jumpTo("strategy")}>
              <Sparkles className="size-4" />
              默认策略
            </Button>
            <Button variant={requestedPanel === "sensevoice" ? "default" : "outline"} size="sm" onClick={() => jumpTo("sensevoice")}>
              <AudioLines className="size-4" />
              SenseVoice 参数
            </Button>
          </div>
        </CardHeader>
      </Card>

      <section id="admin-models-rates" className="scroll-mt-24 space-y-3">
        <div className="space-y-1">
          <CardTitle className="text-base">模型费率与并发</CardTitle>
          <CardDescription>这里保留现有模型启停、计费、并发阈值和切段参数。</CardDescription>
        </div>
        <AdminRatesTab apiCall={apiCall} />
      </section>

      <section id="admin-models-strategy" className="scroll-mt-24 space-y-3">
        <div className="space-y-1">
          <CardTitle className="text-base">默认策略</CardTitle>
          <CardDescription>默认 ASR 模型、字幕分句和翻译批次策略统一在这里维护。</CardDescription>
        </div>
        <AdminSubtitleSettingsTab apiCall={apiCall} />
      </section>

      <section id="admin-models-sensevoice" className="scroll-mt-24 space-y-3">
        <div className="space-y-1">
          <CardTitle className="text-base">SenseVoice 参数</CardTitle>
          <CardDescription>这里单独维护服务端 SenseVoice 的模型加载与推理参数，不再混在旧 ASR 链路里。</CardDescription>
        </div>
        <AdminSenseVoiceSettingsTab apiCall={apiCall} />
      </section>
    </div>
  );
}
