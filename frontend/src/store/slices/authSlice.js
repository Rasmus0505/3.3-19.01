import { api, parseResponse, toErrorText } from "../../shared/api/client";
import { clearAuthStorage, TOKEN_KEY } from "../../app/authStorage";

function readStoredAccessToken() {
  if (typeof localStorage === "undefined") return "";
  return localStorage.getItem(TOKEN_KEY) || "";
}

function buildAuthInitialState() {
  const accessToken = readStoredAccessToken();
  return {
    accessToken,
    hasStoredToken: Boolean(accessToken),
    authStatus: accessToken ? "active" : "anonymous",
    authStatusMessage: "",
    isAdminUser: false,
    adminAuthState: "idle",
  };
}

export const authInitialState = buildAuthInitialState();

export function createAuthSlice(set, get) {
  return {
    ...buildAuthInitialState(),
    resetAuthState: () => set({ ...buildAuthInitialState() }),
    hydrateAccessToken: () => {
      const accessToken = readStoredAccessToken();
      set({
        accessToken,
        hasStoredToken: Boolean(accessToken),
        authStatus: accessToken ? "active" : "anonymous",
        authStatusMessage: "",
        isAdminUser: false,
        adminAuthState: "idle",
      });
      return accessToken;
    },
    setAccessToken: (accessToken) => {
      const nextAccessToken = String(accessToken || "");
      set({
        accessToken: nextAccessToken,
        hasStoredToken: Boolean(nextAccessToken || readStoredAccessToken()),
        authStatus: nextAccessToken ? "active" : "anonymous",
        authStatusMessage: "",
        isAdminUser: false,
        adminAuthState: "idle",
      });
    },
    markAuthExpired: (message = "登录已失效，请重新登录") => {
      const nextMessage = String(message || "登录已失效，请重新登录");
      console.debug("[DEBUG] auth expired", { message: nextMessage });
      set({
        accessToken: "",
        hasStoredToken: Boolean(readStoredAccessToken()),
        authStatus: "expired",
        authStatusMessage: nextMessage,
        isAdminUser: false,
        adminAuthState: "forbidden",
      });
    },
    async detectAdmin(apiCall = api) {
      const accessToken = get().accessToken;
      if (!accessToken) {
        set({ isAdminUser: false, adminAuthState: get().authStatus === "expired" ? "forbidden" : "idle" });
        return false;
      }
      set({ adminAuthState: "checking" });
      try {
        const resp = await apiCall("/api/admin/billing-rates", {}, accessToken);
        const data = await parseResponse(resp);
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
    logout: () => {
      clearAuthStorage();
      set({
        ...buildAuthInitialState(),
        accessToken: "",
        hasStoredToken: false,
        authStatus: "anonymous",
        authStatusMessage: "",
      });
      get().resetLessonState();
      get().resetMediaState();
      get().resetUiState();
    },
  };
}
