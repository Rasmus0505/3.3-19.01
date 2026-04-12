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
  return Math.max(1200, Math.min(6000, words * 340));
}

// Default voice mapping per role. Falls back to a safe default.
const ROLE_VOICES = {
  teacher: "longxiaochun",
  assistant: "longshuo",
  student: "loongstella",
};

function getVoiceForRole(role) {
  return ROLE_VOICES[String(role || "").toLowerCase()] || ROLE_VOICES.teacher;
}

export function useReadingPlaybackEngine({ course, apiCall, onPersistPlayback }) {
  const [state, dispatch] = useReducer(readingPlaybackReducer, course, createReadingPlaybackState);
  const timerRef = useRef(null);
  const audioRef = useRef(null);
  const persistedRef = useRef("");
  const courseIdentity = `${course?.article_id || ""}::${course?.generated_at || ""}`;

  // Reload state when the course changes identity (new article generated)
  useEffect(() => {
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
      if (timerRef.current) clearTimeout(timerRef.current);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const scenes = course?.scenes || [];
  const activeScene = scenes[state.activeSceneIndex] || null;
  const sceneActions = useMemo(
    () => (activeScene ? buildSceneActionSequence(activeScene) : []),
    [activeScene],
  );

  // Core playback loop — runs whenever mode=playing or a prior action settles
  useEffect(() => {
    if (!activeScene || state.mode !== "playing") return;

    const cursor = Number(state.actionCursorByScene?.[activeScene.id]) || 0;
    const nextAction = sceneActions[cursor];
    if (!nextAction) return;

    // Advance cursor immediately so the action becomes visible
    dispatch({
      type: READING_PLAYBACK_EVENTS.REVEAL_NEXT_ACTION,
      sceneId: activeScene.id,
      totalActions: sceneActions.length,
    });

    // discussion action → enter live mode and wait for user
    if (nextAction.type === READING_ACTION_TYPES.DISCUSSION) {
      dispatch({ type: READING_PLAYBACK_EVENTS.ENTER_LIVE, sceneId: activeScene.id });
      dispatch({ type: READING_PLAYBACK_EVENTS.ACTION_SETTLED });
      return;
    }

    // quiz / output action → pause so user can complete the task
    if (
      nextAction.type === READING_ACTION_TYPES.QUIZ ||
      nextAction.type === READING_ACTION_TYPES.OUTPUT
    ) {
      dispatch({ type: READING_PLAYBACK_EVENTS.PAUSE });
      dispatch({ type: READING_PLAYBACK_EVENTS.ACTION_SETTLED });
      return;
    }

    // spotlight action → fire-and-forget, short pause then continue
    if (nextAction.type === READING_ACTION_TYPES.SPOTLIGHT) {
      timerRef.current = setTimeout(() => {
        dispatch({ type: READING_PLAYBACK_EVENTS.ACTION_SETTLED });
      }, 600);
      return;
    }

    // speech action → TTS or timer fallback
    if (nextAction.type === READING_ACTION_TYPES.SPEECH && nextAction.text) {
      dispatch({ type: READING_PLAYBACK_EVENTS.SET_ACTIVE_SPEECH, actionId: nextAction.id });

      const settle = () => {
        dispatch({ type: READING_PLAYBACK_EVENTS.SET_ACTIVE_SPEECH, actionId: null });
        dispatch({ type: READING_PLAYBACK_EVENTS.ACTION_SETTLED });
      };

      if (apiCall && state.ttsEnabled) {
        const voice = getVoiceForRole(nextAction.role);
        apiCall("/api/tts/synthesize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: nextAction.text,
            voice,
            language_type: "English",
          }),
        })
          .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`TTS ${res.status}`))))
          .then((data) => {
            if (!data?.audio_url) throw new Error("no audio_url");
            const audio = new Audio(data.audio_url);
            audioRef.current = audio;
            audio.onended = settle;
            audio.onerror = () => {
              audioRef.current = null;
              settle();
            };
            audio.play().catch(() => {
              audioRef.current = null;
              settle();
            });
          })
          .catch(() => {
            // TTS failed — fall back to estimated duration
            timerRef.current = setTimeout(settle, estimateSpeechDurationMs(nextAction.text));
          });
        return;
      }

      // TTS disabled or no apiCall — use timing fallback
      timerRef.current = setTimeout(settle, estimateSpeechDurationMs(nextAction.text));
      return;
    }

    // Unknown action type — short delay and continue
    timerRef.current = setTimeout(() => {
      dispatch({ type: READING_PLAYBACK_EVENTS.ACTION_SETTLED });
    }, 400);
  }, [
    activeScene,
    sceneActions,
    state.actionCursorByScene,
    state.mode,
    state.sequence,
    state.ttsEnabled,
    apiCall,
  ]);

  const engineActions = {
    start() {
      dispatch({ type: READING_PLAYBACK_EVENTS.START });
    },
    pause() {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      dispatch({ type: READING_PLAYBACK_EVENTS.PAUSE });
    },
    resume() {
      dispatch({ type: READING_PLAYBACK_EVENTS.RESUME });
    },
    setMode(mode) {
      dispatch({ type: READING_PLAYBACK_EVENTS.SET_MODE, mode });
    },
    goToScene(index, sceneId) {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      dispatch({ type: READING_PLAYBACK_EVENTS.GO_TO_SCENE, index, sceneId, mode: "paused" });
    },
    revealNext(sceneId, totalActions) {
      dispatch({ type: READING_PLAYBACK_EVENTS.REVEAL_NEXT_ACTION, sceneId, totalActions });
    },
    enterLive(sceneId) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      dispatch({ type: READING_PLAYBACK_EVENTS.ENTER_LIVE, sceneId });
    },
    exitLive(nextMode = "paused") {
      dispatch({ type: READING_PLAYBACK_EVENTS.EXIT_LIVE, nextMode });
    },
    toggleTTS(enabled) {
      dispatch({ type: READING_PLAYBACK_EVENTS.TOGGLE_TTS, enabled });
    },
  };

  return {
    playbackState: state,
    activeScene,
    sceneActions,
    actions: engineActions,
  };
}
