import { api, parseResponse, toErrorText } from "../../shared/api/client";
import { clearAuthStorage, restoreCachedAuthSession, TOKEN_KEY, USER_EMAIL_KEY, USER_ID_KEY, USER_IS_ADMIN_KEY, USER_USERNAME_KEY } from "../../app/authStorage";

type Setter = (partial: Record<string, unknown> | ((state: any) => Record<string, unknown>)) => void;
type Getter = () => any;

function readStoredAccessToken() {
  if (typeof localStorage === "undefined") return "";
  return localStorage.getItem(TOKEN_KEY) || "";
}

function normalizeAdminFlag(value: unknown) {
  if (typeof value === "boolean") return value;
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function normalizeStoredUser(user: any) {
  const id = Number(user?.id || 0);
  const email = String(user?.email || "").trim();
  const username = String(user?.username || "").trim();
  if (!Number.isFinite(id) || id <= 0 || !email) {
    return null;
  }
  return { id, email, username, is_admin: normalizeAdminFlag(user?.is_admin) };
}

function readStoredCurrentUser() {
  if (typeof localStorage === "undefined") return null;
  return normalizeStoredUser({
    id: localStorage.getItem(USER_ID_KEY),
    email: localStorage.getItem(USER_EMAIL_KEY),
    username: localStorage.getItem(USER_USERNAME_KEY),
    is_admin: localStorage.getItem(USER_IS_ADMIN_KEY),
  });
}

function buildAuthInitialState() {
  const storedAccessToken = readStoredAccessToken();
  const currentUser = readStoredCurrentUser();
  const hasStoredToken = Boolean(storedAccessToken);
  return {
    accessToken: "",
    currentUser,
    hasStoredToken,
    authStatus: hasStoredToken ? "restoring" : "anonymous",
    authStatusMessage: "",
    isAdminUser: false,
    adminAuthState: "idle",
    authBootstrapPending: hasStoredToken,
  };
}

export const authInitialState = buildAuthInitialState();

export function createAuthSlice(set: Setter, get: Getter) {
  return {
    ...buildAuthInitialState(),
    resetAuthState: () => set({ ...buildAuthInitialState() }),
    hydrateAccessToken: () => {
      const accessToken = readStoredAccessToken();
      const currentUser = readStoredCurrentUser();
      set({
        accessToken,
        currentUser,
        hasStoredToken: Boolean(accessToken),
        authStatus: accessToken ? "active" : "anonymous",
        authStatusMessage: "",
        isAdminUser: Boolean(accessToken && currentUser?.is_admin),
        adminAuthState: "idle",
        authBootstrapPending: false,
      });
      return accessToken;
    },
    restoreDesktopSession: async (options: { forceRefresh?: boolean } = {}) => {
      set({ authBootstrapPending: true, authStatus: get().hasStoredToken ? "restoring" : get().authStatus });
      const result = await restoreCachedAuthSession({ forceRefresh: Boolean(options.forceRefresh) });
      const accessToken = readStoredAccessToken();
      const currentUser = readStoredCurrentUser();
      if (result?.status === "expired") {
        const nextMessage = String(result.message || "登录状态已过期，请联网重新登录");
        set({
          accessToken: "",
          currentUser,
          hasStoredToken: false,
          authStatus: "expired",
          authStatusMessage: nextMessage,
          isAdminUser: false,
          adminAuthState: "forbidden",
          authBootstrapPending: false,
        });
        return "";
      }
      set({
        accessToken,
        currentUser,
        hasStoredToken: Boolean(accessToken),
        authStatus: accessToken ? "active" : "anonymous",
        authStatusMessage: "",
        isAdminUser: Boolean(accessToken && currentUser?.is_admin),
        adminAuthState: "idle",
        authBootstrapPending: false,
      });
      return accessToken;
    },
    setAccessToken: (accessToken: unknown) => {
      const nextAccessToken = String(accessToken || "");
      const currentUser = nextAccessToken ? readStoredCurrentUser() : null;
      set({
        accessToken: nextAccessToken,
        currentUser,
        hasStoredToken: Boolean(nextAccessToken || readStoredAccessToken()),
        authStatus: nextAccessToken ? "active" : "anonymous",
        authStatusMessage: "",
        isAdminUser: Boolean(nextAccessToken && currentUser?.is_admin),
        adminAuthState: "idle",
        authBootstrapPending: false,
      });
    },
    setCurrentUser: (currentUser: unknown) => {
      const normalizedUser = normalizeStoredUser(currentUser);
      set({
        currentUser: normalizedUser,
        isAdminUser: Boolean(get().accessToken && normalizedUser?.is_admin),
      });
    },
    markAuthExpired: (message = "登录已失效，请重新登录") => {
      const nextMessage = String(message || "登录已失效，请重新登录");
      console.debug("[DEBUG] auth expired", { message: nextMessage });
      const rememberedUser = readStoredCurrentUser();
      void clearAuthStorage();
      set({
        accessToken: "",
        currentUser: rememberedUser,
        hasStoredToken: false,
        authStatus: "expired",
        authStatusMessage: nextMessage,
        isAdminUser: false,
        adminAuthState: "forbidden",
        authBootstrapPending: false,
      });
    },
    async detectAdmin(apiCall = api) {
      let accessToken = get().accessToken;
      if (!accessToken) {
        set({ isAdminUser: false, adminAuthState: get().authStatus === "expired" ? "forbidden" : "idle" });
        return false;
      }
      set({ adminAuthState: "checking" });
      try {
        let resp = await apiCall("/api/admin/billing-rates", {}, accessToken);
        let data = await parseResponse(resp);
        if (resp.status === 401) {
          const refreshedAccessToken = await get().restoreDesktopSession({ forceRefresh: true });
          if (!refreshedAccessToken) {
            get().markAuthExpired(toErrorText(data, "登录状态已过期，请联网重新登录"));
            return false;
          }
          accessToken = refreshedAccessToken;
          resp = await apiCall("/api/admin/billing-rates", {}, accessToken);
          data = await parseResponse(resp);
        }
        if (resp.ok) {
          set({
            isAdminUser: true,
            adminAuthState: "ready",
            authStatus: "active",
            authStatusMessage: "",
            hasStoredToken: true,
          });
          return true;
        }
        if (resp.status === 401) {
          get().markAuthExpired(toErrorText(data, "登录已失效，请重新登录"));
          return false;
        }
        if (resp.status === 403) {
          set({ isAdminUser: false, adminAuthState: "forbidden" });
          return false;
        }
      } catch (_) {
        // noop
      }
      set({ isAdminUser: false, adminAuthState: "forbidden" });
      return false;
    },
    logout: async () => {
      await clearAuthStorage();
      set({
        ...buildAuthInitialState(),
        accessToken: "",
        hasStoredToken: false,
        authStatus: "anonymous",
        authStatusMessage: "",
        authBootstrapPending: false,
      });
      get().resetLessonState();
      get().resetMediaState();
      get().resetUiState();
    },
  };
}
