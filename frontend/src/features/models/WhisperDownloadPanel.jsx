import { CheckCircle2, Copy, Download, ExternalLink, Loader2, RefreshCcw, Server } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { api, parseResponse, toErrorText } from "../../shared/api/client";
import { Alert, AlertDescription, AlertTitle, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../shared/ui";

function toAbsoluteUrl(pathname) {
  if (typeof window === "undefined") return pathname;
  try {
    return new URL(pathname, window.location.origin).toString();
  } catch (_) {
    return pathname;
  }
}

function formatModelStatus(item) {
  const status = String(item?.status || "").toLowerCase();
  if (status === "ready") return { label: "已就绪", tone: "default", description: "网站已缓存好全部白名单文件，用户可直接从本站下载。" };
  if (status === "prefetching") return { label: "预热中", tone: "secondary", description: "服务正在把模型拉到持久目录，首次部署可能需要更久。" };
  if (status === "stale") return { label: "待刷新", tone: "secondary", description: "缓存版本落后，服务会重新拉取最新白名单文件。" };
  return { label: "未缓存", tone: "outline", description: "网站还没缓存这套模型，首次拉取会触发下载。" };
}

function extractTriggerAsset(item) {
  const allowedFiles = Array.isArray(item?.allowed_files) ? item.allowed_files : [];
  return String(allowedFiles.find((name) => String(name).endsWith("config.json")) || allowedFiles[0] || "");
}

async function copyText(value, successText) {
  if (!value) return;
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      toast.success(successText);
      return;
    }
  } catch (_) {
    // fall through to legacy copy flow
  }

  try {
    if (typeof document !== "undefined") {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.setAttribute("readonly", "true");
      textarea.style.position = "absolute";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      toast.success(successText);
      return;
    }
  } catch (_) {
    // ignore and show explicit error below
  }

  toast.error("当前浏览器无法自动复制，请手动复制链接。");
}

