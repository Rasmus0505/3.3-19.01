export function readIntParam(searchParams, key, fallback, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = String(searchParams.get(key) || "").trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  const value = Math.trunc(parsed);
  if (value < min || value > max) return fallback;
  return value;
}

export function readStringParam(searchParams, key, fallback = "") {
  const raw = searchParams.get(key);
  return raw == null ? fallback : String(raw);
}

export function buildSearchParams(entries) {
  const searchParams = new URLSearchParams();
  Object.entries(entries).forEach(([key, value]) => {
    if (value == null) return;
    const normalized = typeof value === "string" ? value.trim() : String(value);
    if (!normalized || normalized === "all") return;
    searchParams.set(key, normalized);
  });
  return searchParams;
}

export function mergeSearchParams(currentSearchParams, entries) {
  const searchParams = new URLSearchParams(currentSearchParams);
  Object.entries(entries).forEach(([key, value]) => {
    if (value == null) {
      searchParams.delete(key);
      return;
    }
    const normalized = typeof value === "string" ? value.trim() : String(value);
    if (!normalized || normalized === "all") {
      searchParams.delete(key);
      return;
    }
    searchParams.set(key, normalized);
  });
  return searchParams;
}

export const ADMIN_NAV_ITEMS = [
  {
    key: "health",
    label: "系统健康",
    description: "查看诊断卡、失败任务和后台异常。",
    href: "/admin/health",
  },
  {
    key: "users",
    label: "用户活跃",
    description: "查看活跃趋势、用户列表和余额流水。",
    href: "/admin/users",
  },
  {
    key: "models",
    label: "模型管理",
    description: "维护模型参数、默认 ASR 和字幕策略。",
    href: "/admin/models",
  },
  {
    key: "redeem",
    label: "活动兑换",
    description: "管理批次、兑换码和兑换审计。",
    href: "/admin/redeem",
  },
];

export function getAdminNavItemByKey(key) {
  return ADMIN_NAV_ITEMS.find((item) => item.key === key) || ADMIN_NAV_ITEMS[0];
}

function resolveLegacyMonitoringNavKey(requestedTab, requestedPanel) {
  const panel = String(requestedPanel || "").trim().toLowerCase();
  const tab = String(requestedTab || "").trim().toLowerCase();
  if (["subtitle-policy", "rates"].includes(panel) || ["subtitle-policy", "rates"].includes(tab)) {
    return "models";
  }
  return "health";
}

function resolveLegacyBusinessNavKey(requestedTab, requestedPanel) {
  const panel = String(requestedPanel || "").trim().toLowerCase();
  const tab = String(requestedTab || "").trim().toLowerCase();
  if (panel === "rates") return "models";
  if (["redeem", "batches", "codes", "audit"].includes(panel) || ["redeem", "batches", "codes", "audit"].includes(tab)) {
    return "redeem";
  }
  return "users";
}

export function resolveAdminNavKey(pathname, searchValue = "") {
  const searchParams = searchValue instanceof URLSearchParams ? searchValue : new URLSearchParams(searchValue);
  const requestedTab = readStringParam(searchParams, "tab");
  const requestedPanel = readStringParam(searchParams, "panel");

  if (pathname.startsWith("/admin/health")) return "health";
  if (pathname.startsWith("/admin/users") || pathname.startsWith("/admin/logs")) return "users";
  if (pathname.startsWith("/admin/models") || pathname.startsWith("/admin/rates") || pathname.startsWith("/admin/subtitle-settings")) return "models";
  if (pathname.startsWith("/admin/redeem")) return "redeem";

  if (pathname.startsWith("/admin/monitoring") || pathname.startsWith("/admin/pipeline") || pathname.startsWith("/admin/ops")) {
    return resolveLegacyMonitoringNavKey(requestedTab, requestedPanel);
  }

  if (pathname.startsWith("/admin/business")) {
    return resolveLegacyBusinessNavKey(requestedTab, requestedPanel);
  }

  if (pathname.startsWith("/admin/overview") || pathname.startsWith("/admin/system") || pathname.startsWith("/admin/lesson-task-logs")) {
    return "health";
  }

  if (pathname.startsWith("/admin/translation-logs") || pathname.startsWith("/admin/operation-logs") || pathname.startsWith("/admin/sql-console")) {
    return "health";
  }

  if (pathname.startsWith("/admin/redeem-batches") || pathname.startsWith("/admin/redeem-codes") || pathname.startsWith("/admin/redeem-audit")) {
    return "redeem";
  }

  return "health";
}

export function resolveAdminNavItem(pathname, searchValue = "") {
  return getAdminNavItemByKey(resolveAdminNavKey(pathname, searchValue));
}

export async function copyCurrentUrl() {
  const href = window.location.href;
  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(href);
    return href;
  }
  const textarea = document.createElement("textarea");
  textarea.value = href;
  textarea.setAttribute("readonly", "readonly");
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
  return href;
}
