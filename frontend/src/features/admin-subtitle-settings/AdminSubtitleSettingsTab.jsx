import { RefreshCcw, RotateCcw, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AdminErrorNotice } from "../../shared/components/AdminErrorNotice";
import { formatDateTimeBeijing } from "../../shared/lib/datetime";
import { formatNetworkError, formatResponseError, parseJsonSafely } from "../../shared/lib/errorFormatter";
import { useErrorHandler } from "../../shared/hooks/useErrorHandler";
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Switch,
} from "../../shared/ui";

const defaultDraft = {
  semantic_split_default_enabled: false,
  default_asr_model: "",
  subtitle_split_enabled: true,
  subtitle_split_target_words: 18,
  subtitle_split_max_words: 28,
  semantic_split_max_words_threshold: 24,
  semantic_split_timeout_seconds: 40,
  translation_batch_max_chars: 2600,
};

const presetOptions = [
  {
    key: "balanced",
    label: "默认稳妥",
    description: "适合大多数课程，优先稳定和阅读体验。",
    settings: {
      semantic_split_default_enabled: false,
      subtitle_split_enabled: true,
      subtitle_split_target_words: 18,
      subtitle_split_max_words: 28,
      semantic_split_max_words_threshold: 24,
      semantic_split_timeout_seconds: 40,
      translation_batch_max_chars: 2600,
    },
  },
  {
    key: "aggressive_split",
    label: "长句优先",
    description: "更早细分长句，适合字幕很长、语速偏快的素材。",
    settings: {
      semantic_split_default_enabled: true,
      subtitle_split_enabled: true,
      subtitle_split_target_words: 14,
      subtitle_split_max_words: 22,
      semantic_split_max_words_threshold: 18,
      semantic_split_timeout_seconds: 50,
      translation_batch_max_chars: 2200,
    },
  },
  {
    key: "cost_saving",
    label: "节省调用",
    description: "尽量先走规则分句，减少模型调用次数。",
    settings: {
      semantic_split_default_enabled: false,
      subtitle_split_enabled: true,
      subtitle_split_target_words: 22,
      subtitle_split_max_words: 34,
      semantic_split_max_words_threshold: 30,
      semantic_split_timeout_seconds: 30,
      translation_batch_max_chars: 3200,
    },
  },
];

function normalizeDraft(source, fallbackAsrModel = "") {
  return {
    semantic_split_default_enabled: Boolean(source?.semantic_split_default_enabled),
    default_asr_model: String(source?.default_asr_model || fallbackAsrModel || ""),
    subtitle_split_enabled: Boolean(source?.subtitle_split_enabled),
    subtitle_split_target_words: Number(source?.subtitle_split_target_words || 18),
    subtitle_split_max_words: Number(source?.subtitle_split_max_words || 28),
    semantic_split_max_words_threshold: Number(source?.semantic_split_max_words_threshold || 24),
    semantic_split_timeout_seconds: Number(source?.semantic_split_timeout_seconds || 40),
    translation_batch_max_chars: Number(source?.translation_batch_max_chars || 2600),
  };
}

function draftsEqual(left, right) {
  return JSON.stringify(normalizeDraft(left)) === JSON.stringify(normalizeDraft(right));
}

function pickAvailableAsrModels(rates, currentModel = "") {
  const models = (Array.isArray(rates) ? rates : [])
    .filter((item) => item?.billing_unit === "minute" && item?.is_active)
    .map((item) => String(item.model_name || "").trim())
    .filter(Boolean);
  if (currentModel && !models.includes(currentModel)) {
    models.unshift(currentModel);
  }
  return Array.from(new Set(models));
}

