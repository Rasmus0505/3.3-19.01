/**
 * Bottle 2.0 Cloud Upload Panel (Browser / Web)
 *
 * Implements the Bottle 2.0 flow:
 *   1. User selects a file
 *   2. POST /api/lessons/tasks/cloud-transcribe  →  Bottle server forwards to DashScope
 *   3. Bottle server returns the transcription text
 *
 * The file is streamed directly from browser → Bottle server → DashScope.
 * Bottle server never persists the file (transient passthrough only).
 */

import { useState, useCallback, useRef } from "react";
import { api } from "../../shared/api/client.js";
import { useAppStore } from "../../store/index.js";
import { extractMediaCoverPreview } from "../../shared/media/localMediaStore.js";

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

type Phase = "idle" | "sending" | "transcribing" | "done" | "error";

interface CloudUploadPanelProps {
  /** Called when the server returns the created task info. */
  onTaskCreated?: (taskId: number) => void;
  /** Called with an error message on failure. */
  onError?: (message: string) => void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                           */
/* ------------------------------------------------------------------ */

export function CloudUploadPanel({ onTaskCreated, onError }: CloudUploadPanelProps) {
  const accessToken = useAppStore((s) => s.accessToken);
  const [phase, setPhase] = useState<Phase>("idle");
  const [statusText, setStatusText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [coverDataUrl, setCoverDataUrl] = useState<string>("");
  const [coverAspectRatio, setCoverAspectRatio] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setPhase("idle");
    setStatusText("");
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    setCoverDataUrl("");
    setCoverAspectRatio(0);
    if (file) {
      void extractAndSetCover(file);
    }
  }, []);

  const extractAndSetCover = async (file: File) => {
    const mediaType = String(file.type || "");
    if (!mediaType.startsWith("video/")) return;
    try {
      const preview = await extractMediaCoverPreview(file, file.name || "");
      if (preview?.coverDataUrl) {
        setCoverDataUrl(preview.coverDataUrl);
        setCoverAspectRatio(preview.aspectRatio || 0);
      }
    } catch (_) {
      // silently ignore cover extraction errors
    }
  };

  const handleUpload = useCallback(async () => {
    if (!selectedFile) return;
    if (!accessToken) {
      onError?.("请先登录后再使用 Bottle 2.0");
      return;
    }

    setPhase("sending");
    setStatusText("正在上传文件…");

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("file_name", selectedFile.name);
      formData.append("file_size", String(selectedFile.size));
      if (selectedFile.type) {
        formData.append("file_type", selectedFile.type);
      }

      setPhase("transcribing");
      setStatusText("正在识别音频…");

      const taskResp = await api(
        "/api/lessons/tasks/cloud-transcribe",
        {
          method: "POST",
          body: formData,
        },
        accessToken,
      );

      if (!taskResp.ok) {
        let detail = "";
        try {
          const err = await taskResp.json();
          detail = err?.message || JSON.stringify(err);
        } catch (_) {
          detail = taskResp.statusText;
        }
        throw new Error(`提交失败 (${taskResp.status}): ${detail}`);
      }

      const taskData = await taskResp.json();
      setPhase("done");
      setStatusText("提交成功！");
      onTaskCreated?.(taskData.task_id ?? taskData.id ?? 0);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setPhase("error");
      setStatusText(message);
      onError?.(message);
    }
  }, [selectedFile, accessToken, onTaskCreated, onError]);

  /* ------------------------------------------------------------------ */
  /*  Render                                                             */
  /* ------------------------------------------------------------------ */

  return (
    <div className="flex flex-col gap-4 p-4 max-w-lg mx-auto">
      <div className="text-sm text-muted-foreground">
        <strong>Bottle 2.0 网页流程</strong>
        <br />
        文件从浏览器直接传输到阿里云，服务器仅转发，文件不落地存储。
      </div>

      {/* File selection */}
      <div className="flex gap-2 items-center">
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*,video/*"
          onChange={handleFileChange}
          className="text-sm"
        />
        {selectedFile && (
          <span className="text-sm text-muted-foreground truncate max-w-[200px]">
            {selectedFile.name}
          </span>
        )}
      </div>

      {/* Action button */}
      {phase === "idle" && (
        <button
          className="btn btn-primary"
          onClick={handleUpload}
          disabled={!selectedFile}
        >
          开始识别
        </button>
      )}

      {/* Sending / Transcribing */}
      {(phase === "sending" || phase === "transcribing") && (
        <div className="flex flex-col gap-2">
          <div className="text-sm">{statusText}</div>
          <div className="text-xs text-muted-foreground animate-pulse">请勿关闭页面…</div>
        </div>
      )}

      {/* Done */}
      {phase === "done" && (
        <div className="text-sm text-green-600">
          {statusText}
          <button className="ml-4 underline" onClick={reset}>
            继续上传
          </button>
        </div>
      )}

      {/* Error */}
      {phase === "error" && (
        <div className="flex gap-2 items-start">
          <div className="text-sm text-destructive flex-1">{statusText}</div>
          <button className="underline text-sm" onClick={reset}>
            重试
          </button>
        </div>
      )}
    </div>
  );
}
