export const TOKEN_KEY = "english_asr_access_token";
export const REFRESH_KEY = "english_asr_refresh_token";
export const USER_ID_KEY = "english_asr_user_id";
export const USER_EMAIL_KEY = "english_asr_user_email";
export const USER_IS_ADMIN_KEY = "english_asr_user_is_admin";
export const DESKTOP_SESSION_TOKEN = "__desktop_session__";

function getStorage() {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }
  return window.localStorage;
}

function getDesktopAuthRuntime() {
  if (typeof window === "undefined") {
    return null;
  }
  return window.desktopRuntime?.auth || null;
}

function hasDesktopAuthProxy() {
  const desktopAuth = getDesktopAuthRuntime();
  return Boolean(desktopAuth?.login && desktopAuth?.restoreSession && desktopAuth?.request);
}

function trimText(value) {
  return String(value ?? "").trim();
}

export function writeStoredUser(user) {
  const storage = getStorage();
  if (!storage) {
    return;
  }
  const userId = Number(user?.id || 0);
  const email = trimText(user?.email);
  if (Number.isFinite(userId) && userId > 0) {
    storage.setItem(USER_ID_KEY, String(userId));
  } else {
    storage.removeItem(USER_ID_KEY);
  }
  if (email) {
    storage.setItem(USER_EMAIL_KEY, email);
  } else {
    storage.removeItem(USER_EMAIL_KEY);
  }
  storage.setItem(USER_IS_ADMIN_KEY, user?.is_admin ? "true" : "false");
}

export function writeStoredTokens(accessToken, refreshToken, tokenKey = TOKEN_KEY, refreshKey = REFRESH_KEY) {
  const storage = getStorage();
  if (!storage) {
    return;
  }
  const nextAccessToken = trimText(accessToken);
  const nextRefreshToken = trimText(refreshToken);
  if (nextAccessToken) {
    storage.setItem(tokenKey, nextAccessToken);
  } else {
    storage.removeItem(tokenKey);
  }
  if (nextRefreshToken) {
    storage.setItem(refreshKey, nextRefreshToken);
  } else {
    storage.removeItem(refreshKey);
  }
}

export function applyAuthSession(authPayload, options = {}) {
  const tokenKey = options.tokenKey || TOKEN_KEY;
  const refreshKey = options.refreshKey || REFRESH_KEY;
  const desktopSession = authPayload?.session && typeof authPayload.session === "object" ? authPayload.session : null;
  const nextUser = desktopSession?.user || authPayload?.user || null;
  if (hasDesktopAuthProxy()) {
    writeStoredTokens(DESKTOP_SESSION_TOKEN, "", tokenKey, refreshKey);
  } else {
    writeStoredTokens(authPayload?.access_token, authPayload?.refresh_token, tokenKey, refreshKey);
  }
  writeStoredUser(nextUser);
  return {
    accessToken: hasDesktopAuthProxy() ? DESKTOP_SESSION_TOKEN : trimText(authPayload?.access_token),
    refreshToken: hasDesktopAuthProxy() ? "" : trimText(authPayload?.refresh_token),
    user: nextUser,
  };
}

export async function persistAuthSession(authPayload, options = {}) {
  const nextSession = applyAuthSession(authPayload, options);
  const desktopAuth = getDesktopAuthRuntime();
  if (!hasDesktopAuthProxy() && desktopAuth?.cacheSession) {
    await desktopAuth.cacheSession({
      access_token: nextSession.accessToken,
      refresh_token: nextSession.refreshToken,
      user: nextSession.user,
    });
  }
  return nextSession;
}

export async function restoreCachedAuthSession(options = {}) {
  const desktopAuth = getDesktopAuthRuntime();
  if (!desktopAuth?.restoreSession) {
    const storage = getStorage();
    return {
      status: storage?.getItem(TOKEN_KEY) ? "active" : "anonymous",
      auth: null,
      restored: false,
      refreshed: false,
      message: "",
    };
  }

  const result = await desktopAuth.restoreSession({
    online: options.online ?? (typeof navigator !== "undefined" ? navigator.onLine !== false : true),
    forceRefresh: Boolean(options.forceRefresh),
  });

  if (result?.status === "active" && (result?.auth || result?.session)) {
    applyAuthSession(result?.session ? result : result.auth, options);
    return result;
  }

  writeStoredTokens("", "", options.tokenKey || TOKEN_KEY, options.refreshKey || REFRESH_KEY);
  if (result?.user) {
    writeStoredUser(result.user);
  }
  return result || {
    status: "anonymous",
    auth: null,
    restored: false,
    refreshed: false,
    message: "",
  };
}

export async function clearAuthStorage() {
  const storage = getStorage();
  if (storage) {
    storage.removeItem(TOKEN_KEY);
    storage.removeItem(REFRESH_KEY);
    storage.removeItem(USER_ID_KEY);
    storage.removeItem(USER_EMAIL_KEY);
    storage.removeItem(USER_IS_ADMIN_KEY);
  }
  const desktopAuth = getDesktopAuthRuntime();
  if (desktopAuth?.logout) {
    try {
      await desktopAuth.logout();
    } catch (_) {
      // Ignore desktop cache cleanup failures after local storage has been cleared.
    }
  } else if (desktopAuth?.clearSession) {
    try {
      await desktopAuth.clearSession();
    } catch (_) {
      // Ignore desktop cache cleanup failures after local storage has been cleared.
    }
  }
}
