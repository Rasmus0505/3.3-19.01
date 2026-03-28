import React, { useMemo, useState } from "react";

import { BottleMark } from "./BottleMark";

export type AuthIntent = "login" | "register";

export interface AuthCredentials {
  email: string;
  password: string;
  username?: string;
}

export interface AuthActionResult {
  ok: boolean;
  message?: string;
  clearPassword?: boolean;
}

interface SharedAuthPanelProps {
  title?: string;
  description?: string;
  footerMessage?: string;
  statusMessage?: string;
  expired?: boolean;
  restorePending?: boolean;
  initialEmail?: string;
  initialUsername?: string;
  appName?: string;
  badgeText?: string;
  onAuthenticate: (
    intent: AuthIntent,
    credentials: AuthCredentials,
  ) => Promise<AuthActionResult>;
}

function panelShadow() {
  return "0 32px 80px rgba(15, 23, 42, 0.16)";
}

export function SharedAuthPanel({
  title = "账号入口",
  description = "登录后即可继续上传、生成与学习。",
  footerMessage = "使用你的 Bottle 账号继续。",
  statusMessage = "",
  expired = false,
  restorePending = false,
  initialEmail = "",
  initialUsername = "",
  appName = "Bottle",
  badgeText = "Account",
  onAuthenticate,
}: SharedAuthPanelProps) {
  const [intent, setIntent] = useState<AuthIntent>("login");
  const [email, setEmail] = useState(initialEmail);
  const [username, setUsername] = useState(initialUsername);
  const [password, setPassword] = useState("");
  const [pendingIntent, setPendingIntent] = useState<AuthIntent | null>(null);
  const [localStatus, setLocalStatus] = useState("");
  const [localStatusKind, setLocalStatusKind] = useState<"neutral" | "success" | "danger">(
    expired ? "danger" : "neutral",
  );

  const effectiveStatus = localStatus || statusMessage;
  const effectiveStatusKind = localStatus ? localStatusKind : expired ? "danger" : "neutral";
  const pending = pendingIntent !== null;
  const isRegister = intent === "register";

  const badgeStyle = useMemo<React.CSSProperties>(
    () => ({
      display: "inline-flex",
      alignItems: "center",
      gap: "0.4rem",
      borderRadius: 999,
      padding: "0.35rem 0.75rem",
      fontSize: "0.75rem",
      letterSpacing: "0.18em",
      textTransform: "uppercase",
      background: "rgba(8, 145, 178, 0.12)",
      color: "#155e75",
      fontWeight: 700,
    }),
    [],
  );

  const inputStyle = useMemo<React.CSSProperties>(
    () => ({
      width: "100%",
      boxSizing: "border-box",
      padding: "0.9rem 1rem",
      borderRadius: "1rem",
      border: "1px solid #cbd5e1",
      background: "rgba(255, 255, 255, 0.96)",
      color: "#0f172a",
      fontSize: "0.95rem",
      outline: "none",
    }),
    [],
  );

  const statusBoxStyle = useMemo<React.CSSProperties>(() => {
    const palette =
      effectiveStatusKind === "success"
        ? {
            background: "rgba(16, 185, 129, 0.1)",
            border: "1px solid rgba(16, 185, 129, 0.18)",
            color: "#166534",
          }
        : effectiveStatusKind === "danger"
          ? {
              background: "rgba(239, 68, 68, 0.08)",
              border: "1px solid rgba(239, 68, 68, 0.16)",
              color: "#991b1b",
            }
          : {
              background: "rgba(15, 23, 42, 0.04)",
              border: "1px solid rgba(148, 163, 184, 0.24)",
              color: "#475569",
            };
    return {
      borderRadius: "1rem",
      padding: "0.85rem 1rem",
      fontSize: "0.92rem",
      lineHeight: 1.5,
      ...palette,
    };
  }, [effectiveStatusKind]);

  function getTabStyle(active: boolean): React.CSSProperties {
    return {
      flex: 1,
      minHeight: 44,
      borderRadius: "999px",
      border: active ? "1px solid rgba(8, 145, 178, 0.2)" : "1px solid transparent",
      background: active ? "linear-gradient(135deg, rgba(15, 118, 110, 0.12), rgba(8, 145, 178, 0.12))" : "transparent",
      color: active ? "#0f766e" : "#475569",
      fontSize: "0.92rem",
      fontWeight: 700,
      cursor: pending ? "wait" : "pointer",
    };
  }

  function getPrimaryButtonStyle(): React.CSSProperties {
    return {
      width: "100%",
      minHeight: 48,
      borderRadius: "999px",
      border: "none",
      background: "linear-gradient(135deg, #0f766e 0%, #0891b2 100%)",
      color: "#ecfeff",
      fontSize: "0.95rem",
      fontWeight: 700,
      cursor: pending ? "wait" : "pointer",
    };
  }

  async function handleAction(nextIntent: AuthIntent) {
    if (!email.trim() || !password) {
      setLocalStatus("请先输入邮箱和密码。");
      setLocalStatusKind("danger");
      return;
    }
    if (nextIntent === "register" && !username.trim()) {
      setLocalStatus("注册时请填写用户名。");
      setLocalStatusKind("danger");
      return;
    }
    setPendingIntent(nextIntent);
    setLocalStatus("");
    try {
      const result = await onAuthenticate(nextIntent, {
        email: email.trim(),
        password,
        username: nextIntent === "register" ? username.trim() : undefined,
      });
      if (result.ok) {
        setLocalStatus(result.message || (nextIntent === "login" ? "登录成功。" : "注册成功。"));
        setLocalStatusKind("success");
        setIntent("login");
      } else {
        setLocalStatus(result.message || (nextIntent === "login" ? "登录失败。" : "注册失败。"));
        setLocalStatusKind("danger");
      }
      if (result.clearPassword) {
        setPassword("");
      }
    } finally {
      setPendingIntent(null);
    }
  }

  return (
    <div
      style={{
        display: "grid",
        gap: "1rem",
      }}
    >
      <div
        style={{
          position: "relative",
          overflow: "hidden",
          borderRadius: 28,
          border: "1px solid rgba(148, 163, 184, 0.18)",
          background:
            "radial-gradient(circle at top left, rgba(103, 232, 249, 0.22), transparent 36%), linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(240, 249, 255, 0.98))",
          padding: "1.5rem",
          boxShadow: panelShadow(),
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: "auto -24px -36px auto",
            width: 160,
            height: 160,
            borderRadius: "999px",
            background: "rgba(34, 211, 238, 0.12)",
            filter: "blur(8px)",
          }}
        />
        <div style={{ position: "relative", display: "grid", gap: "1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <BottleMark size={52} title={appName} />
            <div style={{ display: "grid", gap: "0.35rem" }}>
              <span style={badgeStyle}>{badgeText}</span>
              <div>
                <div
                  style={{
                    fontSize: "1.35rem",
                    lineHeight: 1.2,
                    fontWeight: 800,
                    color: "#0f172a",
                  }}
                >
                  {title}
                </div>
                <div
                  style={{
                    marginTop: "0.35rem",
                    color: "#475569",
                    fontSize: "0.96rem",
                    lineHeight: 1.55,
                  }}
                >
                  {description}
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: "0.75rem", padding: "0.35rem", borderRadius: "999px", background: "rgba(15, 23, 42, 0.04)" }}>
            <button type="button" disabled={pending} onClick={() => setIntent("login")} style={getTabStyle(!isRegister)}>
              登录
            </button>
            <button type="button" disabled={pending} onClick={() => setIntent("register")} style={getTabStyle(isRegister)}>
              注册
            </button>
          </div>

          {restorePending ? (
            <div style={statusBoxStyle}>正在恢复上次登录状态...</div>
          ) : effectiveStatus ? (
            <div style={statusBoxStyle} aria-live="polite">
              {effectiveStatus}
            </div>
          ) : null}

          <form
            style={{ display: "grid", gap: "0.9rem" }}
            onSubmit={(event) => {
              event.preventDefault();
              void handleAction(intent);
            }}
          >
            {isRegister ? (
              <label style={{ display: "grid", gap: "0.45rem" }}>
                <span style={{ fontSize: "0.84rem", fontWeight: 700, color: "#334155" }}>用户名</span>
                <input
                  type="text"
                  autoComplete="nickname"
                  placeholder="例如 Bottle Learner"
                  value={username}
                  disabled={pending}
                  onChange={(event) => setUsername(event.target.value)}
                  style={inputStyle}
                />
              </label>
            ) : null}

            <label style={{ display: "grid", gap: "0.45rem" }}>
              <span style={{ fontSize: "0.84rem", fontWeight: 700, color: "#334155" }}>邮箱</span>
              <input
                type="email"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                placeholder="you@example.com"
                value={email}
                disabled={pending}
                onChange={(event) => setEmail(event.target.value)}
                style={inputStyle}
              />
            </label>

            <label style={{ display: "grid", gap: "0.45rem" }}>
              <span style={{ fontSize: "0.84rem", fontWeight: 700, color: "#334155" }}>密码</span>
              <input
                type="password"
                autoComplete={isRegister ? "new-password" : "current-password"}
                autoCapitalize="none"
                autoCorrect="off"
                placeholder="至少 6 位"
                value={password}
                disabled={pending}
                minLength={6}
                onChange={(event) => setPassword(event.target.value)}
                style={inputStyle}
              />
            </label>

            <button type="submit" disabled={pending} style={getPrimaryButtonStyle()}>
              {pendingIntent === intent ? (intent === "login" ? "登录中..." : "注册中...") : intent === "login" ? "登录" : "注册"}
            </button>
          </form>
        </div>
      </div>

      <div
        style={{
          paddingInline: "0.5rem",
          color: "#64748b",
          fontSize: "0.88rem",
          lineHeight: 1.6,
          textAlign: "center",
        }}
      >
        {footerMessage}
      </div>
    </div>
  );
}
