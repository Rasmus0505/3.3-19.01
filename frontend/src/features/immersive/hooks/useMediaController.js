// 沉浸式学习媒体控制 Hook
// 管理媒体加载、播放状态和错误处理

import { useCallback, useEffect, useRef, useState } from "react";
import { getLessonMedia } from "../../../shared/media/localMediaStore";
import { api } from "../../../shared/api/client";
import { getMediaExt, isAudioFilename } from "../tokenNormalize";

const MEDIA_TYPE_BY_EXTENSION = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
  ".avi": "video/x-msvideo",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".flac": "audio/flac",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg; codecs=opus",
};

function resolveMediaModeFromFileName(fileName) {
  if (isAudioFilename(fileName)) {
    return "audio";
  }
  return "video";
}

function inferMediaModeFromContentType(contentType) {
  const normalized = String(contentType || "").toLowerCase();
  if (normalized.startsWith("video/")) {
    return "video";
  }
  if (normalized.startsWith("audio/")) {
    return "audio";
  }
  return "";
}

function inferMediaTypeFromFileName(fileName) {
  const ext = getMediaExt(fileName);
  return MEDIA_TYPE_BY_EXTENSION[ext] || "";
}

function resolveMediaModeByTypeAndName(mediaType, fileName) {
  const byType = inferMediaModeFromContentType(mediaType);
  if (byType) {
    return byType;
  }
  return resolveMediaModeFromFileName(fileName);
}

async function readErrorPayload(resp) {
  try {
    return await resp.clone().json();
  } catch (_) {
    return {};
  }
}

const LOCAL_MEDIA_REQUIRED_CODE = "LOCAL_MEDIA_REQUIRED";

function isLocalMediaRequiredPayload(resp, payload) {
  return Number(resp?.status) === 409 && String(payload?.error_code || "").trim() === LOCAL_MEDIA_REQUIRED_CODE;
}

function formatMediaLoadError(resp, payload) {
  const statusText = Number(resp?.status) > 0 ? String(resp.status) : "";
  const errorCode = String(payload?.error_code || "").trim();
  const message = String(payload?.message || "").trim();
  const head = [statusText, errorCode].filter(Boolean).join(" ");
  if (head && message) {
    return `媒体加载失败（${head}: ${message}）。`;
  }
  if (head) {
    return `媒体加载失败（${head}）。`;
  }
  if (message) {
    return `媒体加载失败（${message}）。`;
  }
  return "媒体加载失败。";
}

