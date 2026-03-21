import { RefreshCcw, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AdminErrorNotice } from "../../shared/components/AdminErrorNotice";
import { formatDateTimeBeijing } from "../../shared/lib/datetime";
import { formatNetworkError, formatResponseError, parseJsonSafely } from "../../shared/lib/errorFormatter";
import { useErrorHandler } from "../../shared/hooks/useErrorHandler";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Skeleton, Switch } from "../../shared/ui";

const PINNED_MODEL_DIR = "D:\\3.3-19.01\\asr-test\\models\\SenseVoiceSmall";

const defaultDraft = {
  model_dir: PINNED_MODEL_DIR,
  trust_remote_code: false,
  remote_code: "",
  device: "cuda:0",
  language: "auto",
  vad_model: "fsmn-vad",
  vad_max_single_segment_time: 30000,
  use_itn: true,
  batch_size_s: 60,
  merge_vad: true,
  merge_length_s: 15,
  ban_emo_unk: false,
};

const FIELD_GROUPS = [
  {
    id: "common",
    title: "常用参数",
    description: "对应 bottle0.1 的服务端运行配置。",
    fields: [
      { key: "model_dir", label: "模型路径", hint: "固定使用 asr-test\\models\\SenseVoiceSmall", type: "text", readOnly: true },
      { key: "device", label: "运行设备", hint: "例如 cuda:0 或 cpu", type: "text" },
      { key: "language", label: "识别语言", hint: "默认 auto", type: "text" },
      { key: "vad_model", label: "VAD 模型", hint: "默认 fsmn-vad", type: "text" },
      { key: "vad_max_single_segment_time", label: "VAD 最大切段(ms)", hint: "控制单段时长", type: "number" },
      { key: "batch_size_s", label: "批处理秒数", hint: "控制单次推理批大小", type: "number" },
      { key: "use_itn", label: "ITN", hint: "开启文本归一化", type: "bool" },
    ],
  },
  {
    id: "advanced",
    title: "高级设置",
    description: "仅在排查或调优时使用。",
    fields: [
      { key: "trust_remote_code", label: "远程代码", hint: "默认关闭", type: "bool" },
      { key: "remote_code", label: "代码位置", hint: "仅开启远程代码后生效", type: "text" },
      { key: "merge_vad", label: "合并 VAD", hint: "是否合并短句", type: "bool" },
      { key: "merge_length_s", label: "合并后秒数", hint: "目标合并时长", type: "number" },
      { key: "ban_emo_unk", label: "禁用 emo_unk", hint: "调试项", type: "bool" },
    ],
  },
];

function normalizeDraft(source) {
  return {
    model_dir: PINNED_MODEL_DIR,
    trust_remote_code: Boolean(source?.trust_remote_code),
    remote_code: String(source?.remote_code || ""),
    device: String(source?.device || defaultDraft.device),
    language: String(source?.language || defaultDraft.language),
    vad_model: String(source?.vad_model || ""),
    vad_max_single_segment_time: Number(source?.vad_max_single_segment_time || defaultDraft.vad_max_single_segment_time),
    use_itn: Boolean(source?.use_itn),
    batch_size_s: Number(source?.batch_size_s || defaultDraft.batch_size_s),
    merge_vad: Boolean(source?.merge_vad),
    merge_length_s: Number(source?.merge_length_s || defaultDraft.merge_length_s),
    ban_emo_unk: Boolean(source?.ban_emo_unk),
  };
}

function draftsEqual(left, right) {
  return JSON.stringify(normalizeDraft(left)) === JSON.stringify(normalizeDraft(right));
}

