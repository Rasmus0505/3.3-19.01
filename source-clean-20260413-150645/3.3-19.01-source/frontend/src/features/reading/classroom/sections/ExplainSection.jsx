/**
 * ExplainSection — Phase 2: explain.
 *
 * Supports:
 * - Pause/resume (TTS and timer-fallback)
 * - Playback speed (applied to timer fallback; TTS speed via audio.playbackRate)
 * - Spotlight on target word
 * - Precise activeSpeechId tracking via callbacks
 */
import { useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "../../../../shared/ui";
import { ReadingSection } from "./ReadingSection";

const ROLE_VOICES = {
  teacher: "longxiaochun",
  assistant: "longshuo",
  student: "longxiaoxia",
};

function estimateDurationMs(text, speed = 1) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean).length;
  const base = Math.max(2000, Math.min(8000, words * 380));
  return Math.round(base / speed);
}

export const ExplainSection = forwardRef(function ExplainSection(
  {
    section,
    course,
    confusedWords = [],
    colorMarks = [],
    apiCall,
    ttsEnabled = true,
    speed = 1,
    onSpeechLine,   // (text, speaker, speechId)
    onSpeechEnd,    // (speechId)
    onPauseChange,  // (isPaused: boolean)
    onComplete,
  },
  ref,
) {
  const [status, setStatus] = useState("loading"); // loading | playing | paused | done | error
  const [actions, setActions] = useState([]);
  const [spotlitWord, setSpotlitWord] = useState(null);

  const audioRef = useRef(null);
  const timerRef = useRef(null);
  const abortRef = useRef(false);
  const isPausedRef = useRef(false);
  const pausedRemainingRef = useRef(0);  // ms remaining when timer was paused
  const pausedTimerStartRef = useRef(0); // timestamp when timer started
  const pendingSettleRef = useRef(null); // settle fn for the action we paused mid-way
  const speedRef = useRef(speed);
  speedRef.current = speed;

  // ── Expose pause/resume to parent via ref ─────────────────────────────────
  useImperativeHandle(ref, () => ({
    pause() {
      if (isPausedRef.current) return;
      isPausedRef.current = true;

      // Pause audio
      if (audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
      }

      // Pause timer — save remaining time
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

      // Resume audio
      if (audioRef.current && audioRef.current.paused) {
        audioRef.current.play().catch(() => {
          // Audio element became stale — fall back to timer
          audioRef.current = null;
          if (pendingSettleRef.current && pausedRemainingRef.current > 0) {
            pausedTimerStartRef.current = Date.now();
            timerRef.current = setTimeout(pendingSettleRef.current, pausedRemainingRef.current);
          } else {
            pendingSettleRef.current?.();
          }
        });
      } else if (pausedRemainingRef.current > 0 && pendingSettleRef.current) {
        // Resume timer
        pausedTimerStartRef.current = Date.now();
        timerRef.current = setTimeout(pendingSettleRef.current, pausedRemainingRef.current);
      }

      setStatus("playing");
      onPauseChange?.(false);
    },
  }), [onPauseChange]);

  // ── Fetch explain actions ─────────────────────────────────────────────────
  useEffect(() => {
    abortRef.current = false;
    isPausedRef.current = false;
    if (!apiCall || !section) return;

    setStatus("loading");
    setActions([]);
    setSpotlitWord(null);

    const teacher = course?.participants?.find((p) => p.role === "teacher");

    apiCall("/api/llm/reading-course/generate-explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        section_id: section.id,
        section_text: section.rewritten_text || "",
        confused_words: confusedWords,
        color_marks: colorMarks,
        default_spotlight_words: section.spotlight_words || [],
        target_level: course?.target_level || "B1",
        article_title: course?.article_title || "",
        teacher_name: teacher?.name || "Coach Mira",
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
        console.warn("[ExplainSection] generate-explain failed:", err?.message);
        if (!abortRef.current) setStatus("error");
      });

    return () => { abortRef.current = true; };
  }, [section?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Helper: schedule a timer that respects pause state
  const scheduleTimer = useCallback((fn, ms) => {
    pendingSettleRef.current = fn;
    pausedRemainingRef.current = ms;
    pausedTimerStartRef.current = Date.now();
    if (!isPausedRef.current) {
      timerRef.current = setTimeout(fn, ms);
    }
    // If paused, timer will start on resume()
  }, []);

  // ── Sequential action processor ───────────────────────────────────────────
  const processAction = useCallback(
    (index, actionList) => {
      if (abortRef.current) return;
      if (index >= actionList.length) {
        setSpotlitWord(null);
        setStatus("done");
        pendingSettleRef.current = null;
        return;
      }

      const action = actionList[index];
      const next = () => processAction(index + 1, actionList);

      if (action.type === "spotlight") {
        setSpotlitWord(action.target_word || null);
        scheduleTimer(next, 600);
        return;
      }

      if (action.type === "pause") {
        scheduleTimer(next, action.duration_ms || 1500);
        return;
      }

      if (action.type === "speech" && action.text) {
        const speechId = `speech-${index}-${Date.now()}`;
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
            body: JSON.stringify({
              text: action.text,
              voice,
              model: "cosyvoice-v1",
              language_type: "English",
            }),
          })
            .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`TTS ${res.status}`))))
            .then((data) => {
              if (abortRef.current) return;
              const audio = new Audio(data.audio_url);
              audio.playbackRate = speedRef.current;
              audioRef.current = audio;
              pendingSettleRef.current = settle;
              pausedRemainingRef.current = 0; // audio handles its own timing

              audio.onended = () => { audioRef.current = null; settle(); };
              audio.onerror = () => {
                audioRef.current = null;
                scheduleTimer(settle, estimateDurationMs(action.text, speedRef.current));
              };

              if (isPausedRef.current) {
                // Will resume when resume() is called — audio loaded but not playing
                audio.load();
              } else {
                audio.play().catch(() => {
                  audioRef.current = null;
                  scheduleTimer(settle, estimateDurationMs(action.text, speedRef.current));
                });
              }
            })
            .catch(() => {
              scheduleTimer(settle, estimateDurationMs(action.text, speedRef.current));
            });
          return;
        }

        // TTS disabled — timer fallback
        scheduleTimer(settle, estimateDurationMs(action.text, speedRef.current));
        return;
      }

      // Unknown action — skip
      scheduleTimer(next, 300);
    },
    [apiCall, ttsEnabled, onSpeechLine, onSpeechEnd, scheduleTimer],
  );

  // Start processing when actions loaded
  useEffect(() => {
    if (status !== "playing" || actions.length === 0) return;
    processAction(0, actions);

    return () => {
      abortRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    };
  }, [status === "playing" && actions.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update audio playback rate when speed changes
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [speed]);

  // Auto-advance 2s after done
  const doneTimerRef = useRef(null);
  useEffect(() => {
    if (status === "done") {
      doneTimerRef.current = setTimeout(() => {
        if (!abortRef.current) onComplete?.();
      }, 2000);
    }
    return () => { if (doneTimerRef.current) clearTimeout(doneTimerRef.current); };
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (doneTimerRef.current) clearTimeout(doneTimerRef.current);
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    };
  }, []);

  return (
    <div className="v3-explain">
      {status === "loading" && (
        <div className="v3-explain__loading">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
          <span>Coach Mira 正在准备讲解…</span>
        </div>
      )}
      {status === "error" && (
        <div className="v3-explain__error">
          <p>讲解加载失败，请跳过</p>
        </div>
      )}
      {(status === "playing" || status === "paused" || status === "done") && (
        <div className="v3-explain__body">
          <ReadingSection
            section={section}
            rewriteMappings={course?.rewrite_mappings || []}
            confusedWords={[]}
            spotlitWord={spotlitWord}
            onWordClick={() => {}}
            onMarkConfused={() => {}}
            onAddToWordbook={() => {}}
            apiCall={null}
            targetLevel={course?.target_level || "B1"}
          />

          {/* Done overlay */}
          <AnimatePresence>
            {status === "done" && (
              <motion.div
                className="v3-explain-complete"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
              >
                <CheckCircle2 className="v3-explain-complete__icon" />
                <p className="v3-explain-complete__title">讲解完成</p>
                <p className="v3-explain-complete__sub">即将进入做题…</p>
                <Button size="sm" onClick={() => { if (doneTimerRef.current) clearTimeout(doneTimerRef.current); onComplete?.(); }}>
                  立即进入做题 →
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
});
