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

const FIELD_META = [
  { key: "model_dir", label: "模型路径", hint: "model_dir（模型名称或本地磁盘路径，用来决定加载哪套 SenseVoice 模型）", type: "text" },
  { key: "trust_remote_code", label: "远程代码", hint: "trust_remote_code（是否允许从 remote_code 加载模型实现代码）", type: "bool" },
  { key: "remote_code", label: "代码位置", hint: "remote_code（模型实现代码路径或 URL；仅 trust_remote_code 打开时生效）", type: "text" },
  { key: "device", label: "运行设备", hint: "device（如 cuda:0 / cpu，用来决定推理跑在哪张卡或 CPU）", type: "text" },
  { key: "language", label: "识别语言", hint: "language（如 auto / en / zn；固定语言通常比 auto 更稳定更快）", type: "text" },
  { key: "vad_model", label: "VAD 模型", hint: "vad_model（是否启用 VAD 切段；空值表示关闭 VAD）", type: "text" },
  { key: "vad_max_single_segment_time", label: "VAD 最大切段毫秒", hint: "vad_max_single_segment_time（VAD 单段上限，越小切得越碎，越大越容易保留长句）", type: "number" },
  { key: "use_itn", label: "ITN", hint: "use_itn（是否输出标点和逆文本正则化结果）", type: "bool" },
  { key: "batch_size_s", label: "动态批秒数", hint: "batch_size_s（动态 batch 的总音频时长，越大通常吞吐越高）", type: "number" },
  { key: "merge_vad", label: "合并 VAD", hint: "merge_vad（是否把 VAD 切碎的短片段重新合并后再识别）", type: "bool" },
  { key: "merge_length_s", label: "合并后秒数", hint: "merge_length_s（merge_vad 打开后，每段合并到多长）", type: "number" },
  { key: "ban_emo_unk", label: "禁用 emo_unk", hint: "ban_emo_unk（禁用后句子都会被赋情感标签）", type: "bool" },
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