export function AdminSenseVoiceSettingsTab({ apiCall }) {
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

  function renderField(field) {
    const value = draft[field.key];
    const disabledRemote = field.key === "remote_code" && !draft.trust_remote_code;
    const disabled = disabledRemote || Boolean(field.readOnly);
    return (
      <div key={field.key} className="rounded-2xl border bg-muted/20 p-4">
        <div className="space-y-1">
          <p className="text-sm font-medium">{field.label}</p>
          <p className="text-xs text-muted-foreground">{field.hint}</p>
        </div>
        <div className="mt-3">
          {field.type === "bool" ? (
            <Switch checked={Boolean(value)} onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, [field.key]: checked }))} disabled={disabled} />
          ) : (
            <>
              <Input
                type={field.type === "number" ? "number" : "text"}
                value={value}
                disabled={disabled}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    [field.key]: field.type === "number" ? Number(event.target.value || 0) : event.target.value,
                  }))
                }
              />
              {field.key === "remote_code" && !draft.trust_remote_code ? <p className="mt-1 text-xs text-muted-foreground">开启“远程代码”后才生效。</p> : null}
            </>
          )}
        </div>
      </div>
    );
  }

  async function loadSettings() {
    setLoading(true);
    setStatus("");
    clearError();
    try {
      const resp = await apiCall("/api/admin/sensevoice-settings/history");
      const data = await parseJsonSafely(resp);
      if (!resp.ok) {
        const formattedError = captureError(
          formatResponseError(resp, data, {
            component: "AdminSenseVoiceSettingsTab",
            action: "加载 bottle0.1 参数",
            endpoint: "/api/admin/sensevoice-settings/history",
            method: "GET",
            fallbackMessage: "加载 bottle0.1 参数失败",
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
          component: "AdminSenseVoiceSettingsTab",
          action: "加载 bottle0.1 参数",
          endpoint: "/api/admin/sensevoice-settings/history",
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
  }, []);

  async function saveSettings() {
    setSaving(true);
    setStatus("");
    clearError();
    try {
      const resp = await apiCall("/api/admin/sensevoice-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(normalizeDraft(draft)),
      });
      const data = await parseJsonSafely(resp);
      if (!resp.ok) {
        const formattedError = captureError(
          formatResponseError(resp, data, {
            component: "AdminSenseVoiceSettingsTab",
            action: "保存 bottle0.1 参数",
            endpoint: "/api/admin/sensevoice-settings",
            method: "PUT",
            fallbackMessage: "保存 bottle0.1 参数失败",
          }),
        );
        setStatus(formattedError.displayMessage);
        return;
      }
      setStatus("bottle0.1 参数已保存");
      toast.success("bottle0.1 参数已保存");
      await loadSettings();
    } catch (requestError) {
      const formattedError = captureError(
        formatNetworkError(requestError, {
          component: "AdminSenseVoiceSettingsTab",
          action: "保存 bottle0.1 参数",
          endpoint: "/api/admin/sensevoice-settings",
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
      const resp = await apiCall("/api/admin/sensevoice-settings/rollback-last", { method: "POST" });
      const data = await parseJsonSafely(resp);
      if (!resp.ok) {
        const formattedError = captureError(
          formatResponseError(resp, data, {
            component: "AdminSenseVoiceSettingsTab",
            action: "回滚 bottle0.1 参数",
            endpoint: "/api/admin/sensevoice-settings/rollback-last",
            method: "POST",
            fallbackMessage: "回滚上一版 bottle0.1 参数失败",
          }),
        );
        setStatus(formattedError.displayMessage);
        return;
      }
      setStatus("已回滚到上一版 bottle0.1 参数");
      toast.success("已回滚到上一版 bottle0.1 参数");
      await loadSettings();
    } catch (requestError) {
      const formattedError = captureError(
        formatNetworkError(requestError, {
          component: "AdminSenseVoiceSettingsTab",
          action: "回滚 bottle0.1 参数",
          endpoint: "/api/admin/sensevoice-settings/rollback-last",
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
          <CardTitle className="text-lg">bottle0.1 参数</CardTitle>
          <CardDescription>这里维护 bottle0.1 的服务端运行参数，模型目录固定到 asr-test\\models\\SenseVoiceSmall。</CardDescription>
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
              <Skeleton key={`sensevoice-skeleton-${index}`} className="h-20 rounded-2xl" />
            ))}
          </div>
        ) : (
          <>
            {FIELD_GROUPS.map((group) => (
              <div key={group.id} className="space-y-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">{group.title}</p>
                  <p className="text-xs text-muted-foreground">{group.description}</p>
                </div>
                {group.id === "advanced" ? (
                  <details className="rounded-2xl border border-dashed bg-muted/10" open={false}>
                    <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-muted-foreground">高级设置（默认折叠）</summary>
                    <div className="grid gap-3 p-4 md:grid-cols-2">{group.fields.map((field) => renderField(field))}</div>
                  </details>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">{group.fields.map((field) => renderField(field))}</div>
                )}
              </div>
            ))}
          </>
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
