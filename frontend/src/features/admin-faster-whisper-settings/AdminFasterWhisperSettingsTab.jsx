import { RefreshCcw, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AdminErrorNotice } from "../../shared/components/AdminErrorNotice";
import { formatDateTimeBeijing } from "../../shared/lib/datetime";
import { formatNetworkError, formatResponseError, parseJsonSafely } from "../../shared/lib/errorFormatter";
import { useErrorHandler } from "../../shared/hooks/useErrorHandler";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Skeleton, Switch } from "../../shared/ui";

const defaultDraft = {
  device: "auto",
  compute_type: "",
  cpu_threads: 4,
  num_workers: 2,
  beam_size: 5,
  vad_filter: true,
  condition_on_previous_text: false,
};

const FIELD_META = [
  { key: "device", label: "运行设备", hint: "device（推荐 auto；本机有 NVIDIA GPU 时会优先吃 GPU，没有则自动回退 CPU）", type: "text" },
  { key: "compute_type", label: "计算精度", hint: "compute_type（留空时自动选 GPU= float16、CPU= int8；仅在你明确要覆盖默认策略时填写）", type: "text" },
  { key: "cpu_threads", label: "CPU 线程数", hint: "cpu_threads（仅 CPU 跑模型时主要影响吞吐；太高会和其他任务抢占资源）", type: "number" },
  { key: "num_workers", label: "模型并发 worker", hint: "num_workers（允许同一个 Whisper 模型并行处理多个请求；越大越吃内存）", type: "number" },
  { key: "beam_size", label: "Beam Size", hint: "beam_size（越大通常越准但越慢；本次默认保守值 5）", type: "number" },
  { key: "vad_filter", label: "启用 VAD", hint: "vad_filter（识别前先做语音活动检测，通常更稳）", type: "bool" },
  { key: "condition_on_previous_text", label: "使用上文条件", hint: "condition_on_previous_text（开启后会更依赖上一段文本，长音频并发时通常建议关闭）", type: "bool" },
];

function normalizeDraft(source) {
  return {
    device: String(source?.device || defaultDraft.device),
    compute_type: String(source?.compute_type || ""),
    cpu_threads: Number(source?.cpu_threads || defaultDraft.cpu_threads),
    num_workers: Number(source?.num_workers || defaultDraft.num_workers),
    beam_size: Number(source?.beam_size || defaultDraft.beam_size),
    vad_filter: Boolean(source?.vad_filter),
    condition_on_previous_text: Boolean(source?.condition_on_previous_text),
  };
}

function draftsEqual(left, right) {
  return JSON.stringify(normalizeDraft(left)) === JSON.stringify(normalizeDraft(right));
}

