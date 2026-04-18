import { api, createApiClient, parseResponse, toErrorText } from "../../shared/api/client";
import {
  FAST_RUNTIME_TRACK_BROWSER_LOCAL,
  FAST_RUNTIME_TRACK_CLOUD,
  FAST_RUNTIME_TRACK_DESKTOP_LOCAL,
  FASTER_WHISPER_MODEL,
  LOCAL_BROWSER_RUNTIME_BASE_URL,
} from "./uploadConstants";

export const browserLocalRuntimeApi = LOCAL_BROWSER_RUNTIME_BASE_URL
  ? createApiClient({ baseUrl: LOCAL_BROWSER_RUNTIME_BASE_URL })
  : null;

export function hasLocalCourseGeneratorBridge() {
  return typeof window !== "undefined" && typeof window.localAsr?.generateCourse === "function";
}

export function hasBrowserLocalRuntimeBridge() {
  return Boolean(browserLocalRuntimeApi);
}

export function hasNativeDesktopModelUpdateBridge() {
  return (
    typeof window !== "undefined" &&
    typeof window.desktopRuntime?.getModelUpdateStatus === "function" &&
    typeof window.desktopRuntime?.checkModelUpdate === "function" &&
    typeof window.desktopRuntime?.startModelUpdate === "function" &&
    typeof window.desktopRuntime?.cancelModelUpdate === "function"
  );
}

export function desktopModelUpdateSupported() {
  return hasNativeDesktopModelUpdateBridge();
}

export function normalizeDesktopBundledModelSummary(payload = {}, modelKey = FASTER_WHISPER_MODEL) {
  const normalizedModelKey = String(payload?.model_key || modelKey || FASTER_WHISPER_MODEL).trim() || FASTER_WHISPER_MODEL;
  const available = Boolean(payload?.available);
  const installAvailable = Boolean(payload?.install_available);
  const sourceAvailable = Boolean(payload?.source_available);
  const preinstalled = Boolean(payload?.preinstalled);
  const runtimeSource = String(payload?.runtime_source || "").trim() || "user_data";
  const message = available
    ? "Bottle 1.0 is ready on this desktop client."
    : installAvailable
      ? "Bottle 1.0 can be prepared from this desktop client."
      : "This installer does not contain a reusable Bottle 1.0 local bundle.";
  return {
    modelKey: normalizedModelKey,
    available,
    installAvailable,
    sourceAvailable,
    preinstalled,
    runtimeSource,
    installSelected: typeof payload?.install_selected === "boolean" ? payload.install_selected : null,
    installChoice: String(payload?.install_choice || "").trim(),
    sourceBundleDir: String(payload?.source_bundle_dir || ""),
    targetBundleDir: String(payload?.bundle_dir || ""),
    fileCount: Number(payload?.file_count || 0),
    message,
  };
}

export function hasDesktopFileReadBridge() {
  return typeof window !== "undefined" && typeof window.desktopRuntime?.readLocalMediaFile === "function";
}

export function hasDesktopRuntimeBridge() {
  return typeof window !== "undefined" && typeof window.desktopRuntime?.requestLocalHelper === "function";
}

export function hasDesktopModelUpdateBridge() {
  return desktopModelUpdateSupported();
}

export function decodeBase64Bytes(base64Text) {
  const safeText = String(base64Text || "").trim();
  if (!safeText || typeof atob !== "function") {
    return new Uint8Array();
  }
  const decoded = atob(safeText);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return bytes;
}

export async function requestDesktopLocalHelper(pathname, responseType = "json", options = {}) {
  if (!hasDesktopRuntimeBridge()) {
    throw new Error("Desktop local helper is unavailable");
  }
  const response = await window.desktopRuntime.requestLocalHelper({
    path: String(pathname || ""),
    method: String(options.method || "GET").toUpperCase(),
    responseType,
    body: options.body,
  });
  if (!response?.ok) {
    const detail =
      String(response?.data?.message || "").trim() ||
      String(response?.data?.error_message || "").trim() ||
      String(response?.data?.detail || "").trim() ||
      String(response?.status || "").trim();
    throw new Error(detail || "Desktop local helper request failed");
  }
  return response;
}

