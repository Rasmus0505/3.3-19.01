import { RefreshCcw, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AdminErrorNotice } from "../../shared/components/AdminErrorNotice";
import { formatDateTimeBeijing } from "../../shared/lib/datetime";
import { formatNetworkError, formatResponseError, parseJsonSafely } from "../../shared/lib/errorFormatter";
import { useErrorHandler } from "../../shared/hooks/useErrorHandler";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Skeleton, Switch } from "../../shared/ui";

const defaultDraft = {
  model_dir: "iic/SenseVoiceSmall",
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
    description: "常用的模型路径、运行设备和分句策略，调整频率最高。",
    fields: [
      { key: "model_dir", label: "模型路径", hint: "model_dir（模型名称或上线磁盘路径）", type: "text" },
      { key: "device", label: "运行设备", hint: "device（常见值：cuda:0 / cpu；如需自动判断请明确填写 auto）", type: "text" },
      { key: "language", label: "识别语言", hint: "language（auto / en / zn；固定语言比 auto 更稳定）", type: "text" },
      { key: "vad_model", label: "VAD 模型", hint: "vad_model（空表示关闭 VAD；有值则开启并根据模型切割）", type: "text" },
      { key: "vad_max_single_segment_time", label: "VAD 最大切段(ms)", hint: "每段最多时长，越小切得越细，越大越接近原始片段。", type: "number" },
      { key: "batch_size_s", label: "动态批秒数", hint: "batch_size_s（每个 batch 的目标时长，太高可能影响响应时间）", type: "number" },
      { key: "use_itn", label: "ITN", hint: "ITN（是否开启标点+归一化；关闭会保留原始 token）", type: "bool" },
    ],
  },
  {
    id: "advanced",
    title: "高级/危险设置",
    description: "高级 tuning 选项默认折叠，仅在排查或有特定需求时打开。",
    fields: [
      { key: "trust_remote_code", label: "远程代码", hint: "trust_remote_code（允许 remote_code 覆盖模型实现，关闭时 remote_code 无效）", type: "bool" },
      { key: "remote_code", label: "代码位置", hint: "remote_code（示例：../custom/sensevoice.py；仅 trust_remote_code=true 时可编辑）", type: "text" },
      { key: "merge_vad", label: "合并 VAD", hint: "merge_vad（是否把切碎的短句重新拼成中长句，适合长内容）", type: "bool" },
      { key: "merge_length_s", label: "合并后秒数", hint: "merge_length_s（merge_vad 打开后，目标时长；越长越占内存）", type: "number" },
      { key: "ban_emo_unk", label: "禁用 emo_unk", hint: "ban_emo_unk（是否屏蔽情感未知判定，主要用于调试）", type: "bool" },
    ],
  },
];

function normalizeDraft(source) {
  return {
    model_dir: String(source?.model_dir || defaultDraft.model_dir),
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
            <>
              <Input
                type={field.type === "number" ? "number" : "text"}
                value={value}
                disabled={disabledRemote}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    [field.key]: field.type === "number" ? Number(event.target.value || 0) : event.target.value,
                  }))
                }
              />
              {field.key === "remote_code" && !draft.trust_remote_code ? (
                <p className="mt-1 text-xs text-muted-foreground">远程代码仅在“远程代码”开关打开时才生效。</p>
              ) : null}
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
            action: "加载 SenseVoice 参数",
            endpoint: "/api/admin/sensevoice-settings/history",
            method: "GET",
            fallbackMessage: "加载 SenseVoice 参数失败",
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
          action: "加载 SenseVoice 参数",
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
            action: "保存 SenseVoice 参数",
            endpoint: "/api/admin/sensevoice-settings",
            method: "PUT",
            fallbackMessage: "保存 SenseVoice 参数失败",
          }),
        );
        setStatus(formattedError.displayMessage);
        return;
      }
      setStatus("SenseVoice 参数已保存");
      toast.success("SenseVoice 参数已保存");
      await loadSettings();
    } catch (requestError) {
      const formattedError = captureError(
        formatNetworkError(requestError, {
          component: "AdminSenseVoiceSettingsTab",
          action: "保存 SenseVoice 参数",
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
            action: "回滚 SenseVoice 参数",
            endpoint: "/api/admin/sensevoice-settings/rollback-last",
            method: "POST",
            fallbackMessage: "回滚上一版 SenseVoice 参数失败",
          }),
        );
        setStatus(formattedError.displayMessage);
        return;
      }
      setStatus("已回滚到上一版 SenseVoice 参数");
      toast.success("已回滚到上一版 SenseVoice 参数");
      await loadSettings();
    } catch (requestError) {
      const formattedError = captureError(
        formatNetworkError(requestError, {
          component: "AdminSenseVoiceSettingsTab",
          action: "回滚 SenseVoice 参数",
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
          <CardTitle className="text-lg">SenseVoice 参数</CardTitle>
          <CardDescription>这里单独维护服务端 SenseVoice 推理参数。每个字段括号里都写了“改这个参数是干嘛的”，管理员直接按用途调整即可。</CardDescription>
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
                    <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-muted-foreground">高级 / 危险设置（默认折叠）</summary>
                    <div className="grid gap-3 p-4 md:grid-cols-2">
                      {group.fields.map((field) => renderField(field))}
                    </div>
                  </details>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {group.fields.map((field) => renderField(field))}
                  </div>
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
