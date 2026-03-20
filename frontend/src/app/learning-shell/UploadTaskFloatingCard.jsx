import { useEffect, useMemo, useRef, useState } from "react";

import { getUploadTaskTone, getUploadToneStyles } from "../../features/upload/uploadStatusTheme";

const TERMINAL_PHASES = new Set(["success", "error"]);
const TERMINAL_AUTO_HIDE_MS = 3000;

export function UploadTaskFloatingCard({ activePanel, accessToken, uploadTaskState, onOpenUpload }) {
  const [terminalDismissedSignature, setTerminalDismissedSignature] = useState("");
  const [terminalVisible, setTerminalVisible] = useState(true);
  const autoHideTimerRef = useRef(null);

  const phase = String(uploadTaskState?.phase || "");
  const tone =
    String(uploadTaskState?.tone || "") ||
    getUploadTaskTone({
      phase,
      resumeAvailable: Boolean(uploadTaskState?.resumeAvailable),
      taskStatus: uploadTaskState?.taskSnapshot?.status,
    });
  const toneStyles = getUploadToneStyles(tone);
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
    autoHideTimerRef.current = window.setTimeout(() => {
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
      <button type="button" className={`w-full rounded-3xl border p-4 text-left shadow-lg backdrop-blur transition ${toneStyles.floatingCard}`} onClick={handleOpenUpload}>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-sm font-semibold">{uploadTaskState.headline}</p>
            <p className={`text-xs ${toneStyles.text}`}>
              {phase === "success"
                ? "已生成完成，点此回到上传页"
                : phase === "error"
                  ? uploadTaskState.resumeAvailable
                    ? "生成中断，可继续处理"
                    : "生成失败，点此查看原因"
                  : "正在生成，点此回到上传页"}
            </p>
          </div>
          <span className={`text-sm font-semibold tabular-nums ${toneStyles.text}`}>{uploadTaskState.progressPercent}%</span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
          <div className={`h-full rounded-full transition-[width] duration-300 ${toneStyles.progress}`} style={{ width: `${uploadTaskState.progressPercent}%` }} />
        </div>
      </button>
    </div>
  );
}
