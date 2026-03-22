import { RefreshCcw, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { formatDateTimeBeijing } from "../../shared/lib/datetime";
import { parseJsonSafely } from "../../shared/lib/errorFormatter";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Skeleton, Switch } from "../../shared/ui";

const PINNED_MODEL_DIR = "D:\\3.3-19.01\\asr-test\\models\\faster-distil-small.en";

const defaultDraft = {
  device: "auto",
  compute_type: "",
  cpu_threads: 4,
  num_workers: 2,
  beam_size: 5,
  vad_filter: true,
  condition_on_previous_text: false,
};

const FIELDS = [
  { key: "device", label: "运行设备", hint: "例如 auto / cuda:0 / cpu", type: "text" },
  { key: "compute_type", label: "计算精度", hint: "留空时由运行时自动选择", type: "text" },
  { key: "cpu_threads", label: "CPU 线程数", hint: "CPU 推理时生效", type: "number" },
  { key: "num_workers", label: "并发 worker", hint: "控制模型并发加载", type: "number" },
  { key: "beam_size", label: "Beam Size", hint: "越大越准，也越慢", type: "number" },
  { key: "vad_filter", label: "启用 VAD", hint: "默认开启", type: "bool" },
  { key: "condition_on_previous_text", label: "使用上文", hint: "长音频通常建议关闭", type: "bool" },
];

function normalizeDraft(source) {
  return {
    device: String(source?.device || defaultDraft.device),
    compute_type: String(source?.compute_type || defaultDraft.compute_type),
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

function getErrorMessage(resp, payload, fallback) {
  return String(payload?.message || payload?.detail?.message || payload?.detail || fallback || "请求失败");
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

  const dirty = useMemo(() => !draftsEqual(draft, loadedSettings), [draft, loadedSettings]);

  async function loadSettings() {
    setLoading(true);
    setStatus("");
    try {
      const resp = await apiCall("/api/admin/faster-whisper-settings/history");
      const data = await parseJsonSafely(resp);
      if (!resp.ok) {
        setStatus(getErrorMessage(resp, data, "加载 Bottle 1.0 设置失败"));
        return;
      }
      const current = normalizeDraft(data.current || data.settings || defaultDraft);
      setDraft(current);
      setLoadedSettings(current);
      setCurrentMeta(data.current || data.settings || null);
      setRollbackCandidate(data.rollback_candidate || null);
    } catch (error) {
      setStatus(error instanceof Error && error.message ? error.message : "加载 Bottle 1.0 设置失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSettings();
  }, []);

  async function saveSettings() {
    setSaving(true);
    setStatus("");
    try {
      const resp = await apiCall("/api/admin/faster-whisper-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(normalizeDraft(draft)),
      });
      const data = await parseJsonSafely(resp);
      if (!resp.ok) {
        setStatus(getErrorMessage(resp, data, "保存 Bottle 1.0 设置失败"));
        return;
      }
      setStatus("Bottle 1.0 设置已保存");
      toast.success("Bottle 1.0 设置已保存");
      await loadSettings();
    } catch (error) {
      setStatus(error instanceof Error && error.message ? error.message : "保存 Bottle 1.0 设置失败");
    } finally {
      setSaving(false);
    }
  }

  async function rollbackLast() {
    setRollbacking(true);
    setStatus("");
    try {
      const resp = await apiCall("/api/admin/faster-whisper-settings/rollback-last", { method: "POST" });
      const data = await parseJsonSafely(resp);
      if (!resp.ok) {
        setStatus(getErrorMessage(resp, data, "回滚上一版 Bottle 1.0 设置失败"));
        return;
      }
      setStatus("已回滚到上一版 Bottle 1.0 设置");
      toast.success("已回滚到上一版 Bottle 1.0 设置");
      await loadSettings();
    } catch (error) {
      setStatus(error instanceof Error && error.message ? error.message : "回滚上一版 Bottle 1.0 设置失败");
    } finally {
      setRollbacking(false);
    }
  }

  function renderField(field) {
    const value = draft[field.key];
    return (
      <div key={field.key} className="rounded-2xl border bg-muted/20 p-4">
        <div className="space-y-1">
          <p className="text-sm font-medium">{field.label}</p>
          <p className="text-xs text-muted-foreground">{field.hint}</p>
        </div>
        <div className="mt-3">
          {field.type === "bool" ? (
            <Switch checked={Boolean(value)} onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, [field.key]: checked }))} />
          ) : (
            <Input
              type={field.type === "number" ? "number" : "text"}
              value={value}
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
    );
  }

  return (
    <Card className="rounded-3xl border shadow-sm">
      <CardHeader className="space-y-3">
        <div className="space-y-1">
          <CardTitle className="text-lg">Bottle 1.0 设置</CardTitle>
          <CardDescription>这里维护 Bottle 1.0 的服务端推理参数，模型目录固定到 {PINNED_MODEL_DIR}。</CardDescription>
        </div>
        {currentMeta?.updated_at ? (
          <CardDescription>
            当前生效版本更新于 {formatDateTimeBeijing(currentMeta.updated_at)}
            {currentMeta?.updated_by_user_email ? ` · ${currentMeta.updated_by_user_email}` : ""}
          </CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {status ? <p className="text-sm text-muted-foreground">{status}</p> : null}

        {loading ? (
          <div className="grid gap-3 md:grid-cols-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={`faster-whisper-skeleton-${index}`} className="h-20 rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">{FIELDS.map((field) => renderField(field))}</div>
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
            保存设置
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