export function useMediaController({
  lesson,
  accessToken,
  apiClient: externalApiClient,
  externalMediaReloadToken = 0,
  immersiveActive,
  onMediaReadyChange,
  onNeedsBindingChange,
  onMediaErrorChange,
  onPhaseChange,
}) {
  const [mediaMode, setMediaMode] = useState("video");
  const [mediaBlobUrl, setMediaBlobUrl] = useState("");
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaReady, setMediaReady] = useState(false);
  const [mediaError, setMediaError] = useState("");
  const [needsBinding, setNeedsBinding] = useState(false);
  const [bindingBusy, setBindingBusy] = useState(false);
  const [bindingError, setBindingError] = useState("");
  const [bindingHint, setBindingHint] = useState("");
  const [mediaReloadKey, setMediaReloadKey] = useState(0);

  const mediaElementRef = useRef(null);
  const clipAudioRef = useRef(null);

  const effectiveApiClient = externalApiClient || api;

  const handleMainMediaError = useCallback(() => {
    const hasClipFallback =
      lesson?.media_storage === "server" &&
      Array.isArray(lesson?.sentences) &&
      lesson.sentences.some((item) => item?.audio_url);
    if (hasClipFallback) {
      setMediaMode("clip");
      setMediaError("当前浏览器不支持该媒体格式，已自动切换为句级音频模式。");
      onPhaseChange?.(immersiveActive ? "auto_play_pending" : "idle");
      return;
    }
    setMediaBlobUrl("");
    setNeedsBinding(true);
    setMediaError("当前媒体格式无法播放，请先在历史记录中恢复视频。");
    onNeedsBindingChange?.(true);
    onPhaseChange?.("typing");
  }, [immersiveActive, lesson?.media_storage, lesson?.sentences, onNeedsBindingChange, onPhaseChange]);

  // Media loading effect
  useEffect(() => {
    if (!lesson) return;
    let canceled = false;
    let objectUrl = "";

    async function loadMediaBlob() {
      setMediaLoading(true);
      setMediaReady(false);
      setMediaError("");
      onPhaseChange?.("idle");
      setNeedsBinding(false);
      try {
        const localMedia = await getLessonMedia(lesson.id);
        if (canceled) return;
        if (localMedia?.blob) {
          objectUrl = URL.createObjectURL(localMedia.blob);
          const localMediaType = String(
            localMedia.media_type || inferMediaTypeFromFileName(localMedia.file_name || lesson.source_filename || "")
          );
          setMediaMode(resolveMediaModeByTypeAndName(localMediaType, localMedia.file_name || lesson.source_filename || ""));
          setMediaBlobUrl(objectUrl);
          setMediaLoading(false);
          return;
        }
      } catch (error) {
        // Ignore local media read errors and fallback to server media loading.
      }

      if (lesson.media_storage !== "server") {
        if (canceled) return;
        setMediaBlobUrl("");
        setNeedsBinding(true);
        onNeedsBindingChange?.(true);
        setBindingHint("");
        setMediaError("当前课程媒体仅保存在浏览器本地，请先在历史记录中恢复视频。");
        setMediaLoading(false);
        return;
      }

      try {
        const resp = await effectiveApiClient(`/api/lessons/${lesson.id}/media`, {}, accessToken);
        if (!resp.ok || canceled) {
          if (canceled) return;
          const payload = await readErrorPayload(resp);
          if (canceled) return;
          setMediaBlobUrl("");
          if (isLocalMediaRequiredPayload(resp, payload) || Number(resp.status) === 404) {
            setNeedsBinding(true);
            onNeedsBindingChange?.(true);
            setMediaError("服务器媒体不可用，请先在历史记录中恢复视频。");
          } else {
            setNeedsBinding(true);
            onNeedsBindingChange?.(true);
            setMediaError(`${formatMediaLoadError(resp, payload)} 请先在历史记录中恢复视频。`);
          }
          return;
        }

        const rawContentType = String(resp.headers.get("content-type") || "").toLowerCase();
        let blob = await resp.blob();
        const fallbackType = inferMediaTypeFromFileName(lesson?.source_filename || "");
        const needsTypeOverride =
          (!rawContentType || rawContentType.startsWith("application/octet-stream")) && Boolean(fallbackType);
        if (needsTypeOverride) {
          blob = new Blob([blob], { type: fallbackType });
        }
        objectUrl = URL.createObjectURL(blob);
        if (canceled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        setMediaMode(resolveMediaModeByTypeAndName(blob.type || rawContentType, lesson?.source_filename || ""));
        setMediaBlobUrl(objectUrl);
        setBindingHint("");
        setMediaLoading(false);
      } catch (error) {
        if (canceled) return;
        const detail = String(error || "").trim();
        setMediaBlobUrl("");
        setNeedsBinding(true);
        onNeedsBindingChange?.(true);
        setMediaError(
          detail
            ? `媒体加载异常（${detail}），请先在历史记录中恢复视频。`
            : "媒体加载异常，请先在历史记录中恢复视频。"
        );
      } finally {
        if (!canceled) {
          setMediaLoading(false);
        }
      }
    }

    loadMediaBlob();

    return () => {
      canceled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [
    accessToken,
    effectiveApiClient,
    externalMediaReloadToken,
    lesson?.id,
    lesson?.media_storage,
    lesson?.source_filename,
    mediaReloadKey,
    onNeedsBindingChange,
    onPhaseChange,
  ]);

  // Notify parent of state changes
  useEffect(() => {
    onMediaReadyChange?.(mediaReady);
  }, [mediaReady, onMediaReadyChange]);

  useEffect(() => {
    onNeedsBindingChange?.(needsBinding);
  }, [needsBinding, onNeedsBindingChange]);

  useEffect(() => {
    onMediaErrorChange?.(mediaError);
  }, [mediaError, onMediaErrorChange]);

  return {
    // State
    mediaMode,
    setMediaMode,
    mediaBlobUrl,
    setMediaBlobUrl,
    mediaLoading,
    setMediaLoading,
    mediaReady,
    setMediaReady,
    mediaError,
    setMediaError,
    needsBinding,
    setNeedsBinding,
    bindingBusy,
    setBindingBusy,
    bindingError,
    setBindingError,
    bindingHint,
    setBindingHint,
    mediaReloadKey,
    setMediaReloadKey,
    // Refs
    mediaElementRef,
    clipAudioRef,
    // Handlers
    handleMainMediaError,
  };
}


