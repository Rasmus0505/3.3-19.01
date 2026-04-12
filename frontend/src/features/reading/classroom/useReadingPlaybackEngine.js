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

// Valid CosyVoice v1 system preset voices on DashScope
const ROLE_VOICES = {
  teacher:   "longxiaochun",  // female, calm
  assistant: "longshuo",      // male, clear
  student:   "longxiaoxia",   // female, younger
};

function getVoiceForRole(role) {
  return ROLE_VOICES[String(role || "").toLowerCase()] || ROLE_VOICES.teacher;
}

// Scenes that require user interaction — do NOT auto-advance past them
const INTERACTIVE_SCENE_TYPES = new Set(["checkpoint", "output"]);

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

    // ── All actions in this scene are done ───────────────────────────────────
    if (!nextAction) {
      const nextSceneIndex = state.activeSceneIndex + 1;
      if (nextSceneIndex >= scenes.length) return; // course complete

      const nextScene = scenes[nextSceneIndex];
      if (INTERACTIVE_SCENE_TYPES.has(nextScene?.type)) {
        // Interactive scene: advance but pause so user can complete task
        timerRef.current = setTimeout(() => {
          dispatch({
            type: READING_PLAYBACK_EVENTS.GO_TO_SCENE,
            index: nextSceneIndex,
            sceneId: nextScene.id,
            mode: "paused",
          });
        }, 800);
      } else {
        // Non-interactive: auto-advance and keep playing after 1.5s pause
        timerRef.current = setTimeout(() => {
          dispatch({
            type: READING_PLAYBACK_EVENTS.GO_TO_SCENE,
            index: nextSceneIndex,
            sceneId: nextScene.id,
            mode: "playing",
          });
        }, 1500);
      }
      return;
    }

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

    // speech action → TTS (Alibaba Cloud) or timer fallback
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
            model: "cosyvoice-v1",   // standard preset model, not the vc clone model
            language_type: "English",
          }),
        })
          .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`TTS HTTP ${res.status}`))))
          .then((data) => {
            if (!data?.audio_url) throw new Error("no audio_url in response");
            const audio = new Audio(data.audio_url);
            audioRef.current = audio;
            audio.onended = () => { audioRef.current = null; settle(); };
            audio.onerror = () => { audioRef.current = null; settle(); };
            audio.play().catch((err) => {
              console.warn("[TTS] audio.play() failed:", err?.message);
              audioRef.current = null;
              settle();
            });
          })
          .catch((err) => {
            console.warn("[TTS] 合成失败，降级为计时器:", err?.message);
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
    scenes,
    state.actionCursorByScene,
    state.activeSceneIndex,
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
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
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
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      dispatch({ type: READING_PLAYBACK_EVENTS.GO_TO_SCENE, index, sceneId, mode: "paused" });
    },
    enterLive(sceneId) {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      dispatch({ type: READING_PLAYBACK_EVENTS.ENTER_LIVE, sceneId });
    },
    exitLive(nextMode = "playing") {
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
