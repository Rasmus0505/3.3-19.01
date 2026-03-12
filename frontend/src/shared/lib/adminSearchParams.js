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

const MONITORING_TAB_TO_NAV_KEY = {
  health: "health",
  overview: "health",
  system: "health",
  tasks: "tasks",
  "task-failures": "tasks",
  translations: "tasks",
  operations: "operations",
  "sql-console": "operations",
  "subtitle-policy": "operations",
};

const BUSINESS_TAB_TO_NAV_KEY = {
  users: "users",
  list: "users",
  wallet: "users",
  rates: "users",
  redeem: "redeem",
  batches: "redeem",
  codes: "redeem",
  audit: "redeem",
};

export const ADMIN_NAV_ITEMS = [
  {
    key: "health",
    label: "系统健康",
    description: "查看总览与系统检查。",
    href: "/admin/monitoring?tab=health&panel=overview",
  },
  {
    key: "tasks",
    label: "任务监控",
    description: "查看生成失败与翻译记录。",
    href: "/admin/monitoring?tab=tasks&panel=task-failures",
  },
  {
    key: "operations",
    label: "操作审计",
    description: "查看审计、SQL 控台与策略配置。",
    href: "/admin/monitoring?tab=operations&panel=operations",
  },
  {
    key: "users",
    label: "用户计费",
    description: "查看用户、流水与计费配置。",
    href: "/admin/business?tab=users&panel=list",
  },
  {
    key: "redeem",
    label: "活动管理",
    description: "查看批次、兑换码与兑换审计。",
    href: "/admin/business?tab=redeem&panel=batches",
  },
];

export function getAdminNavItemByKey(key) {
  return ADMIN_NAV_ITEMS.find((item) => item.key === key) || ADMIN_NAV_ITEMS[0];
}

export function resolveAdminNavKey(pathname, searchValue = "") {
  const searchParams = searchValue instanceof URLSearchParams ? searchValue : new URLSearchParams(searchValue);
  const requestedTab = readStringParam(searchParams, "tab");

  if (pathname.startsWith("/admin/business")) {
    return BUSINESS_TAB_TO_NAV_KEY[requestedTab] || "users";
  }

  if (pathname.startsWith("/admin/users") || pathname.startsWith("/admin/logs") || pathname.startsWith("/admin/rates")) {
    return "users";
  }

  if (
    pathname.startsWith("/admin/redeem") ||
    pathname.startsWith("/admin/redeem-batches") ||
    pathname.startsWith("/admin/redeem-codes") ||
    pathname.startsWith("/admin/redeem-audit")
  ) {
    return "redeem";
  }

  if (pathname.startsWith("/admin/pipeline") || pathname.startsWith("/admin/lesson-task-logs") || pathname.startsWith("/admin/translation-logs")) {
    return "tasks";
  }

  if (
    pathname.startsWith("/admin/operation-logs") ||
    pathname.startsWith("/admin/sql-console") ||
    pathname.startsWith("/admin/subtitle-settings")
  ) {
    return "operations";
  }

  if (pathname.startsWith("/admin/ops") || pathname.startsWith("/admin/overview") || pathname.startsWith("/admin/system")) {
    return "health";
  }

  return MONITORING_TAB_TO_NAV_KEY[requestedTab] || "health";
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
