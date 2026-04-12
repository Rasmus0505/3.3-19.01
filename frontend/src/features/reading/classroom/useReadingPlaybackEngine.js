import { useEffect, useMemo, useReducer, useRef } from "react";
import { buildSceneActionSequence, READING_ACTION_TYPES } from "./readingActionTypes";
import {
  createReadingPlaybackState,
  playbackStateToRuntimePatch,
  READING_PLAYBACK_EVENTS,
  readingPlaybackReducer,
} from "./readingPlaybackMachine";

// Estimate reading duration when TTS is unavailable
function estimateSpeechDurationMs(text) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(2000, Math.min(7000, words * 380));
}

export const READING_CLASSROOM_TTS_MODEL = "qwen3-tts-flash";

// Aliyun official system voices chosen to match the current classroom avatars.
const AVATAR_VOICES = {
  teacher: "Jennifer",
  assistant: "Ryan",
  "student-curious": "Mia",
  "student-thinker": "Aiden",
};

function normalizeActionAvatarKey(action) {
  const explicitAvatarKey = String(action?.avatarKey || "").trim().toLowerCase();
  if (explicitAvatarKey) return explicitAvatarKey;
  const normalizedRole = String(action?.role || "").trim().toLowerCase();
  if (normalizedRole === "assistant" || normalizedRole === "user") return normalizedRole;
  if (normalizedRole === "student") return "student-curious";
  return "teacher";
}

export function getReadingClassroomTtsConfig(action) {
  if (!action) return null;
  if (String(action.role || "").trim().toLowerCase() === "user") return null;

  const avatarKey = normalizeActionAvatarKey(action);
  const voice = AVATAR_VOICES[avatarKey] || AVATAR_VOICES.teacher;
  return {
    model: READING_CLASSROOM_TTS_MODEL,
    voice,
    languageType: "English",
  };
}

// Scenes that require user interaction — pause before them, don't auto-advance
const INTERACTIVE_SCENE_TYPES = new Set(["checkpoint", "output"]);

