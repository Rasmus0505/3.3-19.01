import { useEffect, useMemo, useRef, useState } from "react";

const TERMINAL_PHASES = new Set(["success", "error"]);
const TERMINAL_AUTO_HIDE_MS = 3000;

export function UploadTaskFloatingCard({ activePanel, accessToken, uploadTaskState, onOpenUpload }) {
  const [terminalDismissedSignature, setTerminalDismissedSignature] = useState("");
  const [terminalVisible, setTerminalVisible] = useState(true);
  const autoHideTimerRef = useRef(null);

  const phase = String(uploadTaskState?.phase || "");
  const isTerminalPhase = TERMINAL_PHASES.has(phase);
  const terminalSignature = useMemo(() => {
    if (!isTerminalPhase || !uploadTaskState) return "";
    return [
      phase,
      String(uploadTaskState.taskId || ""),
      String(uploadTaskState.lessonId || ""),
      String(uploadTaskState.headline || ""),
    ].join(":");
  }, [isTerminalPhase, phase, uploadTaskState]);

  useEffect(() => {
    if (autoHideTimerRef.current) {
      window.clearTimeout(autoHideTimerRef.current);
      autoHideTimerRef.current = null;
    }

    if (!uploadTaskState || !isTerminalPhase) {
      setTerminalVisible(true);
      setTerminalDismissedSignature("");
      return undefined;
    }

    if (terminalDismissedSignature === terminalSignature) {
      setTerminalVisible(false);
      return undefined;
    }

    setTerminalVisible(true);
    if (import.meta.env.DEV) {
      console.debug("[DEBUG] UploadTaskFloatingCard schedule auto hide", { terminalSignature });
    }
    autoHideTimerRef.current = window.setTimeout(() => {
      if (import.meta.env.DEV) {
        console.debug("[DEBUG] UploadTaskFloatingCard auto hidden", { terminalSignature });
      }
      setTerminalVisible(false);
      setTerminalDismissedSignature(terminalSignature);
      autoHideTimerRef.current = null;
    }, TERMINAL_AUTO_HIDE_MS);

    return () => {
      if (autoHideTimerRef.current) {
        window.clearTimeout(autoHideTimerRef.current);
        autoHideTimerRef.current = null;
      }
    };
  }, [isTerminalPhase, terminalDismissedSignature, terminalSignature, uploadTaskState]);

  function handleOpenUpload() {
    if (isTerminalPhase && terminalSignature) {
      if (autoHideTimerRef.current) {
        window.clearTimeout(autoHideTimerRef.current);
        autoHideTimerRef.current = null;
      }
      if (import.meta.env.DEV) {
        console.debug("[DEBUG] UploadTaskFloatingCard dismissed by click", { terminalSignature });
      }
      setTerminalVisible(false);
      setTerminalDismissedSignature(terminalSignature);
    }
    onOpenUpload?.();
  }

  if (!accessToken || activePanel === "upload" || !uploadTaskState || !terminalVisible) {
    return null;
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 w-[min(360px,calc(100vw-24px))]">
      <button
        type="button"
        className="w-full rounded-3xl border bg-background/95 p-4 text-left shadow-lg backdrop-blur transition hover:border-primary/40"
        onClick={handleOpenUpload}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-sm font-semibold">{uploadTaskState.headline}</p>
            <p className="text-xs text-muted-foreground">
              {uploadTaskState.phase === "success"
                ? "已生成完成，点此回到上传页"
                : uploadTaskState.phase === "error"
                  ? uploadTaskState.resumeAvailable
                    ? "生成中断，可继续处理"
                    : "生成失败，点此查看原因"
                  : "正在生成，点此回到上传页"}
            </p>
          </div>
          <span className="text-sm font-semibold tabular-nums text-muted-foreground">{uploadTaskState.progressPercent}%</span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${uploadTaskState.progressPercent}%` }} />
        </div>
      </button>
    </div>
  );
}
