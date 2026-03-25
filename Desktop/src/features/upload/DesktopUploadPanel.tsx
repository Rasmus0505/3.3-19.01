/**
 * Desktop Upload Panel
 *
 * Upload panel for the desktop client. Supports:
 * - Local file selection via native file dialog
 * - Sherpa-ONNX local ASR (Bottle 1.0)
 * - Cloud STS upload (Bottle 2.0)
 *
 * This is the primary entry point for content generation in the desktop client.
 */

import React, { useState, useCallback, useRef } from "react";

declare global {
  interface Window {
    electronAPI: {
      getAppVersion: () => Promise<string>;
      getIsDev: () => Promise<boolean>;
      openExternal: (url: string) => Promise<void>;
      showOpenDialog: (
        options?: Electron.OpenDialogOptions
      ) => Promise<Electron.OpenDialogReturnValue>;
      onDesktopRuntimeMessage: (
        callback: (event: unknown, data: unknown) => void
      ) => void;
      sendDesktopRuntimeMessage: (channel: string, data: unknown) => void;
      // ASR IPC
      asrTranscribe: (audioFilePath: string) => Promise<{
        text: string;
        duration: number;
        elapsedMs: number;
        rtf: number;
        segments: Array<{ text: string; start: number; end: number }>;
      }>;
      asrStart: () => Promise<{ status: string }>;
      asrHealthcheck: () => Promise<{
        status: string;
        modelPath: string;
        tokensPath: string;
      }>;
      asrStop: () => Promise<{ status: string }>;
      onAsrProgress: (callback: (event: unknown, data: unknown) => void) => void;
    };
  }
}

type AsrMode = "bottle1-local" | "bottle2-cloud-sts";
type TranscribeStage = "idle" | "converting" | "transcribing" | "done" | "error";

interface UploadState {
  selectedFile: File | null;
  asrMode: AsrMode;
  transcribeStage: TranscribeStage;
  progress: number;
  stageLabel: string;
  transcriptionText: string;
  transcriptionSegments: Array<{ text: string; start: number; end: number }>;
  duration: number;
  elapsedMs: number;
  rtf: number;
  errorMessage: string;
}

const INITIAL_STATE: UploadState = {
  selectedFile: null,
  asrMode: "bottle1-local",
  transcribeStage: "idle",
  progress: 0,
  stageLabel: "",
  transcriptionText: "",
  transcriptionSegments: [],
  duration: 0,
  elapsedMs: 0,
  rtf: 0,
  errorMessage: "",
};

