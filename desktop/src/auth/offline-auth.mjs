function normalizeBase64Url(input = "") {
  const normalized = String(input || "").replace(/-/g, "+").replace(/_/g, "/");
  const remainder = normalized.length % 4;
  if (remainder === 0) {
    return normalized;
  }
  return `${normalized}${"=".repeat(4 - remainder)}`;
}

export function parseJwtPayload(token = "") {
  const segments = String(token || "").split(".");
  if (segments.length < 2 || !segments[1]) {
    return {};
  }
  try {
    const decoded = Buffer.from(normalizeBase64Url(segments[1]), "base64").toString("utf8");
    const payload = JSON.parse(decoded);
    return payload && typeof payload === "object" ? payload : {};
  } catch (_) {
    return {};
  }
}

export function readJwtExpiryMs(token = "") {
  const exp = Number(parseJwtPayload(token).exp || 0);
  if (!Number.isFinite(exp) || exp <= 0) {
    return 0;
  }
  return exp * 1000;
}

export function readJwtExpiryIso(token = "") {
  const expiryMs = readJwtExpiryMs(token);
  return expiryMs > 0 ? new Date(expiryMs).toISOString() : "";
}

export function isJwtExpired(token = "", nowMs = Date.now(), skewMs = 15_000) {
  const expiryMs = readJwtExpiryMs(token);
  if (expiryMs <= 0) {
    return true;
  }
  return expiryMs <= nowMs + Math.max(0, Number(skewMs || 0));
}

export function normalizeCachedUser(user = {}) {
  const id = Number(user?.id || user?.user_id || 0);
  const email = String(user?.email || "").trim();
  return {
    id: Number.isFinite(id) && id > 0 ? id : 0,
    email,
    is_admin: Boolean(user?.is_admin),
  };
}

export function buildOfflineRestoreDecision({ accessToken = "", refreshToken = "", online = true, nowMs = Date.now() } = {}) {
  const accessExpired = isJwtExpired(accessToken, nowMs);
  const refreshExpired = isJwtExpired(refreshToken, nowMs);
  if (!accessExpired) {
    return { status: "active", shouldRefresh: false, reason: "access_token_valid" };
  }
  if (!refreshExpired && online) {
    return { status: "refresh", shouldRefresh: true, reason: "access_token_expired_online" };
  }
  if (!refreshExpired) {
    return { status: "active", shouldRefresh: false, reason: "offline_refresh_token_available" };
  }
  return {
    status: "expired",
    shouldRefresh: false,
    reason: online ? "refresh_token_expired_online" : "refresh_token_expired_offline",
  };
}
