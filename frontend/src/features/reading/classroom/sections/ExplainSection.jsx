/**
 * ExplainSection — Phase 2: explain.
 *
 * Flow:
 * 1. On mount, fetch explain actions from /api/llm/reading-course/generate-explain
 * 2. Process actions sequentially:
 *    - spotlight: highlight target word in article text
 *    - speech: play TTS (or timer fallback), show in Roundtable
 *    - pause: wait duration_ms then continue
 * 3. On completion, show "进入做题" button
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { ReadingSection } from "./ReadingSection";

const ROLE_VOICES = {
  teacher: "longxiaochun",
  assistant: "longshuo",
  student: "longxiaoxia",
};

function estimateDurationMs(text) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(2000, Math.min(8000, words * 380));
}

export function ExplainSection({
  section,
  course,
  confusedWords = [],
  apiCall,
  ttsEnabled = true,
  onSpeechLine,        // callback: (text, speaker, speechId) → used by parent to update Roundtable + activeSpeechId
  onSpeechEnd,         // callback: (speechId) → clear activeSpeechId in parent
  onComplete,
}) {
  const [status, setStatus] = useState("loading"); // loading | playing | done | error
  const [actions, setActions] = useState([]);
  const [spotlitWord, setSpotlitWord] = useState(null);
  const [currentActionIndex, setCurrentActionIndex] = useState(-1);

  const audioRef = useRef(null);
  const timerRef = useRef(null);
  const abortRef = useRef(false);

  // ── Fetch explain actions ───────────────────────────────────────────────────
  useEffect(() => {
    abortRef.current = false;
    if (!apiCall || !section) return;

    setStatus("loading");
    setActions([]);
    setSpotlitWord(null);
    setCurrentActionIndex(-1);

    const teacher = course?.participants?.find((p) => p.role === "teacher");

    apiCall("/api/llm/reading-course/generate-explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        section_id: section.id,
        section_text: section.rewritten_text || "",
        confused_words: confusedWords,
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

    return () => {
      abortRef.current = true;
    };
  }, [section?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sequential action processor ────────────────────────────────────────────
  const processAction = useCallback(
    (index, actionList) => {
      if (abortRef.current) return;
      if (index >= actionList.length) {
        setSpotlitWord(null);
        setStatus("done");
        return;
      }

      setCurrentActionIndex(index);
      const action = actionList[index];
      const next = () => processAction(index + 1, actionList);

      if (action.type === "spotlight") {
        setSpotlitWord(action.target_word || null);
        // Spotlight is fire-and-forget, wait 600ms then continue
        timerRef.current = setTimeout(next, 600);
        return;
      }

      if (action.type === "pause") {
        timerRef.current = setTimeout(next, action.duration_ms || 1500);
        return;
      }

      if (action.type === "speech" && action.text) {
        const speechId = `speech-${index}-${Date.now()}`;
        // Notify parent: add message to Roundtable + set activeSpeechId
        onSpeechLine?.(action.text, action.speaker || "teacher", speechId);

        const settle = () => {
          if (abortRef.current) return;
          onSpeechEnd?.(speechId); // clear activeSpeechId in parent
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
              audioRef.current = audio;
              audio.onended = () => { audioRef.current = null; settle(); };
              audio.onerror = () => { audioRef.current = null; settle(); };
              audio.play().catch(() => {
                audioRef.current = null;
                timerRef.current = setTimeout(settle, estimateDurationMs(action.text));
              });
            })
            .catch(() => {
              timerRef.current = setTimeout(settle, estimateDurationMs(action.text));
            });
          return;
        }

        // TTS disabled — timer fallback
        timerRef.current = setTimeout(settle, estimateDurationMs(action.text));
        return;
      }

      // Unknown action — skip
      timerRef.current = setTimeout(next, 300);
    },
    [apiCall, ttsEnabled, onSpeechLine],
  );

  // Start processing when actions are loaded and status becomes "playing"
  useEffect(() => {
    if (status !== "playing" || actions.length === 0) return;
    processAction(0, actions);

    return () => {
      abortRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    };
  }, [status, actions]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    };
  }, []);

  return (
    <div className="v3-explain">
      {/* Loading state */}
      {status === "loading" && (
        <div className="v3-explain__loading">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
          <span>Coach Mira 正在准备讲解…</span>
        </div>
      )}

      {/* Error state */}
      {status === "error" && (
        <div className="v3-explain__error">
          <p>讲解加载失败，请跳过</p>
        </div>
      )}

      {/* Article with spotlight */}
      {(status === "playing" || status === "done") && (
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
      )}

      {/* Spotlight dim overlay — dims non-spotlit text when a word is focused */}
      {spotlitWord && (
        <div className="v3-explain__spotlight-active" aria-hidden="true" />
      )}
    </div>
  );
}
