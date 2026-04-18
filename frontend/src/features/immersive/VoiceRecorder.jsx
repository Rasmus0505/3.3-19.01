import { useCallback, useRef, useState } from "react";
import { Mic, Square, Loader2 } from "lucide-react";
import { assessSentence } from "../../shared/api/soeApi";

function resolveRecordingMimeType() {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return "";
  }
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  return candidates.find((item) => MediaRecorder.isTypeSupported(item)) || "";
}

export function VoiceRecorder({ refText, lessonId, sentenceIdx, accessToken, apiClient, onResult, disabled }) {
  const [status, setStatus] = useState("idle"); // idle | recording | assessing
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);

  const startRecording = useCallback(async () => {
    if (status !== "idle") return;
    chunksRef.current = [];

    try {
      if (!accessToken || !apiClient) {
        onResult?.(null, "当前未登录，无法使用语音评测");
        return;
      }
      if (!refText.trim()) {
        onResult?.(null, "当前句子为空，无法进行口语评测");
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        onResult?.(null, "当前浏览器不支持录音");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = resolveRecordingMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());

        if (chunksRef.current.length === 0) {
          setStatus("idle");
          return;
        }

        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || "audio/webm" });
        setStatus("assessing");

        try {
          const result = await assessSentence(
            apiClient,
            blob,
            refText.trim(),
            sentenceIdx != null ? String(sentenceIdx) : undefined,
            lessonId != null ? String(lessonId) : undefined,
            accessToken,
          );

          if (result?.ok && String(result.user_text || "").trim()) {
            onResult?.(result, "");
          } else if (result?.ok) {
            onResult?.(null, "未识别到语音内容");
          } else {
            onResult?.(null, result?.detail || result?.message || "评测失败");
          }
        } catch (err) {
          onResult?.(null, String(err.message || "上传失败"));
        } finally {
          setStatus("idle");
        }
      };

      recorderRef.current = recorder;
      recorder.start();
      setStatus("recording");
    } catch (err) {
      setStatus("idle");
      onResult?.(null, "无法访问麦克风，请检查浏览器权限");
    }
  }, [accessToken, apiClient, lessonId, onResult, refText, sentenceIdx, status]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state === "recording") {
      recorderRef.current.stop();
    }
  }, []);

  const handleClick = useCallback(() => {
    if (status === "idle") {
      startRecording();
    } else if (status === "recording") {
      stopRecording();
    }
  }, [startRecording, status, stopRecording]);

  const isRecording = status === "recording";
  const isAssessing = status === "assessing";

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || isAssessing}
      className={[
        "inline-flex items-center justify-center rounded-full w-9 h-9 transition-all shrink-0",
        isRecording
          ? "bg-red-500 text-white shadow-lg animate-pulse hover:bg-red-600"
          : isAssessing
            ? "bg-muted text-muted-foreground cursor-wait"
            : "bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground",
        disabled && "opacity-50 cursor-not-allowed",
      ].filter(Boolean).join(" ")}
      title={isRecording ? "停止录音" : isAssessing ? "评测中..." : "开始录音"}
    >
      {isAssessing ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : isRecording ? (
        <Square className="w-3.5 h-3.5" />
      ) : (
        <Mic className="w-4 h-4" />
      )}
    </button>
  );
}


