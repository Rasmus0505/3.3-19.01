import { formatDateTimeBeijing } from "./datetime";

let activeAdminError = null;

function safeClone(value) {
  if (value == null) return null;
  if (typeof value === "string") return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_) {
    return String(value);
  }
}

function normalizeDetails(details, fallbackSource) {
  if (details != null) return safeClone(details);
  if (fallbackSource?.responseBody != null) return safeClone(fallbackSource.responseBody);
  return null;
}

function normalizeMessage(source, fallback) {
  if (source?.message) return String(source.message);
  if (source?.data?.message) return String(source.data.message);
  if (source?.error?.message) return String(source.error.message);
  return fallback || "操作失败，请重试";
}

function normalizeCode(source) {
  if (source?.code) return String(source.code);
  if (source?.data?.error_code) return String(source.data.error_code);
  if (source?.status) return `HTTP_${source.status}`;
  if (source?.kind === "network") return "NETWORK_ERROR";
  return "UNKNOWN_ERROR";
}

function normalizeStatus(source) {
  if (!Number.isFinite(Number(source?.status))) return null;
  return Number(source.status);
}

export async function parseJsonSafely(response) {
  try {
    return await response.json();
  } catch (_) {
    return {};
  }
}

export function formatError(source, context = {}) {
  const responseBody = source?.responseBody ?? source?.data ?? null;
  const error = {
    code: normalizeCode(source),
    message: normalizeMessage(source, context.fallbackMessage),
    details: normalizeDetails(source?.details ?? source?.data?.details, { responseBody }),
    timestamp: new Date().toISOString(),
    status: normalizeStatus(source),
    statusText: source?.statusText ? String(source.statusText) : null,
    context: {
      component: context.component || null,
      action: context.action || null,
      endpoint: context.endpoint || null,
      method: context.method || null,
      meta: safeClone(context.meta) || null,
    },
    request: {
      url: window.location.href,
      userAgent: navigator.userAgent,
    },
    responseBody: safeClone(responseBody),
    stack: source?.error?.stack || source?.stack || null,
    copyable: true,
  };
  return {
    ...error,
    displayMessage: `${error.code}: ${error.message}`,
  };
}

export function formatResponseError(response, data, context = {}) {
  return formatError(
    {
      code: data?.error_code,
      message: data?.message,
      details: data?.details,
      data,
      status: response?.status,
      statusText: response?.statusText,
      responseBody: data,
    },
    context,
  );
}

export function formatNetworkError(error, context = {}) {
  return formatError(
    {
      code: "NETWORK_ERROR",
      message: `网络错误: ${String(error)}`,
      details: error?.message || String(error),
      error,
      kind: "network",
    },
    context,
  );
}

export function getErrorMessage(error) {
  if (!error) return "";
  return error.displayMessage || `${error.code || "UNKNOWN_ERROR"}: ${error.message || "操作失败，请重试"}`;
}

export function setActiveAdminError(error) {
  activeAdminError = error || null;
}

export function getActiveAdminError() {
  return activeAdminError;
}

function stringifyValue(value) {
  if (value == null || value === "") return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch (_) {
    return String(value);
  }
}

export function buildErrorCopyText(error) {
  const lines = [
    ["时间", formatDateTimeBeijing(error?.timestamp)],
    ["错误代码", error?.code],
    ["错误信息", error?.message],
    ["HTTP 状态", error?.status ? `${error.status}${error?.statusText ? ` ${error.statusText}` : ""}` : ""],
    ["详细信息", stringifyValue(error?.details)],
    ["组件上下文", stringifyValue(error?.context)],
    ["页面 URL", error?.request?.url],
    ["用户代理", error?.request?.userAgent],
    ["响应体", stringifyValue(error?.responseBody)],
    ["错误堆栈", error?.stack],
  ];
  return lines
    .filter(([, value]) => value)
    .map(([label, value]) => `${label}: ${value}`)
    .join("\n");
}

export function buildAdminIssueCopyText(issue = {}) {
  const sections = [
    ["问题标题", issue.title],
    ["问题等级", issue.severity],
    ["问题摘要", issue.summary],
    ["影响范围", issue.impact],
    ["关键状态", Array.isArray(issue.statusLines) ? issue.statusLines.filter(Boolean).join("\n") : issue.statusLines],
    ["关键日志", stringifyValue(issue.logs)],
    ["接口快照", stringifyValue(issue.endpointSnapshot)],
    [
      "Zeabur 排查提示",
      Array.isArray(issue.zeaburHints)
        ? issue.zeaburHints.filter(Boolean).map((item, index) => `${index + 1}. ${item}`).join("\n")
        : issue.zeaburHints,
    ],
    ["可直接发给开发 AI 的提示词", issue.prompt],
  ];

  return sections
    .filter(([, value]) => value)
    .map(([label, value]) => `${label}:\n${value}`)
    .join("\n\n");
}

export async function copyTextToClipboard(text) {
  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "readonly");
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

export async function copyErrorToClipboard(error = activeAdminError) {
  if (!error) {
    throw new Error("暂无可复制的错误信息");
  }
  setActiveAdminError(error);
  await copyTextToClipboard(buildErrorCopyText(error));
}