export function AdminFasterWhisperSettingsTab({ apiCall }) {
  const [draft, setDraft] = useState(defaultDraft);
  const [loadedSettings, setLoadedSettings] = useState(defaultDraft);
  const [currentMeta, setCurrentMeta] = useState(null);
  const [rollbackCandidate, setRollbackCandidate] = useState(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rollbacking, setRollbacking] = useState(false);
  const { error, clearError, captureError } = useErrorHandler();

  const dirty = useMemo(() => !draftsEqual(draft, loadedSettings), [draft, loadedSettings]);

  async function loadSettings() {
    setLoading(true);
    setStatus("");
    clearError();
    try {
      const resp = await apiCall("/api/admin/faster-whisper-settings/history");
      const data = await parseJsonSafely(resp);
      if (!resp.ok) {
        const formattedError = captureError(
          formatResponseError(resp, data, {
            component: "AdminFasterWhisperSettingsTab",
            action: "加载 Faster Whisper 参数",
            endpoint: "/api/admin/faster-whisper-settings/history",
            method: "GET",
            fallbackMessage: "加载 Faster Whisper 参数失败",
          }),
        );
        setStatus(formattedError.displayMessage);
        return;
      }
      const current = normalizeDraft(data.current || data.settings || defaultDraft);
      setDraft(current);
      setLoadedSettings(current);
      setCurrentMeta(data.current || data.settings || null);
      setRollbackCandidate(data.rollback_candidate || null);
    } catch (requestError) {
      const formattedError = captureError(
        formatNetworkError(requestError, {
          component: "AdminFasterWhisperSettingsTab",
          action: "加载 Faster Whisper 参数",
          endpoint: "/api/admin/faster-whisper-settings/history",
          method: "GET",
        }),
      );
      setStatus(formattedError.displayMessage);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveSettings() {
    setSaving(true);
    setStatus("");
    clearError();
    try {
      const resp = await apiCall("/api/admin/faster-whisper-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(normalizeDraft(draft)),
      });
      const data = await parseJsonSafely(resp);
      if (!resp.ok) {
        const formattedError = captureError(
          formatResponseError(resp, data, {
            component: "AdminFasterWhisperSettingsTab",
            action: "保存 Faster Whisper 参数",
            endpoint: "/api/admin/faster-whisper-settings",
            method: "PUT",
            fallbackMessage: "保存 Faster Whisper 参数失败",
          }),
        );
        setStatus(formattedError.displayMessage);
        return;
      }
      setStatus("Faster Whisper 参数已保存");
      toast.success("Faster Whisper 参数已保存");
      await loadSettings();
    } catch (requestError) {
      const formattedError = captureError(
        formatNetworkError(requestError, {
          component: "AdminFasterWhisperSettingsTab",
          action: "保存 Faster Whisper 参数",
          endpoint: "/api/admin/faster-whisper-settings",
          method: "PUT",
        }),
      );
      setStatus(formattedError.displayMessage);
    } finally {
      setSaving(false);
    }
  }

  async function rollbackLast() {
    setRollbacking(true);
    setStatus("");
    clearError();
    try {
      const resp = await apiCall("/api/admin/faster-whisper-settings/rollback-last", { method: "POST" });
      const data = await parseJsonSafely(resp);
      if (!resp.ok) {
        const formattedError = captureError(
          formatResponseError(resp, data, {
            component: "AdminFasterWhisperSettingsTab",
            action: "回滚 Faster Whisper 参数",
            endpoint: "/api/admin/faster-whisper-settings/rollback-last",
            method: "POST",
            fallbackMessage: "回滚上一版 Faster Whisper 参数失败",
          }),
        );
        setStatus(formattedError.displayMessage);
        return;
      }
      setStatus("已回滚到上一版 Faster Whisper 参数");
      toast.success("已回滚到上一版 Faster Whisper 参数");
      await loadSettings();
    } catch (requestError) {
      const formattedError = captureError(
        formatNetworkError(requestError, {
          component: "AdminFasterWhisperSettingsTab",
          action: "回滚 Faster Whisper 参数",
          endpoint: "/api/admin/faster-whisper-settings/rollback-last",
          method: "POST",
        }),
      );
      setStatus(formattedError.displayMessage);
    } finally {
      setRollbacking(false);
    }
  }

  return (
    <Card className="rounded-3xl border shadow-sm">
      <CardHeader className="space-y-3">
        <div className="space-y-1">
          <CardTitle className="text-lg">Faster Whisper 参数</CardTitle>
          <CardDescription>这里单独维护服务端 Faster Whisper 的设备、线程和推理参数，适合本机优先提速时细调。</CardDescription>
        </div>
        {currentMeta?.updated_at ? (
          <CardDescription>
            当前生效版本更新于 {formatDateTimeBeijing(currentMeta.updated_at)}
            {currentMeta?.updated_by_user_email ? ` · ${currentMeta.updated_by_user_email}` : ""}
          </CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? <AdminErrorNotice error={error} className="rounded-2xl" /> : null}
        {status ? <p className="text-sm text-muted-foreground">{status}</p> : null}

        {loading ? (
          <div className="grid gap-3 md:grid-cols-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={`faster-whisper-skeleton-${index}`} className="h-20 rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {FIELD_META.map((field) => (
              <div key={field.key} className="rounded-2xl border bg-muted/20 p-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium">{field.label}</p>
                  <p className="text-xs text-muted-foreground">{field.hint}</p>
                </div>
                <div className="mt-3">
                  {field.type === "bool" ? (
                    <Switch checked={Boolean(draft[field.key])} onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, [field.key]: checked }))} />
                  ) : (
                    <Input
                      type={field.type === "number" ? "number" : "text"}
                      value={draft[field.key]}
                      onChange={(event) =>
                        setDraft((prev) => ({
                          ...prev,
                          [field.key]: field.type === "number" ? Number(event.target.value || 0) : event.target.value,
                        }))
                      }
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {rollbackCandidate ? (
          <div className="rounded-2xl border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
            可回滚版本：{formatDateTimeBeijing(rollbackCandidate.created_at)}
            {rollbackCandidate?.operator_user_email ? ` · ${rollbackCandidate.operator_user_email}` : ""}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void loadSettings()} disabled={loading || saving || rollbacking}>
            <RefreshCcw className="size-4" />
            刷新
          </Button>
          <Button variant="outline" onClick={() => void rollbackLast()} disabled={loading || saving || rollbacking || !rollbackCandidate}>
            <RotateCcw className="size-4" />
            回滚上一版
          </Button>
          <Button onClick={() => void saveSettings()} disabled={loading || saving || rollbacking || !dirty}>
            保存参数
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
