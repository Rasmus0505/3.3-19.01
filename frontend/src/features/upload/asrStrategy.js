export const ASR_EXECUTION_STRATEGIES = Object.freeze({
  BOTTLE1_LOCAL: "bottle1_local",
  BOTTLE1_CLOUD: "bottle1_cloud",
  BOTTLE2_CLOUD: "bottle2_cloud",
});

export const ASR_STRATEGY_CLOUD = ASR_EXECUTION_STRATEGIES.BOTTLE2_CLOUD;

export const ASR_CONNECTIVITY_KINDS = Object.freeze({
  ONLINE: "online",
  OFFLINE: "offline",
  CLOUD_UNAVAILABLE: "cloud_unavailable",
});

function normalizeBoolean(value, fallback = null) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function tryParseJson(text) {
  const rawText = normalizeText(text);
  if (!rawText) return {};
  try {
    const parsed = JSON.parse(rawText);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_) {
    return {};
  }
}

function includesAny(text, patterns = []) {
  const lowered = normalizeText(text).toLowerCase();
  return patterns.some((pattern) => lowered.includes(String(pattern || "").toLowerCase()));
}

export function normalizeDesktopHelperStatus(payload = {}) {
  return {
    ok: Boolean(payload?.ok),
    healthy: Boolean(payload?.healthy),
    modelReady: Boolean(payload?.modelReady ?? payload?.model_ready),
    modelStatus: normalizeText(payload?.modelStatus ?? payload?.model_status, "helper_not_started"),
    helperMode: normalizeText(payload?.helperMode ?? payload?.helper_mode),
    pythonVersion: normalizeText(payload?.pythonVersion ?? payload?.python_version),
    statusCode: Math.max(0, Number(payload?.statusCode ?? payload?.status_code ?? 0)),
    lastCheckedAt: normalizeText(payload?.lastCheckedAt ?? payload?.last_checked_at),
  };
}

export function normalizeServerStatus(payload = {}) {
  return {
    reachable: normalizeBoolean(payload?.reachable),
    lastCheckedAt: normalizeText(payload?.lastCheckedAt ?? payload?.last_checked_at),
    latencyMs: Number.isFinite(Number(payload?.latencyMs ?? payload?.latency_ms)) ? Math.max(0, Number(payload.latencyMs ?? payload.latency_ms)) : null,
    statusCode: Math.max(0, Number(payload?.statusCode ?? payload?.status_code ?? 0)),
    endpoint: normalizeText(payload?.endpoint),
    reason: normalizeText(payload?.reason),
  };
}

export function getConnectivityKind({ browserOnline = true, serverStatus = {} } = {}) {
  if (browserOnline === false) {
    return ASR_CONNECTIVITY_KINDS.OFFLINE;
  }
  if (serverStatus?.reachable === false) {
    return ASR_CONNECTIVITY_KINDS.CLOUD_UNAVAILABLE;
  }
  return ASR_CONNECTIVITY_KINDS.ONLINE;
}

export function getConnectivityBannerText({ browserOnline = true, serverStatus = {} } = {}) {
  const connectivityKind = getConnectivityKind({ browserOnline, serverStatus });
  if (connectivityKind === ASR_CONNECTIVITY_KINDS.OFFLINE) {
    return "离线模式，云端功能不可用";
  }
  if (connectivityKind === ASR_CONNECTIVITY_KINDS.CLOUD_UNAVAILABLE) {
    return "云端服务暂不可用";
  }
  return "";
}

export function getConnectivityActionMessage({ browserOnline = true, serverStatus = {} } = {}) {
  const connectivityKind = getConnectivityKind({ browserOnline, serverStatus });
  if (connectivityKind === ASR_CONNECTIVITY_KINDS.OFFLINE) {
    return "当前网络已断开，请联网后再生成课程。已缓存字幕仍可离线查看。";
  }
  if (connectivityKind === ASR_CONNECTIVITY_KINDS.CLOUD_UNAVAILABLE) {
    return "网络已连接，但云端服务暂不可用，请稍后重试。";
  }
  return "";
}

export function getLocalModeBlockedMessage(reason = "") {
  switch (normalizeText(reason)) {
    case "local_helper_unhealthy":
      return "本机运行当前不可用，请稍后重试或切换到云端。";
    case "local_bundle_missing":
    case "local_model_not_ready":
      return "本机资源未就绪，请先准备。";
    default:
      return "本机模式当前不可用，请稍后重试。";
  }
}

export function getAutoDegradeBannerText(reason = "") {
  switch (normalizeText(reason)) {
    case "local_helper_unhealthy":
      return "本机运行异常，已切换云端";
    case "local_retry_exhausted":
      return "本机识别失败，已切换云端";
    case "local_bundle_missing":
    case "local_model_not_ready":
      return "本机资源未就绪，已切换云端";
    default:
      return "已切换到云端模式";
  }
}

