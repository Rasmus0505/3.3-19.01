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
  const executionRef = useRef(0);
  const persistedRef = useRef("");
  const courseIdentity = `${course?.article_id || ""}::${course?.generated_at || ""}`;

  const invalidateExecution = () => {
    executionRef.current += 1;
    processingRef.current = false;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current = null;
    }
  };

  // Reload state when the course changes identity (new article generated)
  useEffect(() => {
    invalidateExecution();
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
      invalidateExecution();
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
    const pendingAction =
      state.pendingSpeechActionId && state.pendingSpeechSceneId === activeScene.id
        ? sceneActions.find(
            (action) =>
              action.id === state.pendingSpeechActionId &&
              action.type === READING_ACTION_TYPES.SPEECH,
          ) || null
        : null;
    const nextAction = pendingAction || sceneActions[cursor];

    if (state.pendingSpeechActionId && !pendingAction && state.pendingSpeechSceneId === activeScene.id) {
      dispatch({ type: READING_PLAYBACK_EVENTS.CLEAR_PENDING_SPEECH });
      return;
    }

    // ── All actions in this scene done → auto-advance ───────────────────────
    if (!nextAction) {
      processingRef.current = true;
      const executionId = executionRef.current + 1;
      executionRef.current = executionId;
      const nextSceneIndex = state.activeSceneIndex + 1;
      if (nextSceneIndex >= scenes.length) {
        processingRef.current = false;
        return; // course complete
      }
      const nextScene = scenes[nextSceneIndex];
      const delay = INTERACTIVE_SCENE_TYPES.has(nextScene?.type) ? 800 : 1500;
      const nextMode = INTERACTIVE_SCENE_TYPES.has(nextScene?.type) ? "paused" : "playing";
      timerRef.current = setTimeout(() => {
        if (executionId !== executionRef.current) return;
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

    processingRef.current = true;
    const executionId = executionRef.current + 1;
    executionRef.current = executionId;
    const isResumingPendingSpeech = Boolean(pendingAction);

    if (!isResumingPendingSpeech) {
      dispatch({
        type: READING_PLAYBACK_EVENTS.REVEAL_NEXT_ACTION,
        sceneId: activeScene.id,
        totalActions: sceneActions.length,
      });
    }

    // settle: called when an action finishes to allow the next to run
    const settle = ({ clearPendingSpeech = false } = {}) => {
      if (executionId !== executionRef.current) return;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (audioRef.current) {
        audioRef.current.onended = null;
        audioRef.current.onerror = null;
        audioRef.current = null;
      }
      dispatch({ type: READING_PLAYBACK_EVENTS.SET_ACTIVE_SPEECH, actionId: null });
      if (clearPendingSpeech) {
        dispatch({ type: READING_PLAYBACK_EVENTS.CLEAR_PENDING_SPEECH });
      }
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
      timerRef.current = setTimeout(() => settle(), 600);
      return;
    }

    // speech → TTS then settle
    if (nextAction.type === READING_ACTION_TYPES.SPEECH && nextAction.text) {
      if (!isResumingPendingSpeech) {
        dispatch({
          type: READING_PLAYBACK_EVENTS.SET_PENDING_SPEECH,
          actionId: nextAction.id,
          sceneId: activeScene.id,
        });
      }
      dispatch({ type: READING_PLAYBACK_EVENTS.SET_ACTIVE_SPEECH, actionId: nextAction.id });

      const startTimerFallback = (reason) => {
        if (executionId !== executionRef.current) return;
        if (audioRef.current) {
          audioRef.current.onended = null;
          audioRef.current.onerror = null;
          audioRef.current = null;
        }
        if (reason) {
          console.warn("[TTS] using timer fallback:", reason);
        }
        timerRef.current = setTimeout(
          () => settle({ clearPendingSpeech: true }),
          estimateSpeechDurationMs(nextAction.text),
        );
      };

      const onSpeechEnd = () => {
        if (executionId !== executionRef.current) return;
        settle({ clearPendingSpeech: true });
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
              if (executionId !== executionRef.current) return;
              const src = data?.audio_url;
              if (!src) throw new Error("no audio_url");
              const audio = new Audio(src);
              audioRef.current = audio;
              audio.onended = onSpeechEnd;
              audio.onerror = (e) => {
                if (executionId !== executionRef.current) return;
                startTimerFallback(`audio error ${e?.type || "unknown"}`);
              };
              // play() returns a promise; autoplay may be blocked on first page load
              const playPromise = audio.play();
              if (playPromise !== undefined) {
                playPromise.catch((err) => {
                  if (executionId !== executionRef.current) return;
                  startTimerFallback(`autoplay blocked ${err?.message || "unknown"}`);
                });
              }
            })
            .catch((err) => {
              if (executionId !== executionRef.current) return;
              startTimerFallback(`synthesis failed ${err?.message || "unknown"}`);
            });
          return;
        }
      }

      // TTS disabled — timer fallback
      startTimerFallback("tts disabled");
      return;
    }

    // Unknown action type
    timerRef.current = setTimeout(() => settle(), 400);
  }, [
    // Only re-run on mode changes and explicit ACTION_SETTLED ticks (sequence).
    // Deliberately NOT including state.actionCursorByScene to prevent re-entrant loops.
    state.mode,
    state.sequence,
    state.activeSceneIndex,
    state.ttsEnabled,
    state.pendingSpeechActionId,
    state.pendingSpeechSceneId,
    activeScene,
    sceneActions,
    scenes,
    apiCall,
  ]);

  const engineActions = {
    start() {
      invalidateExecution();
      dispatch({ type: READING_PLAYBACK_EVENTS.START });
    },
    pause() {
      invalidateExecution();
      dispatch({ type: READING_PLAYBACK_EVENTS.PAUSE });
    },
    resume() {
      invalidateExecution();
      dispatch({ type: READING_PLAYBACK_EVENTS.RESUME });
    },
    setMode(mode) {
      dispatch({ type: READING_PLAYBACK_EVENTS.SET_MODE, mode });
    },
    goToScene(index, sceneId) {
      invalidateExecution();
      dispatch({ type: READING_PLAYBACK_EVENTS.GO_TO_SCENE, index, sceneId, mode: "paused" });
    },
    enterLive(sceneId) {
      invalidateExecution();
      dispatch({ type: READING_PLAYBACK_EVENTS.ENTER_LIVE, sceneId });
    },
    exitLive(nextMode = "playing") {
      invalidateExecution();
      dispatch({ type: READING_PLAYBACK_EVENTS.EXIT_LIVE, nextMode });
    },
    toggleTTS(enabled) {
      dispatch({ type: READING_PLAYBACK_EVENTS.TOGGLE_TTS, enabled });
    },
  };

  return { playbackState: state, activeScene, sceneActions, actions: engineActions };
}
