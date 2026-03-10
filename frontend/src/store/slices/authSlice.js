import { api } from "../../shared/api/client";
import { clearAuthStorage, TOKEN_KEY } from "../../app/authStorage";

export const authInitialState = {
  accessToken: typeof localStorage === "undefined" ? "" : localStorage.getItem(TOKEN_KEY) || "",
  isAdminUser: false,
  adminAuthState: "idle",
};

export function createAuthSlice(set, get) {
  return {
    ...authInitialState,
    resetAuthState: () => set({ ...authInitialState }),
    hydrateAccessToken: () => {
      const accessToken = typeof localStorage === "undefined" ? "" : localStorage.getItem(TOKEN_KEY) || "";
      set({ accessToken });
      return accessToken;
    },
    setAccessToken: (accessToken) => {
      set({ accessToken: String(accessToken || "") });
    },
    async detectAdmin(apiCall = api) {
      const accessToken = get().accessToken;
      if (!accessToken) {
        set({ isAdminUser: false, adminAuthState: "idle" });
        return false;
      }
      set({ adminAuthState: "checking" });
      try {
        const resp = await apiCall("/api/admin/billing-rates", {}, accessToken);
        if (resp.ok) {
          set({ isAdminUser: true, adminAuthState: "ready" });
          return true;
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
      set({ ...authInitialState, accessToken: "" });
      get().resetLessonState();
      get().resetMediaState();
      get().resetUiState();
    },
  };
}
