import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

import { AdminRatesTab } from "../admin-rates/AdminRatesTab";
import { AdminSenseVoiceSettingsTab } from "../admin-sensevoice-settings/AdminSenseVoiceSettingsTab";
import { AdminSubtitleSettingsTab } from "../admin-subtitle-settings/AdminSubtitleSettingsTab";
import { readStringParam } from "../../shared/lib/adminSearchParams";
import { CardDescription, CardTitle } from "../../shared/ui";

function scrollIntoSection(sectionId) {
  const target = document.getElementById(sectionId);
  if (!target) return;
  requestAnimationFrame(() => target.scrollIntoView({ behavior: "smooth", block: "start" }));
}

function resolveSectionId(panel) {
  if (panel === "strategy") return "admin-models-strategy";
  if (panel === "sensevoice") return "admin-models-sensevoice";
  if (panel === "rates") return "admin-models-rates";
  return "";
}

export function AdminModelsPage({ apiCall }) {
  const [searchParams] = useSearchParams();
  const requestedPanel = readStringParam(searchParams, "panel");

  useEffect(() => {
    const sectionId = resolveSectionId(requestedPanel);
    if (sectionId) scrollIntoSection(sectionId);
  }, [requestedPanel]);

  return (
    <div className="space-y-6">
      <section id="admin-models-rates" className="scroll-mt-24 space-y-3">
        <div className="space-y-1">
          <CardTitle className="text-base">模型参数</CardTitle>
          <CardDescription>保留现有模型费率、启停状态和并发参数。</CardDescription>
        </div>
        <AdminRatesTab apiCall={apiCall} />
      </section>

      <section id="admin-models-strategy" className="scroll-mt-24 space-y-3 border-t pt-6">
        <div className="space-y-1">
          <CardTitle className="text-base">默认策略</CardTitle>
          <CardDescription>统一维护默认 ASR、分句和翻译批次策略。</CardDescription>
        </div>
        <AdminSubtitleSettingsTab apiCall={apiCall} />
      </section>

      <section id="admin-models-sensevoice" className="scroll-mt-24 space-y-3 border-t pt-6">
        <div className="space-y-1">
          <CardTitle className="text-base">SenseVoice 参数</CardTitle>
          <CardDescription>单独维护服务端 SenseVoice 的加载和推理参数。</CardDescription>
        </div>
        <AdminSenseVoiceSettingsTab apiCall={apiCall} />
      </section>
    </div>
  );
}