export function isModelCorruptionError(error = {}) {
  const message = String(error?.message || error?.detail || "").toLowerCase();
  const code = String(error?.code || error?.errorCode || "").toLowerCase();
  const searchableText = `${message} ${code}`;

  if (code === "model_corruption" || code === "model_invalid" || code === "model_missing") {
    return true;
  }
  const corruptionIndicators = ["corrupt", "invalid", "missing", "damaged", "broken", "hash mismatch", "checksum failed"];
  const modelIndicators = ["model", "weights", "bin file", "model file", "onnx", "safetensors"];
  const hasCorruption = corruptionIndicators.some((indicator) => searchableText.includes(indicator));
  const hasModelContext = modelIndicators.some((indicator) => searchableText.includes(indicator));
  return hasCorruption && hasModelContext;
}

export function getModelRedownloadGuidance(error = {}) {
  if (isModelCorruptionError(error)) {
    return "模型文件可能损坏，请重新下载后重试。";
  }
  return "生成失败，请重试。";
}

export function resolveAsrStrategy({
  mode = "auto",
  localHelperStatus = {},
  localModelAvailable = false,
  localFailureCount = 0,
} = {}) {
  const normalizedMode = normalizeText(mode, "auto");
  const helperStatus = normalizeDesktopHelperStatus(localHelperStatus);
  if (normalizedMode === "manual_local") {
    return {
      strategy: ASR_EXECUTION_STRATEGIES.BOTTLE1_LOCAL,
      degraded: false,
      reason: "",
      manual: true,
    };
  }
  if (normalizedMode === "manual_bottle1_cloud") {
    return {
      strategy: ASR_EXECUTION_STRATEGIES.BOTTLE1_CLOUD,
      degraded: false,
      reason: "",
      manual: true,
    };
  }
  if (normalizedMode === "manual_bottle2_cloud") {
    return {
      strategy: ASR_EXECUTION_STRATEGIES.BOTTLE2_CLOUD,
      degraded: false,
      reason: "",
      manual: true,
    };
  }
  if (Number(localFailureCount || 0) >= 2) {
    return {
      strategy: ASR_EXECUTION_STRATEGIES.BOTTLE2_CLOUD,
      degraded: true,
      reason: "local_retry_exhausted",
      manual: false,
    };
  }
  if (!localModelAvailable) {
    return {
      strategy: ASR_EXECUTION_STRATEGIES.BOTTLE2_CLOUD,
      degraded: true,
      reason: "local_bundle_missing",
      manual: false,
    };
  }
  if (!helperStatus.healthy) {
    return {
      strategy: ASR_EXECUTION_STRATEGIES.BOTTLE2_CLOUD,
      degraded: true,
      reason: "local_helper_unhealthy",
      manual: false,
    };
  }
  if (!helperStatus.modelReady) {
    return {
      strategy: ASR_EXECUTION_STRATEGIES.BOTTLE2_CLOUD,
      degraded: true,
      reason: "local_model_not_ready",
      manual: false,
    };
  }
  return {
    strategy: ASR_EXECUTION_STRATEGIES.BOTTLE1_LOCAL,
    degraded: false,
    reason: "",
    manual: false,
  };
}

