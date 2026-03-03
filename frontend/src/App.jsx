import { Loader2, UploadCloud } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "./components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { Textarea } from "./components/ui/textarea";

const MODELS = [
  { value: "qwen3-asr-flash-filetrans", label: "qwen3-asr-flash-filetrans" },
  { value: "paraformer-v2", label: "paraformer-v2 (timestamp_alignment_enabled=true)" },
];

function StatusText({ status }) {
  if (!status.text) {
    return null;
  }
  return <p className={status.ok ? "text-sm font-medium text-[#54d399]" : "text-sm font-medium text-[#ff7b7b]"}>{status.text}</p>;
}

export default function App() {
  const [model, setModel] = useState(MODELS[0].value);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ text: "", ok: true });
  const [result, setResult] = useState("");

  const chosenModelLabel = useMemo(() => MODELS.find((item) => item.value === model)?.label ?? model, [model]);

  async function onSubmit() {
    if (!file) {
      setStatus({ text: "请先选择文件", ok: false });
      return;
    }
    setLoading(true);
    setStatus({ text: "处理中，请等待转写完成...", ok: true });
    try {
      const form = new FormData();
      form.append("video_file", file);
      form.append("model", model);

      const response = await fetch("/api/transcribe/file", { method: "POST", body: form });
      let data;
      try {
        data = await response.json();
      } catch (_) {
        data = { ok: false, error_code: "INVALID_JSON", message: "响应不是 JSON", detail: "" };
      }
      setResult(JSON.stringify(data, null, 2));
      setStatus({ text: response.ok ? "转写成功" : "转写失败", ok: response.ok });
    } catch (error) {
      setResult(
        JSON.stringify(
          {
            ok: false,
            error_code: "NETWORK_ERROR",
            message: "请求失败",
            detail: String(error),
          },
          null,
          2,
        ),
      );
      setStatus({ text: "网络错误，请稍后重试", ok: false });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_15%_10%,#1a3465,#040a19)] px-4 py-8 text-foreground md:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">English ASR Studio</CardTitle>
            <CardDescription>FastAPI + React + Tailwind + shadcn style UI. 当前模型：{chosenModelLabel}</CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UploadCloud className="h-4 w-4" />
              上传本地视频/音频
            </CardTitle>
            <CardDescription>后端流程：转 Opus (16k/mono) → DashScope Files → ASR 模型。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="block text-sm font-medium text-muted-foreground" htmlFor="modelSelect">
              模型选择
            </label>
            <select
              id="modelSelect"
              className="h-10 w-full rounded-md border border-input bg-[#091023] px-3 text-sm outline-none ring-offset-background focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              disabled={loading}
            >
              {MODELS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>

            <label className="block text-sm font-medium text-muted-foreground" htmlFor="fileInput">
              选择文件
            </label>
            <input
              id="fileInput"
              type="file"
              className="block w-full rounded-md border border-dashed border-input bg-[#091023] px-3 py-3 text-sm file:mr-4 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              disabled={loading}
            />

            <Button className="w-full" onClick={onSubmit} disabled={loading}>
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  处理中
                </span>
              ) : (
                "提交 /api/transcribe/file"
              )}
            </Button>

            <StatusText status={status} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>响应结果</CardTitle>
            <CardDescription>完整 JSON 回包（含 task 状态与 asr_result_json）。</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea value={result} readOnly placeholder="提交后会显示返回结果..." />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