export function AdminSubtitleSettingsTab({ apiCall }) {
  const [draft, setDraft] = useState(defaultDraft);
  const [loadedSettings, setLoadedSettings] = useState(defaultDraft);
  const [currentMeta, setCurrentMeta] = useState(null);
  const [rollbackCandidate, setRollbackCandidate] = useState(null);
  const [availableAsrModels, setAvailableAsrModels] = useState([]);
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
      const [historyResp, ratesResp] = await Promise.all([
        apiCall("/api/admin/subtitle-settings/history"),
        apiCall("/api/admin/billing-rates"),
      ]);
      const [historyData, ratesData] = await Promise.all([parseJsonSafely(historyResp), parseJsonSafely(ratesResp)]);
      if (!historyResp.ok || !ratesResp.ok) {
        const failedResponse = historyResp.ok ? ratesResp : historyResp;
        const failedData = historyResp.ok ? ratesData : historyData;
        const formattedError = captureError(
          formatResponseError(failedResponse, failedData, {
            component: "AdminSubtitleSettingsTab",
            action: "加载字幕配置",
            endpoint: "/api/admin/subtitle-settings/history + /api/admin/billing-rates",
            method: "GET",
            fallbackMessage: "加载字幕配置失败",
          }),
        );
        setStatus(formattedError.displayMessage);
        return;
      }

      const currentSource = historyData.current || historyData.settings || defaultDraft;
      const availableModels = pickAvailableAsrModels(ratesData.rates, String(currentSource?.default_asr_model || ""));
      const fallbackAsrModel = availableModels[0] || String(currentSource?.default_asr_model || "");
      const current = normalizeDraft(currentSource, fallbackAsrModel);

      setAvailableAsrModels(availableModels);
      setDraft(current);
      setLoadedSettings(current);
      setCurrentMeta(historyData.current || historyData.settings || null);
      setRollbackCandidate(historyData.rollback_candidate || null);
    } catch (requestError) {
      const formattedError = captureError(
        formatNetworkError(requestError, {
          component: "AdminSubtitleSettingsTab",
          action: "加载字幕配置",
          endpoint: "/api/admin/subtitle-settings/history + /api/admin/billing-rates",
          method: "GET",
        }),
      );
      setStatus(formattedError.displayMessage);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyPreset(settings) {
    setDraft((prev) => normalizeDraft({ ...settings, default_asr_model: prev.default_asr_model || availableAsrModels[0] || "" }));
  }

  async function saveSettings() {
    setSaving(true);
    setStatus("");
    clearError();
    try {
      const resp = await apiCall("/api/admin/subtitle-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(normalizeDraft(draft, availableAsrModels[0] || "")),
      });
      const data = await parseJsonSafely(resp);
      if (!resp.ok) {
        const formattedError = captureError(
          formatResponseError(resp, data, {
            component: "AdminSubtitleSettingsTab",
            action: "保存字幕配置",
            endpoint: "/api/admin/subtitle-settings",
            method: "PUT",
            meta: { draft: normalizeDraft(draft, availableAsrModels[0] || "") },
            fallbackMessage: "保存字幕配置失败",
          }),
        );
        setStatus(formattedError.displayMessage);
        return;
      }
      setStatus("设置已保存");
      toast.success("设置已保存");
      await loadSettings();
    } catch (requestError) {
      const formattedError = captureError(
        formatNetworkError(requestError, {
          component: "AdminSubtitleSettingsTab",
          action: "保存字幕配置",
          endpoint: "/api/admin/subtitle-settings",
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
      const resp = await apiCall("/api/admin/subtitle-settings/rollback-last", {
        method: "POST",
      });
      const data = await parseJsonSafely(resp);
      if (!resp.ok) {
        const formattedError = captureError(
          formatResponseError(resp, data, {
            component: "AdminSubtitleSettingsTab",
            action: "回滚字幕配置",
            endpoint: "/api/admin/subtitle-settings/rollback-last",
            method: "POST",
            fallbackMessage: "回滚上一版本失败",
          }),
        );
        setStatus(formattedError.displayMessage);
        return;
      }
      setStatus("已回滚到上一版");
      toast.success("已回滚到上一版");
      await loadSettings();
    } catch (requestError) {
      const formattedError = captureError(
        formatNetworkError(requestError, {
          component: "AdminSubtitleSettingsTab",
          action: "回滚字幕配置",
          endpoint: "/api/admin/subtitle-settings/rollback-last",
          method: "POST",
        }),
      );
      setStatus(formattedError.displayMessage);
    } finally {
      setRollbacking(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4" />
          默认策略
        </CardTitle>
        <CardDescription>统一管理默认 ASR、默认分句和翻译批次。改完后，新任务会按这里的后台设置执行。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? <Skeleton className="h-10 w-full" /> : null}
        {error ? (
          <AdminErrorNotice error={error} />
        ) : status ? (
          <Alert>
            <AlertDescription>{status}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-3 md:grid-cols-3">
          {presetOptions.map((preset) => (
            <Card key={preset.key}>
              <CardContent className="space-y-3 p-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium">{preset.label}</p>
                  <p className="text-xs text-muted-foreground">{preset.description}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => applyPreset(preset.settings)}>
                  直接套用
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3 rounded-md border p-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">默认 ASR 模型</p>
              <Select
                value={draft.default_asr_model || availableAsrModels[0] || ""}
                onValueChange={(value) => setDraft((prev) => ({ ...prev, default_asr_model: value }))}
                disabled={saving || rollbacking || availableAsrModels.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder={availableAsrModels.length ? "选择默认 ASR 模型" : "当前没有可用的 ASR 模型"} />
                </SelectTrigger>
                <SelectContent>
                  {availableAsrModels.map((modelName) => (
                    <SelectItem key={modelName} value={modelName}>
                      {modelName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">候选项只来自当前启用的分钟计费模型。上传页和课程创建默认都会优先使用这里的配置。</p>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">上传页默认开启语义分句</p>
                <p className="text-xs text-muted-foreground">适合长句较多的课程；如果用户本次手动改了，以用户选择为准。</p>
              </div>
              <Switch
                checked={Boolean(draft.semantic_split_default_enabled)}
                onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, semantic_split_default_enabled: checked }))}
                disabled={saving || rollbacking}
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">启用规则分句</p>
                <p className="text-xs text-muted-foreground">建议保持开启，让大部分句子先走更省调用的规则分句。</p>
              </div>
              <Switch
                checked={Boolean(draft.subtitle_split_enabled)}
                onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, subtitle_split_enabled: checked }))}
                disabled={saving || rollbacking}
              />
            </div>
          </div>

          <div className="space-y-3 rounded-md border p-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">当前生效版本</p>
              <p className="text-xs text-muted-foreground">最近更新时间：{formatDateTimeBeijing(currentMeta?.updated_at)}</p>
              <p className="text-xs text-muted-foreground">最近修改人：{currentMeta?.updated_by_user_email || "未知 / 尚无记录"}</p>
              <p className="text-xs text-muted-foreground">当前默认 ASR：{draft.default_asr_model || "未配置"}</p>
              <p className="text-xs text-muted-foreground">
                可回滚版本：
                {rollbackCandidate ? ` ${rollbackCandidate.operator_user_email || "未知操作员"} / ${formatDateTimeBeijing(rollbackCandidate.created_at)}` : " 暂无"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setDraft(normalizeDraft(loadedSettings, availableAsrModels[0] || ""))} disabled={!dirty || saving || rollbacking}>
                <RefreshCcw className="size-4" />
                恢复当前生效值
              </Button>
              <Button variant="outline" size="sm" onClick={rollbackLast} disabled={!rollbackCandidate || saving || rollbacking}>
                <RotateCcw className="size-4" />
                {rollbacking ? "回滚中..." : "回滚到上一版"}
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3 rounded-md border p-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">语义分句等待秒数</p>
              <Input
                type="number"
                min={1}
                max={300}
                value={draft.semantic_split_timeout_seconds}
                onChange={(event) => setDraft((prev) => ({ ...prev, semantic_split_timeout_seconds: Number(event.target.value || 1) }))}
                disabled={saving || rollbacking}
              />
              <p className="text-xs text-muted-foreground">这里只控制等待时长，不需要单独配置模型。</p>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">翻译每批最大字符数</p>
              <Input
                type="number"
                min={1}
                max={12000}
                value={draft.translation_batch_max_chars}
                onChange={(event) => setDraft((prev) => ({ ...prev, translation_batch_max_chars: Number(event.target.value || 1) }))}
                disabled={saving || rollbacking}
              />
              <p className="text-xs text-muted-foreground">越小越稳，越大越省请求次数；MVP 阶段建议 2200-3200。</p>
            </div>
          </div>

          <div className="space-y-3 rounded-md border p-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">规则分句目标词数</p>
              <Input
                type="number"
                min={1}
                max={200}
                value={draft.subtitle_split_target_words}
                onChange={(event) => setDraft((prev) => ({ ...prev, subtitle_split_target_words: Number(event.target.value || 1) }))}
                disabled={saving || rollbacking}
              />
              <p className="text-xs text-muted-foreground">一句理想长度，适合大多数字幕阅读节奏。</p>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">规则分句上限词数</p>
              <Input
                type="number"
                min={1}
                max={300}
                value={draft.subtitle_split_max_words}
                onChange={(event) => setDraft((prev) => ({ ...prev, subtitle_split_max_words: Number(event.target.value || 1) }))}
                disabled={saving || rollbacking}
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">超过多少词再走语义分句</p>
              <Input
                type="number"
                min={1}
                max={300}
                value={draft.semantic_split_max_words_threshold}
                onChange={(event) => setDraft((prev) => ({ ...prev, semantic_split_max_words_threshold: Number(event.target.value || 1) }))}
                disabled={saving || rollbacking}
              />
              <p className="text-xs text-muted-foreground">规则分句后仍超过这个长度，才值得继续调用模型做语义拆分。</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={dirty ? "default" : "outline"}>{dirty ? "有未保存修改" : "当前与线上一致"}</Badge>
          <Button onClick={saveSettings} disabled={saving || loading || rollbacking || !dirty || !draft.default_asr_model}>
            {saving ? "保存中..." : "保存设置"}
          </Button>
          <Button variant="outline" onClick={loadSettings} disabled={saving || rollbacking}>
            重新加载
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