function inferCloudErrorCode({ errorCode = "", message = "", detail = "", browserOnline = true, serverStatus = {} } = {}) {
  const normalizedErrorCode = normalizeText(errorCode).toUpperCase();
  const normalizedMessage = normalizeText(message);
  const normalizedDetail = normalizeText(detail);
  const detailPayload = tryParseJson(normalizedDetail);
  const statusCode = Math.max(
    0,
    Number(
      detailPayload?.status_code ??
        detailPayload?.statusCode ??
        detailPayload?.output?.status_code ??
        0,
    ),
  );
  const detailCode = normalizeText(
    detailPayload?.subtask_code ??
      detailPayload?.first_failure_code ??
      detailPayload?.dashscope_recovery?.first_failure_code ??
      detailPayload?.code ??
      detailPayload?.output?.code,
  ).toUpperCase();
  const detailMessage = normalizeText(
    detailPayload?.subtask_message ??
      detailPayload?.first_failure_message ??
      detailPayload?.dashscope_recovery?.first_failure_message ??
      detailPayload?.message ??
      detailPayload?.output?.message,
  );
  const searchableText = [normalizedErrorCode, detailCode, normalizedMessage, detailMessage, normalizedDetail].join(" ");

  const connectivityKind = getConnectivityKind({ browserOnline, serverStatus });
  if (connectivityKind === ASR_CONNECTIVITY_KINDS.OFFLINE) {
    return "OFFLINE";
  }
  if (connectivityKind === ASR_CONNECTIVITY_KINDS.CLOUD_UNAVAILABLE) {
    return "CLOUD_UNAVAILABLE";
  }
  if (
    normalizedErrorCode === "DASHSCOPE_FILE_ACCESS_FORBIDDEN" ||
    normalizeText(detailPayload?.first_failure_code).toUpperCase() === "FILE_403_FORBIDDEN" ||
    normalizeText(detailPayload?.dashscope_recovery?.first_failure_code).toUpperCase() === "FILE_403_FORBIDDEN" ||
    detailCode === "FILE_403_FORBIDDEN"
  ) {
    return "CLOUD_FILE_ACCESS_FORBIDDEN";
  }
  if (normalizedErrorCode === "INSUFFICIENT_BALANCE" || includesAny(searchableText, ["insufficient balance", "余额不足"])) {
    return "INSUFFICIENT_BALANCE";
  }
  if (normalizedErrorCode === "INVALID_MODEL" || includesAny(searchableText, ["invalid model", "不支持的模型", "模型不可用"])) {
    return "INVALID_MODEL";
  }
  if (normalizedErrorCode === "ASR_API_KEY_MISSING") {
    return "CLOUD_CONFIG_MISSING";
  }
  if (includesAny(searchableText, ["rate limit", "too many requests", "429"])) {
    return "RATE_LIMITED";
  }
  if (
    statusCode === 502 ||
    statusCode === 503 ||
    statusCode === 504 ||
    includesAny(searchableText, ["bad gateway", "service unavailable", "gateway timeout", "502", "503", "504"])
  ) {
    return "SERVICE_UNAVAILABLE";
  }
  if (includesAny(searchableText, ["timeout", "timed out", "etimedout", "network request failed", "econnreset", "connection reset"])) {
    return "NETWORK_TIMEOUT";
  }
  return normalizedErrorCode || detailCode || "CLOUD_ASR_FAILED";
}

export function buildCloudAsrErrorMessage({
  errorCode = "",
  message = "",
  detail = "",
  browserOnline = true,
  serverStatus = {},
} = {}) {
  const normalizedCode = inferCloudErrorCode({ errorCode, message, detail, browserOnline, serverStatus });
  switch (normalizedCode) {
    case "OFFLINE":
      return {
        code: normalizedCode,
        message: "当前网络已断开，请联网后重试。已缓存字幕仍可离线查看。",
      };
    case "CLOUD_UNAVAILABLE":
    case "SERVICE_UNAVAILABLE":
      return {
        code: normalizedCode,
        message: "Bottle 2.0 当前不可用（云端服务暂不可达），请稍后重试或尝试 Bottle 1.0 本机识别。",
      };
    case "RATE_LIMITED":
      return {
        code: normalizedCode,
        message: "Bottle 2.0 当前请求过多，请稍后重试或尝试 Bottle 1.0 本机识别。",
      };
    case "CLOUD_FILE_ACCESS_FORBIDDEN":
      return {
        code: normalizedCode,
        message: "Bottle 2.0 暂时无法访问已上传的云端文件，请稍后重试；若再次失败，再重新上传当前素材。",
      };
    case "INSUFFICIENT_BALANCE":
      return {
        code: normalizedCode,
        message: "Bottle 2.0 账户余额不足，请联系管理员充值或切换到 Bottle 1.0 本机识别。",
      };
    case "NETWORK_TIMEOUT":
      return {
        code: normalizedCode,
        message: "Bottle 2.0 网络连接超时，请检查网络后重试，或改用 Bottle 1.0 本机识别。",
      };
    case "INVALID_MODEL":
      return {
        code: normalizedCode,
        message: "Bottle 2.0 模型当前不可用，请稍后重试或切换到 Bottle 1.0 本机识别。",
      };
    case "CLOUD_CONFIG_MISSING":
      return {
        code: normalizedCode,
        message: "Bottle 2.0 当前未正确配置，请联系管理员检查云端服务。",
      };
    default:
      return {
        code: normalizedCode,
        message: "Bottle 2.0 当前不可用，请稍后重试或尝试 Bottle 1.0 本机识别。",
      };
  }
}

export function mapCloudAsrFailureToMessage(errorLike = "", serverStatus = {}) {
  const normalizedErrorLike =
    errorLike && typeof errorLike === "object"
      ? {
          errorCode: errorLike?.error_code ?? errorLike?.errorCode ?? errorLike?.code ?? "",
          message: errorLike?.message ?? "",
          detail:
            typeof errorLike?.detail === "string"
              ? errorLike.detail
              : errorLike?.detail && typeof errorLike.detail === "object"
                ? JSON.stringify(errorLike.detail)
                : "",
        }
      : {
          message: errorLike,
        };
  return buildCloudAsrErrorMessage({
    errorCode: normalizedErrorLike.errorCode,
    message: normalizedErrorLike.message,
    detail: normalizedErrorLike.detail,
    serverStatus,
    browserOnline: typeof navigator === "undefined" ? true : navigator.onLine !== false,
  }).message;
}
