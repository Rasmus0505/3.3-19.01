import { useEffect, useMemo, useReducer, useRef } from "react";
import { buildSceneActionSequence, READING_ACTION_TYPES } from "./readingActionTypes";
import {
  createReadingPlaybackState,
  playbackStateToRuntimePatch,
  READING_PLAYBACK_EVENTS,
  readingPlaybackReducer,
} from "./readingPlaybackMachine";

function estimateSpeechDurationMs(text) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(800, Math.min(5000, words * 320));
}

export function useReadingPlaybackEngine({ course, onPersistPlayback }) {
  const [state, dispatch] = useReducer(readingPlaybackReducer, course, createReadingPlaybackState);
  const timerRef = useRef(null);
  const persistedRef = useRef("");
  const courseIdentity = `${course?.article_id || ""}::${course?.generated_at || ""}`;

  useEffect(() => {
    dispatch({ type: READING_PLAYBACK_EVENTS.LOAD_COURSE, course });
  }, [courseIdentity]);

  useEffect(() => {
    const runtimePatch = JSON.stringify(playbackStateToRuntimePatch(state));
    if (runtimePatch === persistedRef.current) return;
    persistedRef.current = runtimePatch;
    onPersistPlayback?.(playbackStateToRuntimePatch(state));
  }, [onPersistPlayback, state]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const scenes = course?.scenes || [];
  const activeScene = scenes[state.activeSceneIndex] || null;
  const sceneActions = useMemo(() => (activeScene ? buildSceneActionSequence(activeScene) : []), [activeScene]);

  useEffect(() => {
    if (!activeScene || state.mode !== "playing") return;

    const cursor = Number(state.actionCursorByScene?.[activeScene.id]) || 0;
    const nextAction = sceneActions[cursor];
    if (!nextAction) return;

    dispatch({
      type: READING_PLAYBACK_EVENTS.REVEAL_NEXT_ACTION,
      sceneId: activeScene.id,
      totalActions: sceneActions.length,
    });

    if (nextAction.type === READING_ACTION_TYPES.DISCUSSION) {
      dispatch({ type: READING_PLAYBACK_EVENTS.ENTER_LIVE, sceneId: activeScene.id });
      dispatch({ type: READING_PLAYBACK_EVENTS.ACTION_SETTLED });
      return;
    }

    if (nextAction.type === READING_ACTION_TYPES.QUIZ || nextAction.type === READING_ACTION_TYPES.OUTPUT) {
      dispatch({ type: READING_PLAYBACK_EVENTS.PAUSE });
      dispatch({ type: READING_PLAYBACK_EVENTS.ACTION_SETTLED });
      return;
    }

    if (nextAction.type === READING_ACTION_TYPES.SPEECH) {
      dispatch({ type: READING_PLAYBACK_EVENTS.SET_ACTIVE_SPEECH, actionId: nextAction.id });
      if (typeof window !== "undefined" && "speechSynthesis" in window && state.ttsEnabled && nextAction.text) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(nextAction.text);
        utterance.rate = 0.96;
        utterance.onend = () => {
          dispatch({ type: READING_PLAYBACK_EVENTS.SET_ACTIVE_SPEECH, actionId: null });
          dispatch({ type: READING_PLAYBACK_EVENTS.ACTION_SETTLED });
        };
        utterance.onerror = () => {
          dispatch({ type: READING_PLAYBACK_EVENTS.SET_ACTIVE_SPEECH, actionId: null });
          dispatch({ type: READING_PLAYBACK_EVENTS.ACTION_SETTLED });
        };
        window.speechSynthesis.speak(utterance);
        return;
      }
      timerRef.current = setTimeout(() => {
        dispatch({ type: READING_PLAYBACK_EVENTS.SET_ACTIVE_SPEECH, actionId: null });
        dispatch({ type: READING_PLAYBACK_EVENTS.ACTION_SETTLED });
      }, estimateSpeechDurationMs(nextAction.text));
      return;
    }

    timerRef.current = setTimeout(() => {
      dispatch({ type: READING_PLAYBACK_EVENTS.ACTION_SETTLED });
    }, 900);
  }, [activeScene, sceneActions, state.actionCursorByScene, state.mode, state.sequence, state.ttsEnabled]);

  const actions = {
    start() {
      dispatch({ type: READING_PLAYBACK_EVENTS.START });
    },
    pause() {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
      dispatch({ type: READING_PLAYBACK_EVENTS.PAUSE });
    },
    resume() {
      dispatch({ type: READING_PLAYBACK_EVENTS.RESUME });
    },
    setMode(mode) {
      dispatch({ type: READING_PLAYBACK_EVENTS.SET_MODE, mode });
    },
    goToScene(index, sceneId) {
      if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
      dispatch({ type: READING_PLAYBACK_EVENTS.GO_TO_SCENE, index, sceneId });
    },
    revealNext(sceneId, totalActions) {
      dispatch({ type: READING_PLAYBACK_EVENTS.REVEAL_NEXT_ACTION, sceneId, totalActions });
    },
    enterLive(sceneId) {
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
    actions,
  };
}
