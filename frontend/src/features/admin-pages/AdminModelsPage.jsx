import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

import { AdminFasterWhisperSettingsTab } from "../admin-faster-whisper-settings/AdminFasterWhisperSettingsTab";
import { AdminRatesTab } from "../admin-rates/AdminRatesTab";
import { AdminSenseVoiceSettingsTab } from "../admin-sensevoice-settings/AdminSenseVoiceSettingsTab";
import { mergeSearchParams, readStringParam } from "../../shared/lib/adminSearchParams";
import { CardTitle, Tabs, TabsContent, TabsList, TabsTrigger } from "../../shared/ui";

const MODEL_TABS = [
  {
    value: "billing",
    label: "计费与启停",
    component: AdminRatesTab,
  },
  {
    value: "sensevoice",
    label: "bottle0.1",
    component: AdminSenseVoiceSettingsTab,
  },
  {
    value: "faster-whisper",
    label: "bottle.1.0",
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
        <CardTitle className="text-base">模型管理</CardTitle>

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
                  <p className="text-sm font-medium">{tab.label}</p>
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
