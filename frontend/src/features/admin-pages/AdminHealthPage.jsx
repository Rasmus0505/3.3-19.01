import { AlertTriangle, ClipboardList, ShieldCheck } from "lucide-react";
import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

import { AdminLessonTaskLogsTab } from "../admin-logs/AdminLessonTaskLogsTab";
import { AdminTranslationLogsTab } from "../admin-logs/AdminTranslationLogsTab";
import { AdminOperationLogsTab } from "../admin-operation-logs/AdminOperationLogsTab";
import { AdminSystemTab } from "../admin-system/AdminSystemTab";
import { mergeSearchParams, readStringParam } from "../../shared/lib/adminSearchParams";
import { Badge, Button, Card, CardDescription, CardHeader, CardTitle } from "../../shared/ui";

const PANELS = [
  { value: "diagnosis", label: "系统诊断", description: "先看问题卡、关键接口和复制给 AI 的修复包。", icon: ShieldCheck },
  { value: "tasks", label: "生成失败", description: "查看最近失败任务、阶段和原始调试摘要。", icon: AlertTriangle },
  { value: "translations", label: "翻译失败", description: "按任务和时间范围追失败请求与 Tokens。", icon: AlertTriangle },
  { value: "operations", label: "后台审计", description: "核对关键管理员操作和异常变更。", icon: ClipboardList },
];

function getPanel(value) {
  return PANELS.find((item) => item.value === value) || PANELS[0];
}

export function AdminHealthPage({ apiCall }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedPanel = readStringParam(searchParams, "panel", "diagnosis");
  const activePanel = getPanel(requestedPanel).value;

  useEffect(() => {
    if (requestedPanel === activePanel) return;
    setSearchParams(mergeSearchParams(searchParams, { panel: activePanel }), { replace: true });
  }, [activePanel, requestedPanel, searchParams, setSearchParams]);

  function switchPanel(nextPanel) {
    setSearchParams(mergeSearchParams(searchParams, { panel: nextPanel, page: null }), { replace: nextPanel === activePanel });
  }

  return (
    <div className="space-y-4">
      <Card className="rounded-3xl border shadow-sm">
        <CardHeader className="space-y-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">服务 / 数据库 / 日志 / 审计</Badge>
              <Badge variant="outline">Zeabur 排查提示</Badge>
            </div>
            <div>
              <CardTitle className="text-lg">系统健康页先给结论，再下钻到失败链路</CardTitle>
              <CardDescription>这里不再拆成多个一级入口。先看诊断卡确认系统哪一层出问题，再切到失败任务、翻译失败或后台审计继续排查。</CardDescription>
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
          </div>
          <p className="text-sm text-muted-foreground">{getPanel(activePanel).description}</p>
        </CardHeader>
      </Card>

      {activePanel === "diagnosis" ? <AdminSystemTab apiCall={apiCall} /> : null}
      {activePanel === "tasks" ? <AdminLessonTaskLogsTab apiCall={apiCall} defaultStatus="failed" /> : null}
      {activePanel === "translations" ? <AdminTranslationLogsTab apiCall={apiCall} defaultSuccess="false" /> : null}
      {activePanel === "operations" ? <AdminOperationLogsTab apiCall={apiCall} /> : null}
    </div>
  );
}