export function useReadingPlaybackEngine({ course, apiCall, onPersistPlayback }) {
  const [state, dispatch] = useReducer(readingPlaybackReducer, course, createReadingPlaybackState);

  // processingRef prevents re-entrant action execution.
  // The useEffect that drives playback must not fire again until the current action settles.
  const processingRef = useRef(false);
  const timerRef = useRef(null);
  const audioRef = useRef(null);
  const persistedRef = useRef("");
  const courseIdentity = `${course?.article_id || ""}::${course?.generated_at || ""}`;

  // Reload state when the course changes identity (new article generated)
  useEffect(() => {
    processingRef.current = false;
    dispatch({ type: READING_PLAYBACK_EVENTS.LOAD_COURSE, course });
  }, [courseIdentity]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist playback state to IndexedDB via callback (debounced via JSON equality check)
  useEffect(() => {
    const patch = JSON.stringify(playbackStateToRuntimePatch(state));
    if (patch === persistedRef.current) return;
    persistedRef.current = patch;
    onPersistPlayback?.(playbackStateToRuntimePatch(state));
  }, [onPersistPlayback, state]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      processingRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    };
  }, []);

  const scenes = course?.scenes || [];
  const activeScene = scenes[state.activeSceneIndex] || null;
  const sceneActions = useMemo(
    () => (activeScene ? buildSceneActionSequence(activeScene) : []),
    [activeScene],
  );

  // Core playback loop.
  // Triggered only by ACTION_SETTLED (sequence bump) and mode changes — NOT by cursor changes.
  // processingRef.current guards against re-entrant execution.
  useEffect(() => {
    if (state.mode !== "playing") {
      processingRef.current = false;
      return;
    }
    if (!activeScene) return;
    if (processingRef.current) return; // already handling an action

    const cursor = Number(state.actionCursorByScene?.[activeScene.id]) || 0;
    const nextAction = sceneActions[cursor];

    // ── All actions in this scene done → auto-advance ───────────────────────
    if (!nextAction) {
      processingRef.current = true;
      const nextSceneIndex = state.activeSceneIndex + 1;
      if (nextSceneIndex >= scenes.length) {
        processingRef.current = false;
        return; // course complete
      }
      const nextScene = scenes[nextSceneIndex];
      const delay = INTERACTIVE_SCENE_TYPES.has(nextScene?.type) ? 800 : 1500;
      const nextMode = INTERACTIVE_SCENE_TYPES.has(nextScene?.type) ? "paused" : "playing";
      timerRef.current = setTimeout(() => {
        processingRef.current = false;
        dispatch({
          type: READING_PLAYBACK_EVENTS.GO_TO_SCENE,
          index: nextSceneIndex,
          sceneId: nextScene.id,
          mode: nextMode,
        });
      }, delay);
      return;
    }

    // ── Mark as processing and advance cursor ───────────────────────────────
    processingRef.current = true;
    dispatch({
      type: READING_PLAYBACK_EVENTS.REVEAL_NEXT_ACTION,
      sceneId: activeScene.id,
      totalActions: sceneActions.length,
    });

    // settle: called when an action finishes to allow the next to run
    const settle = () => {
      processingRef.current = false;
      dispatch({ type: READING_PLAYBACK_EVENTS.ACTION_SETTLED });
    };

    // discussion → enter live mode
    if (nextAction.type === READING_ACTION_TYPES.DISCUSSION) {
      dispatch({ type: READING_PLAYBACK_EVENTS.ENTER_LIVE, sceneId: activeScene.id });
      processingRef.current = false;
      dispatch({ type: READING_PLAYBACK_EVENTS.ACTION_SETTLED });
      return;
    }

    // quiz / output → pause for user
    if (nextAction.type === READING_ACTION_TYPES.QUIZ || nextAction.type === READING_ACTION_TYPES.OUTPUT) {
      dispatch({ type: READING_PLAYBACK_EVENTS.PAUSE });
      processingRef.current = false;
      dispatch({ type: READING_PLAYBACK_EVENTS.ACTION_SETTLED });
      return;
    }

    // spotlight → fire-and-forget
    if (nextAction.type === READING_ACTION_TYPES.SPOTLIGHT) {
      timerRef.current = setTimeout(settle, 600);
      return;
    }

    // speech → TTS then settle
    if (nextAction.type === READING_ACTION_TYPES.SPEECH && nextAction.text) {
      dispatch({ type: READING_PLAYBACK_EVENTS.SET_ACTIVE_SPEECH, actionId: nextAction.id });

      const onSpeechEnd = () => {
        audioRef.current = null;
        dispatch({ type: READING_PLAYBACK_EVENTS.SET_ACTIVE_SPEECH, actionId: null });
        settle();
      };

      if (apiCall && state.ttsEnabled) {
        const ttsConfig = getReadingClassroomTtsConfig(nextAction);
        if (ttsConfig) {
          apiCall("/api/tts/synthesize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: nextAction.text,
              voice: ttsConfig.voice,
              model: ttsConfig.model,
              language_type: ttsConfig.languageType,
            }),
          })
            .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`TTS HTTP ${res.status}`))))
            .then((data) => {
              const src = data?.audio_url;
              if (!src) throw new Error("no audio_url");
              const audio = new Audio(src);
              audioRef.current = audio;
              audio.onended = onSpeechEnd;
              audio.onerror = (e) => {
                console.warn("[TTS] audio error, falling back to timer:", e?.type);
                audioRef.current = null;
                dispatch({ type: READING_PLAYBACK_EVENTS.SET_ACTIVE_SPEECH, actionId: null });
                settle();
              };
              // play() returns a promise; autoplay may be blocked on first page load
              const playPromise = audio.play();
              if (playPromise !== undefined) {
                playPromise.catch((err) => {
                  console.warn("[TTS] autoplay blocked, using timer fallback:", err?.message);
                  audioRef.current = null;
                  dispatch({ type: READING_PLAYBACK_EVENTS.SET_ACTIVE_SPEECH, actionId: null });
                  timerRef.current = setTimeout(settle, estimateSpeechDurationMs(nextAction.text));
                });
              }
            })
            .catch((err) => {
              console.warn("[TTS] synthesis failed, using timer:", err?.message);
              dispatch({ type: READING_PLAYBACK_EVENTS.SET_ACTIVE_SPEECH, actionId: null });
              timerRef.current = setTimeout(settle, estimateSpeechDurationMs(nextAction.text));
            });
          return;
        }
      }

      // TTS disabled — timer fallback
      timerRef.current = setTimeout(() => {
        dispatch({ type: READING_PLAYBACK_EVENTS.SET_ACTIVE_SPEECH, actionId: null });
        settle();
      }, estimateSpeechDurationMs(nextAction.text));
      return;
    }

    // Unknown action type
    timerRef.current = setTimeout(settle, 400);
  }, [
    // Only re-run on mode changes and explicit ACTION_SETTLED ticks (sequence).
    // Deliberately NOT including state.actionCursorByScene to prevent re-entrant loops.
    state.mode,
    state.sequence,
    state.activeSceneIndex,
    state.ttsEnabled,
    activeScene,
    sceneActions,
    scenes,
    apiCall,
  ]);

  const engineActions = {
    start() {
      processingRef.current = false;
      dispatch({ type: READING_PLAYBACK_EVENTS.START });
    },
    pause() {
      processingRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      dispatch({ type: READING_PLAYBACK_EVENTS.PAUSE });
    },
    resume() {
      processingRef.current = false;
      dispatch({ type: READING_PLAYBACK_EVENTS.RESUME });
    },
    setMode(mode) {
      dispatch({ type: READING_PLAYBACK_EVENTS.SET_MODE, mode });
    },
    goToScene(index, sceneId) {
      processingRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      dispatch({ type: READING_PLAYBACK_EVENTS.GO_TO_SCENE, index, sceneId, mode: "paused" });
    },
    enterLive(sceneId) {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      dispatch({ type: READING_PLAYBACK_EVENTS.ENTER_LIVE, sceneId });
    },
    exitLive(nextMode = "playing") {
      processingRef.current = false;
      dispatch({ type: READING_PLAYBACK_EVENTS.EXIT_LIVE, nextMode });
    },
    toggleTTS(enabled) {
      dispatch({ type: READING_PLAYBACK_EVENTS.TOGGLE_TTS, enabled });
    },
  };

  return { playbackState: state, activeScene, sceneActions, actions: engineActions };
}