export default function DesktopUploadPanel() {
  const [state, setState] = useState<UploadState>(INITIAL_STATE);
  const [authToken, setAuthToken] = useState<string>("");
  const [loginToken, setLoginToken] = useState<string>("");
  const [loggedIn, setLoggedIn] = useState<boolean>(false);
  const [loginError, setLoginError] = useState<string>("");

  // Select file via native dialog
  const handleSelectFile = useCallback(async () => {
    if (!window.electronAPI) return;
    const result = await window.electronAPI.showOpenDialog({
      title: "选择音视频文件",
      filters: [
        { name: "音视频", extensions: ["mp4", "mp3", "wav", "flac", "m4a", "ogg", "avi", "mkv", "mov"] },
        { name: "所有文件", extensions: ["*"] },
      ],
      properties: ["openFile"],
    });
    if (!result.canceled && result.filePaths.length > 0) {
      setState((s) => ({
        ...s,
        selectedFile: { name: result.filePaths[0] } as unknown as File,
        transcriptionText: "",
        transcriptionSegments: [],
        transcribeStage: "idle",
        errorMessage: "",
      }));
    }
  }, []);

  // Start transcription
  const handleTranscribe = useCallback(async () => {
    if (!window.electronAPI || !state.selectedFile) return;

    setState((s) => ({
      ...s,
      transcribeStage: "converting",
      progress: 5,
      stageLabel: "准备中...",
    }));

    try {
      if (state.asrMode === "bottle1-local") {
        // Bottle 1.0: Local ASR via Sherpa-ONNX
        // Start the ASR process first
        await window.electronAPI.asrStart();

        setState((s) => ({ ...s, progress: 10, stageLabel: "音频转换中..." }));

        // The audio file path comes from the selected file's name/path
        // Since we use native dialog, we pass the file path directly
        const filePath = (state.selectedFile as unknown as { name: string }).name;

        setState((s) => ({ ...s, stageLabel: "本地识别中...", progress: 50 }));

        const result = await window.electronAPI.asrTranscribe(filePath);

        setState((s) => ({
          ...s,
          transcribeStage: "done",
          progress: 100,
          stageLabel: "完成",
          transcriptionText: result.text,
          transcriptionSegments: result.segments,
          duration: result.duration,
          elapsedMs: result.elapsedMs,
          rtf: result.rtf,
        }));
      } else {
        // Bottle 2.0: Cloud STS upload (placeholder - TASK-055)
        setState((s) => ({
          ...s,
          transcribeStage: "error",
          errorMessage: "Bottle 2.0 云端直传尚未实现（见 TASK-055）",
        }));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setState((s) => ({
        ...s,
        transcribeStage: "error",
        errorMessage: `识别失败: ${msg}`,
      }));
    }
  }, [state.selectedFile, state.asrMode]);

  // Send transcription to server to create lesson
  const handleSendToServer = useCallback(async () => {
    if (!authToken || !state.transcriptionText || !state.selectedFile) return;

    const filePath = (state.selectedFile as unknown as { name: string }).name;
    const filename = filePath.split(/[\\/]/).pop() || "本地文件";
    const durationSec = state.duration || 0;

    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_BASE_URL}/api/lessons/tasks/local-asr`,
        {method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          asr_model: "sense-voice-local",
          source_filename: filename,
          source_duration_ms: Math.round(durationSec * 1000),
          runtime_kind: "local_desktop",
          asr_payload: {
            text: state.transcriptionText,
            segments: state.transcriptionSegments,
            rtf: state.rtf,
            elapsed_ms: state.elapsedMs,
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || `Server error: ${res.status}`);
      }
      const data = await res.json();
      alert(`课程创建成功！任务ID: ${data.task_id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`发送失败: ${msg}`);
    }
  }, [authToken, state.transcriptionText, state.transcriptionSegments, state.selectedFile, state.duration, state.rtf, state.elapsedMs]);

  // Simple login
  const handleLogin = useCallback(async () => {
    if (!loginToken.trim()) return;
    setLoginError("");
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_BASE_URL}/api/auth/desktop-token-login`,
        {
          method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: loginToken }),
      });
      if (!res.ok) {
        const data = await res.json();
        setLoginError(data.detail || "登录失败");
        return;
      }
      const data = await res.json();
      setAuthToken(data.access_token);
      setLoggedIn(true);
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : String(err));
    }
  }, [loginToken]);

  if (!loggedIn) {
    return (
      <div style={{ padding: "2rem", maxWidth: "400px", margin: "4rem auto" }}>
        <h2>登录 Bottle Desktop</h2>
        <p>请输入您的账户令牌以继续</p>
        <input
          type="text"
          placeholder="Access Token"
          value={loginToken}
          onChange={(e) => setLoginToken(e.target.value)}
          style={{ width: "100%", padding: "0.5rem", marginBottom: "1rem" }}
        />
        {loginError && (
          <p style={{ color: "red", marginBottom: "1rem" }}>{loginError}</p>
        )}
        <button
          onClick={handleLogin}
          style={{
            width: "100%",
            padding: "0.75rem",
            background: "#2563eb",
            color: "white",
            border: "none",
            borderRadius: "0.5rem",
            cursor: "pointer",
          }}
        >
          登录
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: "2rem", maxWidth: "800px", margin: "0 auto" }}>
      <h2>生成课程素材</h2>

      {/* ASR Mode Selector */}
      <div style={{ marginBottom: "1.5rem" }}>
        <label style={{ fontWeight: "bold", marginRight: "1rem" }}>识别方式:</label>
        <label style={{ marginRight: "1.5rem" }}>
          <input
            type="radio"
            name="asrMode"
            value="bottle1-local"
            checked={state.asrMode === "bottle1-local"}
            onChange={() =>
              setState((s) => ({ ...s, asrMode: "bottle1-local" }))
            }
          />
          {" "}Bottle 1.0 (本地识别)
        </label>
        <label>
          <input
            type="radio"
            name="asrMode"
            value="bottle2-cloud-sts"
            checked={state.asrMode === "bottle2-cloud-sts"}
            onChange={() =>
              setState((s) => ({ ...s, asrMode: "bottle2-cloud-sts" }))
            }
          />
          {" "}Bottle 2.0 (云端直传)
        </label>
      </div>

      {/* File Selection */}
      <div style={{ marginBottom: "1.5rem" }}>
        <button
          onClick={handleSelectFile}
          style={{
            padding: "0.75rem 1.5rem",
            background: "#2563eb",
            color: "white",
            border: "none",
            borderRadius: "0.5rem",
            cursor: "pointer",
          }}
        >
          选择本地文件
        </button>
        {state.selectedFile && (
          <span style={{ marginLeft: "1rem" }}>
            已选择: {(state.selectedFile as unknown as { name: string }).name}
          </span>
        )}
      </div>

      {/* Progress Bar */}
      {state.transcribeStage !== "idle" && (
        <div style={{ marginBottom: "1.5rem" }}>
          <div
            style={{
              height: "8px",
              background: "#e5e7eb",
              borderRadius: "4px",
              overflow: "hidden",
              marginBottom: "0.5rem",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${state.progress}%`,
                background: "#2563eb",
                transition: "width 0.3s ease",
              }}
            />
          </div>
          <span style={{ fontSize: "0.875rem", color: "#6b7280" }}>
            {state.stageLabel} {state.progress}%
          </span>
        </div>
      )}

      {/* Transcribe Button */}
      <button
        onClick={handleTranscribe}
        disabled={
          !state.selectedFile ||
          state.transcribeStage === "converting" ||
          state.transcribeStage === "transcribing"
        }
        style={{
          padding: "0.75rem 2rem",
          background:
            !state.selectedFile ||
            state.transcribeStage === "converting" ||
            state.transcribeStage === "transcribing"
              ? "#9ca3af"
              : "#10b981",
          color: "white",
          border: "none",
          borderRadius: "0.5rem",
          cursor:
            !state.selectedFile ||
            state.transcribeStage === "converting" ||
            state.transcribeStage === "transcribing"
              ? "not-allowed"
              : "pointer",
          marginBottom: "1.5rem",
        }}
      >
        {state.transcribeStage === "converting"
          ? "音频转换中..."
          : state.transcribeStage === "transcribing"
          ? "识别中..."
          : "开始识别"}
      </button>

      {/* Error */}
      {state.transcribeStage === "error" && (
        <div
          style={{
            padding: "1rem",
            background: "#fee2e2",
            border: "1px solid #fecaca",
            borderRadius: "0.5rem",
            marginBottom: "1rem",
          }}
        >
          <strong>错误:</strong> {state.errorMessage}
        </div>
      )}

      {/* Transcription Result */}
      {state.transcriptionText && (
        <div style={{ marginTop: "1.5rem" }}>
          <h3>识别结果</h3>
          {state.duration > 0 && (
            <p style={{ fontSize: "0.875rem", color: "#6b7280" }}>
              时长: {state.duration.toFixed(1)}s | 耗时:{" "}
              {(state.elapsedMs / 1000).toFixed(1)}s | RTF: {state.rtf}
            </p>
          )}
          <textarea
            readOnly
            value={state.transcriptionText}
            style={{
              width: "100%",
              minHeight: "200px",
              padding: "0.75rem",
              border: "1px solid #d1d5db",
              borderRadius: "0.5rem",
              fontFamily: "monospace",
              fontSize: "0.875rem",
              resize: "vertical",
            }}
          />
          <button
            onClick={handleSendToServer}
            disabled={!authToken || !state.transcriptionText}
            style={{
              marginTop: "1rem",
              padding: "0.75rem 1.5rem",
              background:
                !authToken || !state.transcriptionText ? "#9ca3af" : "#2563eb",
              color: "white",
              border: "none",
              borderRadius: "0.5rem",
              cursor:
                !authToken || !state.transcriptionText
                  ? "not-allowed"
                  : "pointer",
            }}
          >
            发送到服务器生成课程
          </button>
        </div>
      )}
    </div>
  );
}
