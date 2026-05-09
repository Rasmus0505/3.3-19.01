import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const HEARTBEAT_INTERVAL_MS = 15000;
const INACTIVITY_TIMEOUT_MS = 60000;

function toJsonOptions(method, body) {
  return {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };
}

function formatStatusLabel(status) {
  if (status === "paused_manual") return "已暂停";
  if (status === "paused_idle") return "因空闲暂停";
  return "学习中";
}

export function formatLearningDuration(totalSeconds) {
  const safeSeconds = Math.max(0, Number(totalSeconds || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  if (hours > 0) {
    return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
  }
  return [minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

async function safeParse(response) {
  try {
    return await response.json();
  } catch (_) {
    return {};
  }
}

export function useLearningSessionTimer({
  apiClient,
  accessToken,
  lessonId,
  lessonTitle,
  immersiveActive,
  isPlaying,
}) {
  const [sessionId, setSessionId] = useState(null);
  const [effectiveSeconds, setEffectiveSeconds] = useState(0);
  const [pausedSeconds, setPausedSeconds] = useState(0);
  const [status, setStatus] = useState("idle");
  const [busy, setBusy] = useState(false);
  const manualPausedRef = useRef(false);
  const lastTypingActivityAtRef = useRef(0);
  const mountedRef = useRef(true);
  const tickStateRef = useRef({
    effectiveSeconds: 0,
    pausedSeconds: 0,
    status: "idle",
    sessionId: null,
  });
  const lastKnownLessonIdRef = useRef(null);
  const startingRef = useRef(false);
  const finishingRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    tickStateRef.current = {
      effectiveSeconds,
      pausedSeconds,
      status,
      sessionId,
    };
  }, [effectiveSeconds, pausedSeconds, sessionId, status]);

  const hasTypingActivity = useCallback(() => {
    const lastTypingAt = Number(lastTypingActivityAtRef.current || 0);
    return lastTypingAt > 0 && Date.now() - lastTypingAt <= INACTIVITY_TIMEOUT_MS;
  }, []);

  const postSessionUpdate = useCallback(
    async (path, method, body) => {
      const response = await apiClient(path, toJsonOptions(method, body), accessToken);
      if (!response.ok) {
        const payload = await safeParse(response);
        throw new Error(payload?.message || "学习计时同步失败");
      }
      return safeParse(response);
    },
    [accessToken, apiClient],
  );

  const syncFromSession = useCallback((session) => {
    if (!session) return;
    if (!mountedRef.current) return;
    setSessionId(session.id ?? null);
    setEffectiveSeconds(Number(session.effective_seconds || 0));
    setPausedSeconds(Number(session.paused_seconds || 0));
  }, []);

  const startOrResumeSession = useCallback(async () => {
    if (!immersiveActive || !lessonId || startingRef.current) return;
    startingRef.current = true;
    setBusy(true);
    try {
      if (lastKnownLessonIdRef.current && lastKnownLessonIdRef.current !== lessonId && tickStateRef.current.sessionId) {
        await finishSession("lesson_change");
      }
      const payload = await postSessionUpdate(
        "/api/learning-sessions/start",
        "POST",
        {
          lesson_id: lessonId,
          title_snapshot: lessonTitle || "",
        },
      );
      const session = payload?.session;
      manualPausedRef.current = false;
      syncFromSession(session);
      setStatus(session?.status === "paused" ? "paused_idle" : "active");
      lastKnownLessonIdRef.current = lessonId;
    } finally {
      startingRef.current = false;
      if (mountedRef.current) {
        setBusy(false);
      }
    }
  }, [immersiveActive, lessonId, lessonTitle, postSessionUpdate, syncFromSession]);

  const flushHeartbeat = useCallback(async () => {
    const current = tickStateRef.current;
    if (!current.sessionId) return;
    try {
      const payload = await postSessionUpdate(
        `/api/learning-sessions/${current.sessionId}/heartbeat`,
        "POST",
        {
          effective_seconds: current.effectiveSeconds,
          paused_seconds: current.pausedSeconds,
          playing: Boolean(isPlaying),
          typing_active: hasTypingActivity(),
          last_activity_at: new Date().toISOString(),
        },
      );
      syncFromSession(payload?.session);
    } catch (_) {
      // 心跳失败不阻断本地秒表
    }
  }, [hasTypingActivity, isPlaying, postSessionUpdate, syncFromSession]);

  const pauseSession = useCallback(
    async (reason = "manual") => {
      const current = tickStateRef.current;
      if (!current.sessionId) return;
      if (reason === "manual") {
        manualPausedRef.current = true;
      }
      try {
        const payload = await postSessionUpdate(
          `/api/learning-sessions/${current.sessionId}/pause`,
          "POST",
          {
            effective_seconds: current.effectiveSeconds,
            paused_seconds: current.pausedSeconds,
            reason,
            last_activity_at: new Date().toISOString(),
          },
        );
        syncFromSession(payload?.session);
        if (mountedRef.current) {
          setStatus(reason === "manual" ? "paused_manual" : "paused_idle");
        }
      } catch (_) {
        if (mountedRef.current) {
          setStatus(reason === "manual" ? "paused_manual" : "paused_idle");
        }
      }
    },
    [postSessionUpdate, syncFromSession],
  );

  const resumeSession = useCallback(async () => {
    const current = tickStateRef.current;
    if (!current.sessionId) return;
    manualPausedRef.current = false;
    try {
      const payload = await postSessionUpdate(
        `/api/learning-sessions/${current.sessionId}/resume`,
        "POST",
        {
          effective_seconds: current.effectiveSeconds,
          paused_seconds: current.pausedSeconds,
          last_activity_at: new Date().toISOString(),
        },
      );
      syncFromSession(payload?.session);
      if (mountedRef.current) {
        setStatus("active");
      }
    } catch (_) {
      if (mountedRef.current) {
        setStatus("active");
      }
    }
  }, [postSessionUpdate, syncFromSession]);

  const finishSession = useCallback(
    async (reason = "completed") => {
      const current = tickStateRef.current;
      if (!current.sessionId || finishingRef.current) return;
      finishingRef.current = true;
      try {
        await postSessionUpdate(
          `/api/learning-sessions/${current.sessionId}/finish`,
          "POST",
          {
            effective_seconds: current.effectiveSeconds,
            paused_seconds: current.pausedSeconds,
            reason,
            last_activity_at: new Date().toISOString(),
          },
        );
      } catch (_) {
        // best effort
      } finally {
        manualPausedRef.current = false;
        finishingRef.current = false;
        if (mountedRef.current) {
          setSessionId(null);
          setStatus("idle");
          setEffectiveSeconds(0);
          setPausedSeconds(0);
        }
      }
    },
    [postSessionUpdate],
  );

  const registerTypingActivity = useCallback(() => {
    lastTypingActivityAtRef.current = Date.now();
    if (manualPausedRef.current) return;
    const currentStatus = tickStateRef.current.status;
    if (currentStatus === "paused_idle" || currentStatus === "paused") {
      void resumeSession();
    }
  }, [resumeSession]);

  useEffect(() => {
    if (!immersiveActive || !lessonId) return undefined;
    void startOrResumeSession();
    return undefined;
  }, [immersiveActive, lessonId, startOrResumeSession]);

  useEffect(() => {
    if (!immersiveActive && tickStateRef.current.sessionId) {
      void finishSession("route_change");
    }
  }, [finishSession, immersiveActive]);

  useEffect(() => {
    if (!sessionId) return undefined;

    const intervalId = window.setInterval(() => {
      const typingActive = hasTypingActivity();
      const active = !manualPausedRef.current && (Boolean(isPlaying) || typingActive);
      if (active) {
        setEffectiveSeconds((current) => current + 1);
        setStatus("active");
        return;
      }
      setPausedSeconds((current) => current + 1);
      setStatus((current) => {
        if (manualPausedRef.current) return "paused_manual";
        return current === "paused_idle" ? current : "paused_idle";
      });
    }, 1000);

    const heartbeatId = window.setInterval(() => {
      void flushHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
      window.clearInterval(heartbeatId);
    };
  }, [flushHeartbeat, hasTypingActivity, isPlaying, sessionId]);

  useEffect(() => {
    if (!sessionId || manualPausedRef.current) return undefined;
    const typingActive = hasTypingActivity();
    const active = Boolean(isPlaying) || typingActive;
    if (active && status !== "active") {
      void resumeSession();
      return undefined;
    }
    if (!active && status === "active") {
      void pauseSession("idle");
    }
    return undefined;
  }, [hasTypingActivity, isPlaying, pauseSession, resumeSession, sessionId, status]);

  useEffect(() => {
    if (typeof document === "undefined" || !sessionId) return undefined;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        if (!manualPausedRef.current) {
          void pauseSession("hidden");
        }
        void flushHeartbeat();
      } else if (document.visibilityState === "visible" && !manualPausedRef.current) {
        const active = Boolean(isPlaying) || hasTypingActivity();
        if (active) {
          void resumeSession();
        }
      }
    };

    const handlePageHide = () => {
      void finishSession("page_unload");
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handlePageHide);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handlePageHide);
    };
  }, [finishSession, flushHeartbeat, hasTypingActivity, isPlaying, pauseSession, resumeSession, sessionId]);

  const timerLabel = useMemo(() => formatLearningDuration(effectiveSeconds), [effectiveSeconds]);
  const statusLabel = useMemo(() => formatStatusLabel(status), [status]);
  const pauseManually = useCallback(() => pauseSession("manual"), [pauseSession]);
  const resumeManually = useCallback(() => resumeSession(), [resumeSession]);

  return {
    sessionId,
    effectiveSeconds,
    pausedSeconds,
    timerLabel,
    status,
    statusLabel,
    busy,
    manualPaused: manualPausedRef.current,
    registerTypingActivity,
    pauseManually,
    resumeManually,
    finishSession,
    flushHeartbeat,
  };
}