export async function getDesktopBundledAsrModelSummary(modelKey) {
  if (!hasDesktopRuntimeBridge()) {
    throw new Error("Desktop local helper is unavailable");
  }
  const helperModelKey = encodeURIComponent(String(modelKey || FASTER_WHISPER_MODEL).trim() || FASTER_WHISPER_MODEL);
  const response = await requestDesktopLocalHelper(`/api/local-asr-assets/download-models/${helperModelKey}`, "json");
  return normalizeDesktopBundledModelSummary(response?.data, modelKey);
}

export async function installDesktopBundledAsrModel(modelKey) {
  if (!hasDesktopRuntimeBridge()) {
    throw new Error("Desktop local helper is unavailable");
  }
  const helperModelKey = encodeURIComponent(String(modelKey || FASTER_WHISPER_MODEL).trim() || FASTER_WHISPER_MODEL);
  const response = await requestDesktopLocalHelper(
    `/api/local-asr-assets/download-models/${helperModelKey}/install`,
    "json",
    { method: "POST" },
  );
  return normalizeDesktopBundledModelSummary(response?.data, modelKey);
}

export async function checkDesktopModelUpdate(modelKey) {
  if (!hasNativeDesktopModelUpdateBridge()) {
    throw new Error("Desktop model update bridge is unavailable");
  }
  return window.desktopRuntime.checkModelUpdate(String(modelKey || FASTER_WHISPER_MODEL).trim() || FASTER_WHISPER_MODEL);
}

export async function startDesktopModelUpdate(modelKey) {
  if (!hasNativeDesktopModelUpdateBridge()) {
    throw new Error("Desktop model update bridge is unavailable");
  }
  return window.desktopRuntime.startModelUpdate(String(modelKey || FASTER_WHISPER_MODEL).trim() || FASTER_WHISPER_MODEL);
}

export async function cancelDesktopModelUpdate() {
  if (!hasNativeDesktopModelUpdateBridge()) {
    throw new Error("Desktop model update bridge is unavailable");
  }
  return window.desktopRuntime.cancelModelUpdate();
}

export function onDesktopModelUpdateProgress(callback) {
  if (!hasNativeDesktopModelUpdateBridge() || typeof window.desktopRuntime?.onModelUpdateProgress !== "function") {
    return () => {};
  }
  return window.desktopRuntime.onModelUpdateProgress((payload) => {
    callback?.(payload || {});
  });
}

export function logUploadLocalAsrDebug(message, extra = {}) {
  if (typeof console === "undefined" || typeof console.debug !== "function") return;
  console.debug("[DEBUG] upload.local_asr", message, extra);
}

export async function prepareAudioDataForLocalAsr() {
  throw new Error("浏览器本地 ASR 已下线，请改用桌面端 Bottle 1.0 或网页端 Bottle 2.0。");
}

export async function runLocalAsrWithAutoParallelism() {
  throw new Error("浏览器本地 ASR 已下线，请改用桌面端 Bottle 1.0 或网页端 Bottle 2.0。");
}

export async function requestWalletBalance(accessToken = "") {
  const response = await api("/api/wallet/balance", { method: "GET" }, accessToken);
  const payload = await parseResponse(response);
  if (!response.ok) {
    throw new Error(toErrorText(payload, "读取余额失败"));
  }
  return {
    ok: payload?.ok !== false,
    balanceAmountCents: Math.max(0, Number(payload?.balance_amount_cents ?? payload?.balance ?? 0)),
    currency: String(payload?.currency || "CNY").trim() || "CNY",
    updatedAt: String(payload?.updated_at || "").trim(),
  };
}

export async function reportLocalGenerationUsage(accessToken = "", payload = {}) {
  const response = await api(
    "/api/wallet/consume",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {}),
    },
    accessToken,
  );
  const data = await parseResponse(response);
  if (!response.ok) {
    throw new Error(toErrorText(data, "上报本地生成用量失败"));
  }
  return data;
}

export function getDefaultFasterWhisperRuntimeTrack({ isMobileViewport = false } = {}) {
  if (hasDesktopRuntimeBridge()) {
    return FAST_RUNTIME_TRACK_DESKTOP_LOCAL;
  }
  if (hasBrowserLocalRuntimeBridge() && !isMobileViewport) {
    return FAST_RUNTIME_TRACK_BROWSER_LOCAL;
  }
  return FAST_RUNTIME_TRACK_CLOUD;
}


