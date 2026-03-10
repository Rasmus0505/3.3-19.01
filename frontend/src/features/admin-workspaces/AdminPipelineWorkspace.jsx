import { Bug, Settings2, Sparkles } from "lucide-react";
import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { AdminLessonTaskLogsTab } from "../admin-logs/AdminLessonTaskLogsTab";
import { AdminTranslationLogsTab } from "../admin-logs/AdminTranslationLogsTab";
import { AdminSubtitleSettingsTab } from "../admin-subtitle-settings/AdminSubtitleSettingsTab";
import { mergeSearchParams, readStringParam } from "../../shared/lib/adminSearchParams";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Tabs, TabsContent, TabsList, TabsTrigger } from "../../shared/ui";

export const PIPELINE_TABS = [
  { value: "task-failures", label: "生成失败", description: "按任务、课程和错误阶段定位生成问题。", component: AdminLessonTaskLogsTab },
  { value: "translations", label: "翻译记录", description: "接着查翻译请求是否失败、失败在哪一段。", component: AdminTranslationLogsTab },
  { value: "subtitle-policy", label: "字幕策略", description: "确认分句与翻译批次默认策略，再决定是否调整。", component: AdminSubtitleSettingsTab },
];

export function AdminPipelineWorkspace({ apiCall, showTabsNavigation = true }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = readStringParam(searchParams, "tab");
  const activeTab = PIPELINE_TABS.some((item) => item.value === requestedTab) ? requestedTab : "task-failures";

  useEffect(() => {
    if (requestedTab === activeTab) return;
    setSearchParams(mergeSearchParams(searchParams, { tab: activeTab, page: null }), { replace: true });
  }, [activeTab, requestedTab, searchParams, setSearchParams]);

  if (requestedTab !== activeTab) return null;

  function handleTabChange(nextTab) {
    setSearchParams(mergeSearchParams(searchParams, { tab: nextTab, page: null }));
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">生成链路工作台</CardTitle>
                <Badge variant="outline">查异常优先</Badge>
              </div>
              <CardDescription>把课程生成、翻译记录和字幕策略放在一条处理链里，避免排查时来回跳页。</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link to="/admin/pipeline?tab=task-failures&status=error">
                  <Bug className="size-4" />
                  仅看失败任务
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link to="/admin/pipeline?tab=translations&success=false">
                  <Sparkles className="size-4" />
                  仅看失败翻译
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link to="/admin/pipeline?tab=subtitle-policy">
                  <Settings2 className="size-4" />
                  打开字幕策略
                </Link>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="text-base">共享筛选</CardTitle>
              <CardDescription>`user_email`、`task_id`、`lesson_id`、时间范围会跟着 URL 走，切换标签页仍可保留。</CardDescription>
            </CardHeader>
          </Card>
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="text-base">排查顺序</CardTitle>
              <CardDescription>建议先查生成失败，再核对翻译记录，最后决定是否调整默认分句策略。</CardDescription>
            </CardHeader>
          </Card>
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="text-base">保持契约</CardTitle>
              <CardDescription>本轮只整合后台信息架构，不改 `/api/admin/*` 与 `/api/transcribe/file` 契约。</CardDescription>
            </CardHeader>
          </Card>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
        {showTabsNavigation ? (
          <TabsList className="h-auto flex-wrap justify-start">
            {PIPELINE_TABS.map((item) => (
              <TabsTrigger key={item.value} value={item.value}>
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
        ) : null}
        {PIPELINE_TABS.map((item) => {
          const Component = item.component;
          return (
            <TabsContent key={item.value} value={item.value} className="space-y-4">
              <div className="space-y-1">
                <h2 className="text-sm font-medium">{item.label}</h2>
                <p className="text-sm text-muted-foreground">{item.description}</p>
              </div>
              <Component apiCall={apiCall} />
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
