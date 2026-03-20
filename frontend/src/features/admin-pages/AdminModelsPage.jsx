import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

import { AdminFasterWhisperSettingsTab } from "../admin-faster-whisper-settings/AdminFasterWhisperSettingsTab";
import { AdminRatesTab } from "../admin-rates/AdminRatesTab";
import { AdminSenseVoiceSettingsTab } from "../admin-sensevoice-settings/AdminSenseVoiceSettingsTab";
import { mergeSearchParams, readStringParam } from "../../shared/lib/adminSearchParams";
import { CardDescription, CardTitle, Tabs, TabsContent, TabsList, TabsTrigger } from "../../shared/ui";

const MODEL_TABS = [
  {
    value: "billing",
    label: "计费与启停",
    description: "维护 3 个 ASR 模型和 1 个 MT 模型的售价、成本与启停状态。",
    component: AdminRatesTab,
  },
  {
    value: "sensevoice",
    label: "SenseVoice",
    description: "调整服务端 SenseVoice 的加载与推理参数组合。",
    component: AdminSenseVoiceSettingsTab,
  },
  {
    value: "faster-whisper",
    label: "Faster Whisper",
    description: "配置 Faster Whisper 的设备、线程数和推理参数。",
    component: AdminFasterWhisperSettingsTab,
  },
];

export function AdminModelsPage({ apiCall }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = readStringParam(searchParams, "tab");
  const validTab = MODEL_TABS.some((tab) => tab.value === requestedTab);
  const activeTab = validTab ? requestedTab : MODEL_TABS[0].value;

  useEffect(() => {
    if (requestedTab === activeTab) return;
    setSearchParams(mergeSearchParams(searchParams, { tab: activeTab }), { replace: true });
  }, [activeTab, requestedTab, searchParams, setSearchParams]);

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border bg-card p-6 shadow-sm">
        <div className="space-y-2">
          <CardTitle className="text-base">模型管理</CardTitle>
          <CardDescription>先改常用配置，再在需要时展开高级运行参数；旧地址会统一跳到这里，不再保留重复入口。</CardDescription>
        </div>

        <Tabs value={activeTab} onValueChange={(value) => setSearchParams(mergeSearchParams(searchParams, { tab: value }))}>
          <TabsList className="h-auto flex-wrap justify-start gap-2">
            {MODEL_TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="mt-6 space-y-6">
            {MODEL_TABS.map((tab) => {
              const Component = tab.component;
              return (
                <TabsContent key={tab.value} value={tab.value} className="space-y-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{tab.label}</p>
                    <p className="text-xs text-muted-foreground">{tab.description}</p>
                  </div>
                  <Component apiCall={apiCall} />
                </TabsContent>
              );
            })}
          </div>
        </Tabs>
      </section>
    </div>
  );
}

