import { Mic } from "lucide-react";
import { useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";

const STATUS_IDLE = "idle";
const STATUS_RECORDING = "recording";
const STATUS_PROCESSING = "processing";

function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function AudioRecorder({ onRecordingComplete, maxDuration = 30, compact = false, triggerRef }) {
  const [status, setStatus] = useState(STATUS_IDLE);
  const [elapsedMs, setElapsedMs] = useState(0);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const startTimeRef = useRef(null);
  const timerRef = useRef(null);
  const maxDurationMs = maxDuration * 1000;

  useImperativeHandle(triggerRef, () => ({
    trigger: () => {
      if (status === STATUS_IDLE) {
        startRecording();
      } else if (status === STATUS_RECORDING) {
        stopRecording();
      }
    },
    isRecording: () => status === STATUS_RECORDING,
  }), [status]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  const stopRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try {
        if (recorder.state === "recording") {
          recorder.requestData();
        }
      } catch (_) {
        /* ignore */
      }
      recorder.stop();
    }
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const recorder = new MediaRecorder(stream, { mimeType });

      audioChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        const durationMs = Date.now() - (startTimeRef.current || Date.now());
        stream.getTracks().forEach((track) => track.stop());
        setStatus(STATUS_PROCESSING);
        onRecordingComplete?.(blob, durationMs);
        setStatus(STATUS_IDLE);
        setElapsedMs(0);
      };

      mediaRecorderRef.current = recorder;
      startTimeRef.current = Date.now();

      recorder.start(100);

      setStatus(STATUS_RECORDING);
      setElapsedMs(0);

      timerRef.current = setInterval(() => {
        const now = Date.now();
        const elapsed = now - (startTimeRef.current || now);
        setElapsedMs(elapsed);

        if (elapsed >= maxDurationMs) {
          stopRecording();
        }
      }, 100);
    } catch (err) {
      console.error("[AudioRecorder] Failed to start recording:", err);
      alert("无法访问麦克风，请检查浏览器权限设置。");
    }
  }, [maxDurationMs, onRecordingComplete, stopRecording]);

  const handleClick = () => {
    if (status === STATUS_IDLE) {
      startRecording();
    } else if (status === STATUS_RECORDING) {
      stopRecording();
    }
  };

  const isRecording = status === STATUS_RECORDING;
  const isProcessing = status === STATUS_PROCESSING;

  const compactButtonStyle = {
    appearance: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "34px",
    height: "34px",
    borderRadius: "999px",
    border: "1px solid color-mix(in oklch, var(--color-border) 88%, transparent)",
    background: isRecording
      ? "color-mix(in oklch, #ef4444 12%, var(--color-card))"
      : "color-mix(in oklch, var(--color-card) 90%, var(--color-muted) 10%)",
    color: isRecording ? "#ef4444" : "var(--color-foreground)",
    cursor: isProcessing ? "not-allowed" : "pointer",
    opacity: isProcessing ? 0.6 : 1,
    transition: "border-color 140ms ease, background-color 140ms ease, transform 140ms ease",
    flexShrink: 0,
  };

  const buttonStyle = {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "8px 16px",
    borderRadius: "8px",
    border: "none",
    cursor: isProcessing ? "not-allowed" : "pointer",
    fontSize: "14px",
    fontWeight: "500",
    transition: "background-color 0.2s, transform 0.1s",
    backgroundColor: isRecording ? "#ef4444" : "#3b82f6",
    color: "#fff",
    opacity: isProcessing ? 0.6 : 1,
  };

  const dotStyle = {
    width: "10px",
    height: "10px",
    borderRadius: "50%",
    backgroundColor: "#fff",
    animation: isRecording ? "pulse 1s ease-in-out infinite" : "none",
  };

  const timerStyle = {
    fontVariantNumeric: "tabular-nums",
    minWidth: "48px",
  };

  return (
    <>
      <style>{`
        @keyframes micRing {
          0% { transform: scale(0.8); opacity: 1; }
          70% { transform: scale(1.6); opacity: 0; }
          100% { transform: scale(1.6); opacity: 0; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.2); }
        }
      `}</style>

      {compact ? (
        <button
          style={compactButtonStyle}
          onClick={handleClick}
          disabled={isProcessing}
          type="button"
          aria-label={isRecording ? "停止录音" : "开始跟读"}
          title={isRecording ? "停止录音" : "跟读"}
        >
          {isRecording ? (
            <span style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: "16px", height: "16px" }}>
              <Mic className="size-4" style={{ color: "#ef4444" }} />
              <span style={{
                position: "absolute",
                inset: "-2px",
                borderRadius: "50%",
                border: "2px solid #ef4444",
                animation: "micRing 1s ease-out infinite",
                pointerEvents: "none",
              }} />
            </span>
          ) : (
            <Mic className="size-4" />
          )}
        </button>
      ) : (
        <div style={{ display: "inline-flex", alignItems: "center", gap: "12px" }}>
          <button
            style={buttonStyle}
            onClick={handleClick}
            disabled={isProcessing}
            type="button"
            aria-label={isRecording ? "停止录音" : "开始跟读"}
          >
            <span style={dotStyle} />
            {isRecording ? "停止" : isProcessing ? "处理中..." : "跟读"}
          </button>

          {isRecording && (
            <span style={timerStyle}>{formatDuration(elapsedMs)}</span>
          )}
        </div>
      )}
    </>
  );
}