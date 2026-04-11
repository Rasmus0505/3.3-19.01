import { useCallback, useRef, useState } from "react";
import { Mic, Square, Loader2 } from "lucide-react";
import { parseResponse } from "../../shared/api/client";

export function VoiceRecorder({ refText, lessonId, accessToken, apiClient, onResult, disabled }) {
  const [status, setStatus] = useState("idle"); // idle | recording | uploading
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);

  const startRecording = useCallback(async () => {
    if (status !== "idle") return;
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());

        if (chunksRef.current.length === 0) {
          setStatus("idle");
          return;
        }

        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setStatus("uploading");

        try {
          const formData = new FormData();
          formData.append("audio_file", blob, "recording.webm");
          formData.append("ref_text", refText || "free speech");
          if (lessonId) formData.append("lesson_id", String(lessonId));

          const resp = await apiClient(
            "/api/soe/assess",
            { method: "POST", body: formData },
            accessToken,
          );
          const data = await parseResponse(resp);

          if (resp.ok && data.ok) {
            onResult?.(data);
          } else {
            onResult?.(null, data.detail || data.message || "评测失败");
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
  }, [accessToken, apiClient, lessonId, onResult, refText, status]);

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
  const isUploading = status === "uploading";

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || isUploading}
      className={[
        "inline-flex items-center justify-center rounded-full w-9 h-9 transition-all shrink-0",
        isRecording
          ? "bg-red-500 text-white shadow-lg animate-pulse hover:bg-red-600"
          : isUploading
            ? "bg-muted text-muted-foreground cursor-wait"
            : "bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground",
        disabled && "opacity-50 cursor-not-allowed",
      ].filter(Boolean).join(" ")}
      title={isRecording ? "停止录音" : isUploading ? "评测中..." : "开始录音"}
    >
      {isUploading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : isRecording ? (
        <Square className="w-3.5 h-3.5" />
      ) : (
        <Mic className="w-4 h-4" />
      )}
    </button>
  );
}
