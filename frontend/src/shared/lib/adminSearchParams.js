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
    key: "users",
    label: "用户运营",
    description: "查用户、钱包流水与计费价格",
    href: "/admin/users?tab=list",
  },
  {
    key: "redeem",
    label: "活动兑换",
    description: "批次、兑换码与兑换审计",
    href: "/admin/redeem",
  },
  {
    key: "announcements",
    label: "公告管理",
    description: "创建、编辑、置顶和删除公告",
    href: "/admin/announcements",
  },
  {
    key: "troubleshooting",
    label: "排障中心",
    description: "健康、失败、安全维护与操作审计",
    href: "/admin/troubleshooting?tab=health&panel=overview",
  },
];

export function getAdminNavItemByKey(key) {
  return ADMIN_NAV_ITEMS.find((item) => item.key === key) || ADMIN_NAV_ITEMS[0];
}

export function resolveAdminNavKey(pathname, search = "") {
  if (pathname.startsWith("/admin/users")) return "users";
  if (pathname.startsWith("/admin/redeem")) return "redeem";
  if (pathname.startsWith("/admin/announcements")) return "announcements";
  if (pathname.startsWith("/admin/troubleshooting") || pathname.startsWith("/admin/health")) return "troubleshooting";
  if (pathname.startsWith("/admin/security")) return "troubleshooting";
  if (pathname.startsWith("/admin/rates") || pathname.startsWith("/admin/logs") || pathname.startsWith("/admin/subtitle-settings")) return "users";
  return "users";
}

export function resolveAdminNavItem(pathname, search = "") {
  return getAdminNavItemByKey(resolveAdminNavKey(pathname, search));
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