function ModelFileLinks({ item }) {
  const files = Array.isArray(item?.allowed_files) ? item.allowed_files : [];
  if (!files.length) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">本站下载文件</p>
      <div className="grid gap-2 md:grid-cols-2">
        {files.map((fileName) => {
          const relativeUrl = `${String(item?.download_url_prefix || "").replace(/\/+$/, "")}/${String(fileName).replace(/^\/+/, "")}`;
          const absoluteUrl = toAbsoluteUrl(relativeUrl);
          return (
            <div key={`${item?.model_key || "model"}-${fileName}`} className="rounded-2xl border bg-muted/20 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{fileName}</p>
                  <p className="truncate text-xs text-muted-foreground">{relativeUrl}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => void copyText(absoluteUrl, "下载地址已复制")}>
                    <Copy className="size-4" />
                    复制
                  </Button>
                  <Button type="button" size="sm" variant="outline" asChild>
                    <a href={relativeUrl} target="_blank" rel="noreferrer">
                      <ExternalLink className="size-4" />
                      打开
                    </a>
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ModelCard({ item, triggerLoadingKey, onTriggerDownload }) {
  const statusMeta = formatModelStatus(item);
  const triggerAsset = extractTriggerAsset(item);
  const busy = triggerLoadingKey === item?.model_key;
  const hasError = Boolean(String(item?.last_error || "").trim());

  return (
    <Card className="rounded-3xl border shadow-sm">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={statusMeta.tone}>{statusMeta.label}</Badge>
          <Badge variant="outline">{item?.model_key || "未命名模型"}</Badge>
          <Badge variant="secondary">{item?.repo_id || "未知来源"}</Badge>
        </div>
        <div className="space-y-1">
          <CardTitle className="text-lg">{item?.model_key === "whisper-base" ? "Whisper Base" : item?.model_key === "whisper-small" ? "Whisper Small" : item?.model_key}</CardTitle>
          <CardDescription>{statusMeta.description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border bg-muted/20 p-3">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">缓存目录</p>
            <p className="mt-1 break-all text-sm text-foreground">{item?.cache_dir || "未返回"}</p>
          </div>
          <div className="rounded-2xl border bg-muted/20 p-3">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">缓存版本</p>
            <p className="mt-1 break-all text-sm text-foreground">{item?.version || "未返回"}</p>
          </div>
        </div>

        {hasError ? (
          <Alert variant="destructive">
            <AlertTitle>最近一次网站侧拉取失败</AlertTitle>
            <AlertDescription>{String(item?.last_error || "")}</AlertDescription>
          </Alert>
        ) : null}

        {!item?.current ? (
          <div className="rounded-2xl border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
            这套模型还没完整缓存到网站。部署后可等服务自动预热，或者点击下面按钮手动触发一次网站侧拉取。
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="default" disabled={!triggerAsset || busy} onClick={() => onTriggerDownload(item, triggerAsset)}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            {busy ? "网站拉取中..." : item?.current ? "重新校验网站缓存" : "触发网站拉取"}
          </Button>
          <Button type="button" variant="outline" onClick={() => void copyText(toAbsoluteUrl(String(item?.download_url_prefix || "")), "模型前缀地址已复制")}>
            <Copy className="size-4" />
            复制模型前缀
          </Button>
        </div>

        {Array.isArray(item?.missing_files) && item.missing_files.length ? (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">待缓存文件</p>
            <div className="flex flex-wrap gap-2">
              {item.missing_files.map((name) => (
                <Badge key={`${item?.model_key || "model"}-missing-${name}`} variant="outline">
                  {name}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}

        <ModelFileLinks item={item} />
      </CardContent>
    </Card>
  );
}

export function WhisperDownloadPanel() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [triggerLoadingKey, setTriggerLoadingKey] = useState("");
  const [error, setError] = useState("");
  const [payload, setPayload] = useState(null);

  const models = useMemo(() => (Array.isArray(payload?.models) ? payload.models : []), [payload]);

  async function loadStatus({ background = false } = {}) {
    if (background) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      console.debug("[DEBUG] whisper.panel.status.request", { background });
      const resp = await api("/api/local-whisper-assets/status");
      const data = await parseResponse(resp);
      if (!resp.ok) {
        throw new Error(toErrorText(data, "Whisper 模型状态加载失败"));
      }
      console.debug("[DEBUG] whisper.panel.status.success", {
        enabledModels: Array.isArray(data?.enabled_models) ? data.enabled_models.length : 0,
      });
      setPayload(data);
    } catch (loadError) {
      console.debug("[DEBUG] whisper.panel.status.error", { error: String(loadError) });
      setError(String(loadError));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadStatus();
  }, []);

  async function triggerDownload(item, assetName) {
    const modelKey = String(item?.model_key || "").trim();
    const safeAsset = String(assetName || "").trim();
    if (!modelKey || !safeAsset) return;
    setTriggerLoadingKey(modelKey);
    try {
      console.debug("[DEBUG] whisper.panel.trigger.start", { modelKey, asset: safeAsset });
      const resp = await api(`/api/local-whisper-assets/${encodeURIComponent(modelKey)}/${safeAsset}`);
      if (!resp.ok) {
        const data = await parseResponse(resp);
        throw new Error(toErrorText(data, "网站侧拉取 Whisper 模型失败"));
      }
      console.debug("[DEBUG] whisper.panel.trigger.success", { modelKey, asset: safeAsset });
      toast.success(`${modelKey} 已触发网站侧拉取`);
      await loadStatus({ background: true });
    } catch (triggerError) {
      const message = String(triggerError);
      console.debug("[DEBUG] whisper.panel.trigger.error", { modelKey, asset: safeAsset, error: message });
      setError(message);
      toast.error(message);
    } finally {
      setTriggerLoadingKey("");
    }
  }

  return (
    <section className="space-y-6">
      <Card className="rounded-3xl border shadow-sm">
        <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">公开下载入口</Badge>
              <Badge variant="secondary">路径 /models</Badge>
            </div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Server className="size-5" />
              Whisper 模型下载
            </CardTitle>
            <CardDescription>这里展示网站侧缓存状态，并提供本站分发链接。用户不需要直连 Hugging Face，也不需要自己翻墙下载模型。</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => void loadStatus({ background: true })} disabled={refreshing}>
              {refreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCcw className="size-4" />}
              刷新状态
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border bg-muted/20 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">已启用模型</p>
              <p className="mt-2 text-2xl font-semibold">{Array.isArray(payload?.enabled_models) ? payload.enabled_models.length : 0}</p>
            </div>
            <div className="rounded-2xl border bg-muted/20 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">缓存根目录</p>
              <p className="mt-2 break-all text-sm text-foreground">{payload?.cache_root || "加载后显示"}</p>
            </div>
            <div className="rounded-2xl border bg-muted/20 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">预热策略</p>
              <p className="mt-2 text-sm text-foreground">{payload?.prefetch_enabled ? "服务启动时自动预热" : "当前关闭自动预热"}</p>
            </div>
          </div>

          <Alert>
            <CheckCircle2 className="size-4" />
            <AlertTitle>用户如何使用</AlertTitle>
            <AlertDescription>部署后先刷新这里的状态。如果显示“已就绪”，用户即可直接打开本站链接下载；如果显示“未缓存”，先点“触发网站拉取”或等待服务自动预热完成。</AlertDescription>
          </Alert>

          {error ? (
            <Alert variant="destructive">
              <AlertTitle>模型面板加载失败</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {loading && !payload ? (
            <div className="rounded-2xl border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">正在读取 Whisper 模型状态...</div>
          ) : null}
        </CardContent>
      </Card>

      {models.map((item) => (
        <ModelCard key={String(item?.model_key || "model")} item={item} triggerLoadingKey={triggerLoadingKey} onTriggerDownload={triggerDownload} />
      ))}
    </section>
  );
}
