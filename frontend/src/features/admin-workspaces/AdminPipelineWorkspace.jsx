import { Bug, Settings2, Sparkles } from "lucide-react";
import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { AdminLessonTaskLogsTab } from "../admin-logs/AdminLessonTaskLogsTab";
import { AdminTranslationLogsTab } from "../admin-logs/AdminTranslationLogsTab";
import { mergeSearchParams, readStringParam } from "../../shared/lib/adminSearchParams";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Tabs, TabsContent, TabsList, TabsTrigger } from "../../shared/ui";

export const PIPELINE_TABS = [
  { value: "task-failures", label: "鐢熸垚澶辫触", description: "鎸変换鍔°€佽绋嬪拰閿欒闃舵瀹氫綅鐢熸垚闂銆?", component: AdminLessonTaskLogsTab },
  { value: "translations", label: "缈昏瘧璁板綍", description: "鎺ョ潃鏌ョ炕璇戣姹傛槸鍚﹀け璐ャ€佸け璐ュ湪鍝竴娈点€?", component: AdminTranslationLogsTab },
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
                <CardTitle className="text-lg">鐢熸垚閾捐矾宸ヤ綔鍙?</CardTitle>
                <Badge variant="outline">鏌ュ紓甯镐紭鍏?</Badge>
              </div>
              <CardDescription>鎶婅绋嬬敓鎴愩€佺炕璇戣褰曞拰瀛楀箷绛栫暐鏀惧湪涓€鏉″鐞嗛摼閲岋紝閬垮厤鎺掓煡鏃舵潵鍥炶烦椤点€?</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link to="/admin/pipeline?tab=task-failures&status=error">
                  <Bug className="size-4" />
                  浠呯湅澶辫触浠诲姟
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link to="/admin/pipeline?tab=translations&success=false">
                  <Sparkles className="size-4" />
                  浠呯湅澶辫触缈昏瘧
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link to="/admin/models?tab=billing">
                  <Settings2 className="size-4" />
                  鏌ョ湅妯″瀷璁¤垂
                </Link>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="text-base">鍏变韩绛涢€?</CardTitle>
              <CardDescription>`user_email`銆乣task_id`銆乣lesson_id`銆佹椂闂磋寖鍥翠細璺熺潃 URL 璧帮紝鍒囨崲鏍囩椤典粛鍙繚鐣欍€?</CardDescription>
            </CardHeader>
          </Card>
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="text-base">鎺掓煡椤哄簭</CardTitle>
              <CardDescription>寤鸿鍏堟煡鐢熸垚澶辫触锛屽啀鏍稿缈昏瘧璁板綍锛屾渶鍚庡喅瀹氭槸鍚﹁皟鏁撮粯璁ゅ垎鍙ョ瓥鐣ャ€?</CardDescription>
            </CardHeader>
          </Card>
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="text-base">淇濇寔濂戠害</CardTitle>
              <CardDescription>鏈疆鍙暣鍚堝悗鍙颁俊鎭灦鏋勶紝涓嶆敼 `/api/admin/*` 涓?`/api/transcribe/file` 濂戠害銆?</CardDescription>
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

