import { useEffect, useState } from "react";
import { toast } from "sonner";

import { clearAuthStorage, persistAuthSession, writeStoredUser } from "../../../app/authStorage";
import { api, parseResponse, toErrorText } from "../../../shared/api/client";
import { useAppStore } from "../../../store";
import { SharedAuthPanel } from "../shared/SharedAuthPanel";
import { postAuthJson } from "../shared/authApi";

export function AuthPanel({ onAuthed, tokenKey, refreshKey }) {
  const setAccessToken = useAppStore((state) => state.setAccessToken);
  const setCurrentUser = useAppStore((state) => state.setCurrentUser);
  const setGlobalStatus = useAppStore((state) => state.setGlobalStatus);
  const restoreDesktopSession = useAppStore((state) => state.restoreDesktopSession);
  const authStatus = useAppStore((state) => state.authStatus);
  const authStatusMessage = useAppStore((state) => state.authStatusMessage);
  const hasStoredToken = useAppStore((state) => state.hasStoredToken);
  const currentUser = useAppStore((state) => state.currentUser);
  const [status, setStatus] = useState("");
  const [restorePending, setRestorePending] = useState(true);

  useEffect(() => {
    let canceled = false;

    async function tryRestoreSession() {
      setRestorePending(true);
      const restoredAccessToken = await restoreDesktopSession();
      if (canceled) {
        return;
      }
      if (restoredAccessToken) {
        const requiresWebValidation =
          typeof window !== "undefined" &&
          typeof window.desktopRuntime?.auth?.restoreSession !== "function";
        try {
          if (requiresWebValidation) {
            const profileResp = await api("/api/auth/me", {}, restoredAccessToken);
            const profileData = await parseResponse(profileResp);
            if (!profileResp.ok || !profileData?.id) {
              await clearAuthStorage();
              setAccessToken("");
              setCurrentUser(null);
              setRestorePending(false);
              return;
            }
            writeStoredUser(profileData);
            setCurrentUser(profileData);
          }
        } catch (_) {
          if (requiresWebValidation) {
            await clearAuthStorage();
            setAccessToken("");
            setCurrentUser(null);
            setRestorePending(false);
            return;
          }
        }
        onAuthed({
          access_token: restoredAccessToken,
        });
      }
      setRestorePending(false);
    }

    void tryRestoreSession();
    return () => {
      canceled = true;
    };
  }, [onAuthed, restoreDesktopSession]);

  async function handleAuthenticate(intent, credentials) {
    const path = intent === "login" ? "/api/auth/login" : "/api/auth/register";
    const fallbackMessage = intent === "login" ? "登录失败" : "注册失败";
    const successMessage = intent === "login" ? "登录成功，正在进入首页..." : "注册成功，正在进入首页...";

    setStatus(intent === "login" ? "正在登录..." : "正在注册...");
    const result = await postAuthJson(path, credentials, fallbackMessage);

    if (!result.ok) {
      setStatus(result.message);
      toast.error(result.message);
      return {
        ok: false,
        message: result.message,
        clearPassword: true,
      };
    }

    await persistAuthSession(result.data, { tokenKey, refreshKey });
    setCurrentUser(result.data.user || null);
    setAccessToken(result.data.access_token);
    setGlobalStatus("");
    setStatus(successMessage);
    toast.success(intent === "login" ? "登录成功" : "注册成功");
    onAuthed(result.data);
    return {
      ok: true,
      message: successMessage,
    };
  }

  const isExpired = authStatus === "expired";
  const description = isExpired ? authStatusMessage || "当前登录已失效，请重新登录后继续。" : "上传素材，同步学习进度。";
  const footerMessage = isExpired
    ? hasStoredToken
      ? "重新登录后会覆盖当前已失效的本地令牌。"
      : "请重新登录后继续。"
    : "登录后即可开始上传和学习。";

  return (
    <SharedAuthPanel
      title={isExpired ? "登录已失效" : "登录"}
      description={description}
      footerMessage={footerMessage}
      statusMessage={status}
      expired={isExpired}
      restorePending={restorePending}
      initialEmail={currentUser?.email || ""}
      initialUsername={currentUser?.username || ""}
      appName="Unlock Anything"
      badgeText="Account"
      onAuthenticate={handleAuthenticate}
    />
  );
}
