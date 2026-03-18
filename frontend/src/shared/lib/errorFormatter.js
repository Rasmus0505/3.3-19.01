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

function buildHealthSnapshotRows(snapshot = {}) {
  const runtimeStatus = snapshot?.ready?.data?.status || {};
  const rows = [
    {
      item: "/health",
      status: snapshot?.health?.status || "-",
      detail: snapshot?.health?.data?.service || "-",
    },
    {
      item: "/health/ready",
      status: snapshot?.ready?.ok ? "已就绪" : "未就绪",
      detail: runtimeStatus?.db_error || "数据库与关键字段检查通过",
    },
    {
      item: "管理员初始化",
      status: runtimeStatus?.admin_bootstrap_ok ? "成功" : "失败",
      detail: runtimeStatus?.admin_bootstrap_error || "管理员账号初始化正常",
    },
    {
      item: "DASHSCOPE_API_KEY",
      status: runtimeStatus?.dashscope_configured ? "已配置" : "缺失",
      detail: "缺失会影响转写和翻译调用",
    },
    {
      item: "ffmpeg / ffprobe",
      status: runtimeStatus?.ffmpeg_ready && runtimeStatus?.ffprobe_ready ? "已就绪" : "异常",
      detail: runtimeStatus?.media_detail || "-",
    },
    {
      item: "最近检查时间",
      status: runtimeStatus?.checked_at ? "已记录" : "未记录",
      detail: formatDateTimeBeijing(runtimeStatus?.checked_at) || "-",
    },
  ];

  return rows
    .map((row) => [row.item, row.status, row.detail].join(" | "))
    .join("\n");
}

function collectHealthIssues(snapshot = {}) {
  const runtimeStatus = snapshot?.ready?.data?.status || {};
  const issues = [];

  if (!snapshot?.health?.ok) {
    issues.push(`/health 返回 ${snapshot?.health?.status || "-"}，服务基础存活检查异常。`);
  }
  if (!snapshot?.ready?.ok || runtimeStatus?.db_ready === false) {
    issues.push(`数据库未就绪：${runtimeStatus?.db_error || "请检查迁移、数据库连接和业务表是否完整。"}`);
  }
  if (!runtimeStatus?.admin_bootstrap_ok) {
    issues.push(`管理员初始化异常：${runtimeStatus?.admin_bootstrap_error || "请检查 ADMIN_EMAILS 与管理员初始化流程。"}`);
  }
  if (!runtimeStatus?.dashscope_configured) {
    issues.push("DASHSCOPE_API_KEY 缺失。");
  }
  if (!runtimeStatus?.ffmpeg_ready || !runtimeStatus?.ffprobe_ready) {
    issues.push(`媒体依赖异常：${runtimeStatus?.media_detail || "ffmpeg / ffprobe 未正常就绪。"}`);
  }

  return issues;
}

function buildZeaburHealthPrompt(snapshot = {}) {
  const runtimeStatus = snapshot?.ready?.data?.status || {};
  return [
    "请你作为 Zeabur AI，按最少步骤帮我排查这个服务。",
    "目标：先判断是不是部署、环境变量、数据库连接或迁移问题，不讨论无关改造。",
    "请按下面顺序输出：",
    "1. 先根据接口状态快照判断最可能的问题层：服务 / 数据库 / 环境变量 / 媒体依赖。",
    "2. 明确告诉我去 Zeabur 看哪个服务日志、看哪几个环境变量。",
    "3. 如果判断是数据库或迁移问题，请直接告诉我是否需要执行 `python -m alembic -c alembic.ini upgrade head`。",
    "4. 如果判断是环境变量问题，只列出需要补的项，不要展开讲运维理论。",
    "",
    `当前数据库状态：${runtimeStatus?.db_error || "未发现数据库阻断异常"}`,
    `当前管理员初始化状态：${runtimeStatus?.admin_bootstrap_error || "管理员初始化正常"}`,
    `当前媒体依赖状态：${runtimeStatus?.media_detail || "未发现媒体依赖异常"}`,
  ].join("\n");
}

function buildDeveloperHealthPrompt(snapshot = {}) {
  const issues = collectHealthIssues(snapshot);
  return [
    "请你作为这个仓库的编程 AI，基于下面的系统健康快照给出最小修复方案。",
    "要求：",
    "1. 先判断问题更像是代码回归、迁移缺失、环境变量缺失还是依赖缺失。",
    "2. 如果需要改代码，只给最小必要修改，不要改现有 API 契约。",
    "3. 不要吞掉原始错误信息。",
    "4. 明确列出改完后要怎么验证。",
    "",
    `当前判断：${issues.length ? issues.join("；") : "当前未发现阻断性问题，请只做最小分析。"}`,
  ].join("\n");
}

export function buildAdminHealthCopyText({ snapshot = {}, audience = "developer" } = {}) {
  const runtimeStatus = snapshot?.ready?.data?.status || {};
  const issues = collectHealthIssues(snapshot);
  const prompt = audience === "zeabur" ? buildZeaburHealthPrompt(snapshot) : buildDeveloperHealthPrompt(snapshot);
  const audienceLabel = audience === "zeabur" ? "可直接发给 Zeabur AI 的提示词" : "可直接发给编程 AI 的提示词";
  const sections = [
    ["页面", "系统健康"],
    ["检查时间", formatDateTimeBeijing(runtimeStatus?.checked_at || new Date().toISOString())],
    ["当前判断", issues.length ? issues.join("\n") : "当前未发现阻断性问题"],
    ["接口状态快照", buildHealthSnapshotRows(snapshot)],
    ["/health 响应体", stringifyValue(snapshot?.health?.data)],
    ["/health/ready 响应体", stringifyValue(snapshot?.ready?.data)],
    [audienceLabel, prompt],
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
