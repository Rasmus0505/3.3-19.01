/**
 * DiscussSection — Phase 4: discuss.
 *
 * 1. Auto-fetches a discussion script (teacher + student dialogue).
 * 2. Plays it sequentially via TTS (same engine as ExplainSection).
 * 3. User can type and send messages at any time → real-time AI teacher reply.
 * 4. "结束讨论" advances to next section.
 */
import { useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "../../../../shared/ui";

const ROLE_VOICES = {
  teacher: "longxiaochun",
  student:  "longxiaoxia",
};

function estimateDurationMs(text, speed = 1) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean).length;
  return Math.round(Math.max(2000, Math.min(8000, words * 380)) / speed);
}

export const DiscussSection = forwardRef(function DiscussSection(
  {
    section,
    course,
    apiCall,
    ttsEnabled = true,
    speed = 1,
    onSpeechLine,   // (text, speaker, speechId)
    onSpeechEnd,    // (speechId)
    onPauseChange,
    onMessage,      // user sends a message → parent adds to roundtable + calls AI
    onComplete,
    loading: parentLoading,
  },
  ref,
) {
  const [status, setStatus] = useState("loading"); // loading | playing | paused | done | error
  const [actions, setActions] = useState([]);
  const [draft, setDraft] = useState("");

  const audioRef = useRef(null);
  const timerRef = useRef(null);
  const abortRef = useRef(false);
  const isPausedRef = useRef(false);
  const pausedRemainingRef = useRef(0);
  const pausedTimerStartRef = useRef(0);
  const pendingSettleRef = useRef(null);
  const speedRef = useRef(speed);
  speedRef.current = speed;

  // ── pause/resume exposed to parent ──────────────────────────
  useImperativeHandle(ref, () => ({
    pause() {
      if (isPausedRef.current) return;
      isPausedRef.current = true;
      if (audioRef.current && !audioRef.current.paused) audioRef.current.pause();
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
        const elapsed = Date.now() - pausedTimerStartRef.current;
        pausedRemainingRef.current = Math.max(0, pausedRemainingRef.current - elapsed);
      }
      setStatus("paused");
      onPauseChange?.(true);
    },
    resume() {
      if (!isPausedRef.current) return;
      isPausedRef.current = false;
      if (audioRef.current && audioRef.current.paused) {
        audioRef.current.play().catch(() => {
          audioRef.current = null;
          if (pendingSettleRef.current && pausedRemainingRef.current > 0) {
            pausedTimerStartRef.current = Date.now();
            timerRef.current = setTimeout(pendingSettleRef.current, pausedRemainingRef.current);
          } else {
            pendingSettleRef.current?.();
          }
        });
      } else if (pausedRemainingRef.current > 0 && pendingSettleRef.current) {
        pausedTimerStartRef.current = Date.now();
        timerRef.current = setTimeout(pendingSettleRef.current, pausedRemainingRef.current);
      }
      setStatus("playing");
      onPauseChange?.(false);
    },
  }), [onPauseChange]);

  // ── Fetch discuss script ─────────────────────────────────────
  useEffect(() => {
    abortRef.current = false;
    isPausedRef.current = false;
    if (!apiCall || !section) return;

    setStatus("loading");
    setActions([]);

    const teacher = course?.participants?.find((p) => p.role === "teacher");
    const students = course?.participants?.filter((p) => p.role === "student") || [];

    apiCall("/api/llm/reading-course/generate-discuss", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        section_id: section.id,
        section_text: section.rewritten_text || "",
        quiz_questions: section.quiz || [],
        article_title: course?.article_title || "",
        teacher_name: teacher?.name || "Coach Mira",
        student_names: students.map((s) => s.name),
        target_level: course?.target_level || "B1",
      }),
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data) => {
        if (abortRef.current) return;
        const acts = Array.isArray(data.actions) ? data.actions : [];
        setActions(acts);
        setStatus(acts.length > 0 ? "playing" : "done");
      })
      .catch((err) => {
        console.warn("[DiscussSection] generate-discuss failed:", err?.message);
        if (!abortRef.current) setStatus("error");
      });

    return () => { abortRef.current = true; };
  }, [section?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const scheduleTimer = useCallback((fn, ms) => {
    pendingSettleRef.current = fn;
    pausedRemainingRef.current = ms;
    pausedTimerStartRef.current = Date.now();
    if (!isPausedRef.current) timerRef.current = setTimeout(fn, ms);
  }, []);

  // ── Sequential action processor ─────────────────────────────
  const processAction = useCallback(
    (index, actionList) => {
      if (abortRef.current) return;
      if (index >= actionList.length) {
        setStatus("done");
        pendingSettleRef.current = null;
        return;
      }

      const action = actionList[index];
      const next = () => processAction(index + 1, actionList);

      if (action.type === "pause") {
        scheduleTimer(next, action.duration_ms || 800);
        return;
      }

      if (action.type === "speech" && action.text) {
        const speechId = `discuss-${index}-${Date.now()}`;
        onSpeechLine?.(action.text, action.speaker || "teacher", speechId);

        const settle = () => {
          if (abortRef.current) return;
          pendingSettleRef.current = null;
          onSpeechEnd?.(speechId);
          next();
        };

        if (apiCall && ttsEnabled) {
          const voice = ROLE_VOICES[String(action.speaker || "teacher").toLowerCase()] || ROLE_VOICES.teacher;
          apiCall("/api/tts/synthesize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: action.text, voice, model: "cosyvoice-v1", language_type: "English" }),
          })
            .then((res) => (res.ok ? res.json() : Promise.reject()))
            .then((data) => {
              if (abortRef.current) return;
              const audio = new Audio(data.audio_url);
              audio.playbackRate = speedRef.current;
              audioRef.current = audio;
              pendingSettleRef.current = settle;
              pausedRemainingRef.current = 0;
              audio.onended = () => { audioRef.current = null; settle(); };
              audio.onerror = () => { audioRef.current = null; scheduleTimer(settle, estimateDurationMs(action.text, speedRef.current)); };
              if (isPausedRef.current) { audio.load(); }
              else { audio.play().catch(() => { audioRef.current = null; scheduleTimer(settle, estimateDurationMs(action.text, speedRef.current)); }); }
            })
            .catch(() => scheduleTimer(settle, estimateDurationMs(action.text, speedRef.current)));
          return;
        }

        scheduleTimer(settle, estimateDurationMs(action.text, speedRef.current));
        return;
      }

      scheduleTimer(next, 300);
    },
    [apiCall, ttsEnabled, onSpeechLine, onSpeechEnd, scheduleTimer],
  );

  useEffect(() => {
    if (status !== "playing" || actions.length === 0) return;
    processAction(0, actions);
    return () => {
      abortRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    };
  }, [status === "playing" && actions.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [speed]);

  useEffect(() => {
    return () => {
      abortRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    };
  }, []);

  const handleSend = useCallback(() => {
    if (!draft.trim() || parentLoading) return;
    onMessage?.(draft.trim());
    setDraft("");
  }, [draft, parentLoading, onMessage]);

  return (
    <div className="v3-discuss">
      {status === "loading" && (
        <div className="v3-discuss__loading">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
          <span>正在准备讨论…</span>
        </div>
      )}
      {status === "error" && (
        <div className="v3-discuss__error">
          <p>讨论加载失败</p>
        </div>
      )}
      {status === "done" && (
        <div className="v3-discuss__done-hint">
          <p>讨论已结束，你也可以加入聊聊</p>
        </div>
      )}

      {/* User compose area — always visible after loading */}
      {(status === "playing" || status === "paused" || status === "done") && (
        <div className="v3-discuss__compose">
          <textarea
            className="v3-discuss__input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="加入讨论…（Ctrl+Enter 发送）"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <div className="v3-discuss__actions">
            <Button
              size="sm"
              onClick={handleSend}
              disabled={!draft.trim() || parentLoading}
            >
              {parentLoading ? "回复中…" : "发送"}
            </Button>
            <Button size="sm" variant="outline" onClick={onComplete}>
              结束讨论 →
            </Button>
          </div>
        </div>
      )}
    </div>
  );
});


