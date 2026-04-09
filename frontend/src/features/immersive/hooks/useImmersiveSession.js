// 沉浸式学习会话 Hook
// 管理会话状态和 reducer

import { useCallback, useMemo, useReducer } from "react";
import {
  ANSWER_COMPLETED,
  LESSON_LOADED,
  NAVIGATE_TO_SENTENCE,
  PLAYBACK_FINISHED,
  PLAYBACK_STARTED,
  POST_ANSWER_REPLAY_COMPLETED,
  POST_ANSWER_REPLAY_STARTED,
  RESET_SENTENCE_GATE,
  SENTENCE_PASSED,
  SET_LOOP_ENABLED,
  SET_MEDIA_BINDING_REQUIRED,
  SET_PHASE,
  SET_PLAYBACK_RATE,
  SET_PLAYBACK_RATE_PINNED,
  SET_POST_ANSWER_REPLAY_STATE,
  SET_SENTENCE_JUMP_VALUE,
  SET_TRANSLATION_DISPLAY_MODE,
  createImmersiveSessionState,
  immersiveSessionReducer,
} from "../immersiveSessionMachine";
import { readLearningSettings } from "../learningSettings";

export function useImmersiveSession({ lesson, immersiveActive }) {
  const [sessionState, dispatchSession] = useReducer(
    immersiveSessionReducer,
    null,
    () => createImmersiveSessionState({ lesson, learningSettings: readLearningSettings() }),
  );

  const setPhase = useCallback((nextPhase) => {
    dispatchSession({ type: SET_PHASE, phase: nextPhase });
  }, []);

  const setSentenceJumpValue = useCallback((nextValue) => {
    dispatchSession({ type: SET_SENTENCE_JUMP_VALUE, value: nextValue });
  }, []);

  const setTranslationDisplayMode = useCallback((nextValue) => {
    dispatchSession({ type: SET_TRANSLATION_DISPLAY_MODE, value: nextValue });
  }, []);

  const setLoopEnabled = useCallback((enabled) => {
    dispatchSession({ type: SET_LOOP_ENABLED, enabled });
  }, []);

  const setSelectedPlaybackRate = useCallback((nextValue) => {
    dispatchSession({ type: SET_PLAYBACK_RATE, value: nextValue });
  }, []);

  const setPlaybackRatePinned = useCallback((pinned, value) => {
    dispatchSession({ type: SET_PLAYBACK_RATE_PINNED, pinned, value });
  }, []);

  const {
    phase,
    currentSentenceIndex,
    completedIndexes,
    sentenceTypingDone,
    sentencePlaybackDone,
    sentencePlaybackRequired,
    postAnswerReplayState,
    translationDisplayMode,
    sentenceJumpValue,
    singleSentenceLoopEnabled,
    playbackRatePinned,
    selectedPlaybackRate,
  } = sessionState;

  return {
    // State
    sessionState,
    phase,
    currentSentenceIndex,
    completedIndexes,
    sentenceTypingDone,
    sentencePlaybackDone,
    sentencePlaybackRequired,
    postAnswerReplayState,
    translationDisplayMode,
    sentenceJumpValue,
    singleSentenceLoopEnabled,
    playbackRatePinned,
    selectedPlaybackRate,
    // Dispatch
    dispatchSession,
    // Setters
    setPhase,
    setSentenceJumpValue,
    setTranslationDisplayMode,
    setLoopEnabled,
    setSelectedPlaybackRate,
    setPlaybackRatePinned,
  };
}

export {
  LESSON_LOADED,
  PLAYBACK_STARTED,
  PLAYBACK_FINISHED,
  ANSWER_COMPLETED,
  NAVIGATE_TO_SENTENCE,
  POST_ANSWER_REPLAY_STARTED,
  POST_ANSWER_REPLAY_COMPLETED,
  SET_MEDIA_BINDING_REQUIRED,
  RESET_SENTENCE_GATE,
  SENTENCE_PASSED,
  SET_LOOP_ENABLED,
  SET_PHASE,
  SET_PLAYBACK_RATE,
  SET_PLAYBACK_RATE_PINNED,
  SET_SENTENCE_JUMP_VALUE,
  SET_TRANSLATION_DISPLAY_MODE,
  SET_POST_ANSWER_REPLAY_STATE,
};
