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
