import { RefreshCcw, RotateCcw, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { formatDateTimeBeijing } from "../../shared/lib/datetime";
import { Alert, AlertDescription, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Skeleton, Switch } from "../../shared/ui";

function parseError(data, fallback) {
  return `${data?.error_code || "ERROR"}: ${data?.message || fallback}`;
}

async function jsonOrEmpty(resp) {
  try {
    return await resp.json();
  } catch (_) {
    return {};
  }
}

const defaultDraft = {
  semantic_split_default_enabled: false,
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
    label: "稳妥默认",
    description: "适合大多数课程，优先稳定和可读性。",
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
    label: "长句更积极",
    description: "长句更早触发语义分句，适合字幕很长、节奏偏快的素材。",
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
    label: "节省模型调用",
    description: "尽量先走规则分句，减少语义分句和翻译批次拆分频率。",
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

function normalizeDraft(source) {
  return {
    semantic_split_default_enabled: Boolean(source?.semantic_split_default_enabled),
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

export function AdminSubtitleSettingsTab({ apiCall }) {
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
      const resp = await apiCall("/api/admin/subtitle-settings/history");
      const data = await jsonOrEmpty(resp);
      if (!resp.ok) {
        const message = parseError(data, "加载字幕配置失败");
        setStatus(message);
        toast.error(message);
        return;
      }
      const current = normalizeDraft(data.current || data.settings || defaultDraft);
      setDraft(current);
      setLoadedSettings(current);
      setCurrentMeta(data.current || data.settings || null);
      setRollbackCandidate(data.rollback_candidate || null);
    } catch (error) {
      const message = `网络错误: ${String(error)}`;
      setStatus(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyPreset(settings) {
    setDraft(normalizeDraft(settings));
  }

  async function saveSettings() {
    setSaving(true);
    setStatus("");
    try {
      const resp = await apiCall("/api/admin/subtitle-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(normalizeDraft(draft)),
      });
      const data = await jsonOrEmpty(resp);
      if (!resp.ok) {
        const message = parseError(data, "保存字幕配置失败");
        setStatus(message);
        toast.error(message);
        return;
      }
      setStatus("字幕配置已保存");
      toast.success("字幕配置已保存");
      await loadSettings();
    } catch (error) {
      const message = `网络错误: ${String(error)}`;
      setStatus(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  async function rollbackLast() {
    setRollbacking(true);
    setStatus("");
    try {
      const resp = await apiCall("/api/admin/subtitle-settings/rollback-last", {
        method: "POST",
      });
      const data = await jsonOrEmpty(resp);
      if (!resp.ok) {
        const message = parseError(data, "回滚上一版本失败");
        setStatus(message);
        toast.error(message);
        return;
      }
      setStatus("已回滚到上一版本");
      toast.success("已回滚到上一版本");
      await loadSettings();
    } catch (error) {
      const message = `网络错误: ${String(error)}`;
      setStatus(message);
      toast.error(message);
    } finally {
      setRollbacking(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4" />
          字幕/分句设置
        </CardTitle>
        <CardDescription>按“运营可理解”的方式维护默认分句策略、翻译批次与回滚入口，避免直接改抽象参数。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? <Skeleton className="h-10 w-full" /> : null}
        {status ? (
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
                  应用模板
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3 rounded-md border p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">上传页默认开启语义分句</p>
                <p className="text-xs text-muted-foreground">适合句子偏长、规则分句后仍不自然的课程；用户本次手动选择优先。</p>
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
                <p className="text-xs text-muted-foreground">通常建议保持开启，让大部分句子先走低成本规则分句。</p>
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
              <p className="text-sm font-medium">当前线上版本</p>
              <p className="text-xs text-muted-foreground">
                最近更新时间：{formatDateTimeBeijing(currentMeta?.updated_at)}
              </p>
              <p className="text-xs text-muted-foreground">
                最近修改人：{currentMeta?.updated_by_user_email || "未知 / 尚无记录"}
              </p>
              <p className="text-xs text-muted-foreground">
                可回滚上一版本：
                {rollbackCandidate ? ` ${rollbackCandidate.operator_user_email || "未知操作员"} / ${formatDateTimeBeijing(rollbackCandidate.created_at)}` : " 暂无"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setDraft(normalizeDraft(loadedSettings))} disabled={!dirty || saving || rollbacking}>
                <RefreshCcw className="size-4" />
                恢复当前线上值
              </Button>
              <Button variant="outline" size="sm" onClick={rollbackLast} disabled={!rollbackCandidate || saving || rollbacking}>
                <RotateCcw className="size-4" />
                {rollbacking ? "回滚中..." : "回滚上一版本"}
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3 rounded-md border p-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">语义分句超时秒数</p>
              <Input
                type="number"
                min={1}
                max={300}
                value={draft.semantic_split_timeout_seconds}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, semantic_split_timeout_seconds: Number(event.target.value || 1) }))
                }
                disabled={saving || rollbacking}
              />
              <p className="text-xs text-muted-foreground">语义分句固定复用 `qwen-mt-flash`，这里仅控制等待时长，不再单独配置模型。</p>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">翻译批次最大字符数</p>
              <Input
                type="number"
                min={1}
                max={12000}
                value={draft.translation_batch_max_chars}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, translation_batch_max_chars: Number(event.target.value || 1) }))
                }
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
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, subtitle_split_target_words: Number(event.target.value || 1) }))
                }
                disabled={saving || rollbacking}
              />
              <p className="text-xs text-muted-foreground">一句理想长度，适合大多数字幕阅读节奏。</p>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">规则分句最大词数</p>
              <Input
                type="number"
                min={1}
                max={300}
                value={draft.subtitle_split_max_words}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, subtitle_split_max_words: Number(event.target.value || 1) }))
                }
                disabled={saving || rollbacking}
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">触发语义分句阈值</p>
              <Input
                type="number"
                min={1}
                max={300}
                value={draft.semantic_split_max_words_threshold}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, semantic_split_max_words_threshold: Number(event.target.value || 1) }))
                }
                disabled={saving || rollbacking}
              />
              <p className="text-xs text-muted-foreground">规则分句后仍超过这个长度，才值得继续调用模型做语义拆分。</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={dirty ? "default" : "outline"}>{dirty ? "存在未保存改动" : "当前与线上一致"}</Badge>
          <Button onClick={saveSettings} disabled={saving || loading || rollbacking || !dirty}>
            {saving ? "保存中..." : "保存字幕配置"}
          </Button>
          <Button variant="outline" onClick={loadSettings} disabled={saving || rollbacking}>
            刷新线上版本
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
