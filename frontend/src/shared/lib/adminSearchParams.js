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

export function buildScopedKey(prefix, key) {
  const normalizedPrefix = String(prefix || "").trim();
  return normalizedPrefix ? `${normalizedPrefix}_${key}` : key;
}

export function readScopedIntParam(searchParams, prefix, key, fallback, options = {}) {
  return readIntParam(searchParams, buildScopedKey(prefix, key), fallback, options);
}

export function readScopedStringParam(searchParams, prefix, key, fallback = "") {
  return readStringParam(searchParams, buildScopedKey(prefix, key), fallback);
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

export function buildScopedSearchParams(prefix, entries) {
  return buildSearchParams(
    Object.fromEntries(Object.entries(entries).map(([key, value]) => [buildScopedKey(prefix, key), value])),
  );
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

export function mergeScopedSearchParams(currentSearchParams, prefix, entries) {
  return mergeSearchParams(
    currentSearchParams,
    Object.fromEntries(Object.entries(entries).map(([key, value]) => [buildScopedKey(prefix, key), value])),
  );
}

export const ADMIN_NAV_ITEMS = [
  {
    key: "health",
    label: "系统健康",
    description: "",
    href: "/admin/health",
  },
  {
    key: "security",
    label: "安全中心",
    description: "数据库、权限与危险操作保护",
    href: "/admin/security",
  },
  {
    key: "users",
    label: "用户活跃",
    description: "",
    href: "/admin/users",
  },
  {
    key: "models",
    label: "模型管理",
    description: "",
    href: "/admin/models",
  },
  {
    key: "redeem",
    label: "活动兑换",
    description: "",
    href: "/admin/redeem",
  },
];

export function getAdminNavItemByKey(key) {
  return ADMIN_NAV_ITEMS.find((item) => item.key === key) || ADMIN_NAV_ITEMS[0];
}

export function resolveAdminNavKey(pathname) {
  if (pathname.startsWith("/admin/security")) return "security";
  if (pathname.startsWith("/admin/users") || pathname.startsWith("/admin/logs")) return "users";
  if (pathname.startsWith("/admin/models")) return "models";
  if (pathname.startsWith("/admin/redeem")) return "redeem";
  return "health";
}

export function resolveAdminNavItem(pathname) {
  return getAdminNavItemByKey(resolveAdminNavKey(pathname));
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
