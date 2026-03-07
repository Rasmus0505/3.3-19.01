import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Skeleton, Switch } from "../../shared/ui";

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
  semantic_split_model: "qwen-plus",
  semantic_split_timeout_seconds: 40,
};

export function AdminSubtitleSettingsTab({ apiCall }) {
  const [draft, setDraft] = useState(defaultDraft);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function loadSettings() {
    setLoading(true);
    setStatus("");
    try {
      const resp = await apiCall("/api/admin/subtitle-settings");
      const data = await jsonOrEmpty(resp);
      if (!resp.ok) {
        const message = parseError(data, "加载字幕配置失败");
        setStatus(message);
        toast.error(message);
        return;
      }
      setDraft({
        semantic_split_default_enabled: Boolean(data.settings?.semantic_split_default_enabled),
        subtitle_split_enabled: Boolean(data.settings?.subtitle_split_enabled),
        subtitle_split_target_words: Number(data.settings?.subtitle_split_target_words || 18),
        subtitle_split_max_words: Number(data.settings?.subtitle_split_max_words || 28),
        semantic_split_max_words_threshold: Number(data.settings?.semantic_split_max_words_threshold || 24),
        semantic_split_model: String(data.settings?.semantic_split_model || "qwen-plus"),
        semantic_split_timeout_seconds: Number(data.settings?.semantic_split_timeout_seconds || 40),
      });
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

  async function saveSettings() {
    setSaving(true);
    setStatus("");
    try {
      const resp = await apiCall("/api/admin/subtitle-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          semantic_split_default_enabled: Boolean(draft.semantic_split_default_enabled),
          subtitle_split_enabled: Boolean(draft.subtitle_split_enabled),
          subtitle_split_target_words: Number(draft.subtitle_split_target_words),
          subtitle_split_max_words: Number(draft.subtitle_split_max_words),
          semantic_split_max_words_threshold: Number(draft.semantic_split_max_words_threshold),
          semantic_split_model: String(draft.semantic_split_model || "").trim(),
          semantic_split_timeout_seconds: Number(draft.semantic_split_timeout_seconds),
        }),
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

  return (
    <Card className="apple-panel admin-page-card">
      <CardHeader className="space-y-4">
        <div className="apple-kicker w-fit">Subtitle</div>
        <div className="admin-page-header">
          <div className="admin-page-header-copy">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="size-4" />
              字幕/分句设置
            </CardTitle>
            <CardDescription>维护上传页默认语义分句开关，以及规则分句和语义分句阈值。</CardDescription>
          </div>
          <div className="admin-page-summary">
            <div>
              <span className="apple-eyebrow">加载状态</span>
              <strong>{loading ? "同步中" : "已就绪"}</strong>
            </div>
            <div>
              <span className="apple-eyebrow">保存状态</span>
              <strong>{saving ? "保存中" : "空闲"}</strong>
            </div>
            <div>
              <span className="apple-eyebrow">默认分句</span>
              <strong>{draft.semantic_split_default_enabled ? "语义优先" : "规则优先"}</strong>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? <Skeleton className="h-10 w-full" /> : null}
        {status ? (
          <Alert className="border-white/75 bg-white/76">
            <AlertDescription>{status}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3 rounded-[1.5rem] border border-white/70 bg-white/72 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">上传页默认开启语义分句</p>
                <p className="text-xs text-muted-foreground">用户上传时看到的默认状态，用户本次选择优先。</p>
              </div>
              <Switch
                checked={Boolean(draft.semantic_split_default_enabled)}
                onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, semantic_split_default_enabled: checked }))}
                disabled={saving}
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">启用规则分句</p>
                <p className="text-xs text-muted-foreground">关闭后仅保留 ASR 原句，通常不建议。</p>
              </div>
              <Switch
                checked={Boolean(draft.subtitle_split_enabled)}
                onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, subtitle_split_enabled: checked }))}
                disabled={saving}
              />
            </div>
          </div>

          <div className="space-y-3 rounded-[1.5rem] border border-white/70 bg-white/72 p-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">语义分句模型</p>
              <Input
                value={draft.semantic_split_model}
                onChange={(event) => setDraft((prev) => ({ ...prev, semantic_split_model: event.target.value }))}
                disabled={saving}
              />
            </div>
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
                disabled={saving}
              />
            </div>
          </div>

          <div className="space-y-3 rounded-[1.5rem] border border-white/70 bg-white/72 p-4">
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
                disabled={saving}
              />
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
                disabled={saving}
              />
            </div>
          </div>

          <div className="space-y-3 rounded-[1.5rem] border border-white/70 bg-white/72 p-4">
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
                disabled={saving}
              />
              <p className="text-xs text-muted-foreground">规则分句后仍超过该词数，且本次上传开启语义分句时才调用模型。</p>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={saveSettings} disabled={saving || loading}>
            {saving ? "保存中..." : "保存字幕配置"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
