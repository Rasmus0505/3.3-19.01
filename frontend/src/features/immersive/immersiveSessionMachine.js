export const LESSON_LOADED = "LESSON_LOADED";
export const PLAYBACK_STARTED = "PLAYBACK_STARTED";
export const PLAYBACK_FINISHED = "PLAYBACK_FINISHED";
export const ANSWER_COMPLETED = "ANSWER_COMPLETED";
export const NAVIGATE_TO_SENTENCE = "NAVIGATE_TO_SENTENCE";
export const POST_ANSWER_REPLAY_STARTED = "POST_ANSWER_REPLAY_STARTED";
export const POST_ANSWER_REPLAY_COMPLETED = "POST_ANSWER_REPLAY_COMPLETED";
export const SET_MEDIA_BINDING_REQUIRED = "SET_MEDIA_BINDING_REQUIRED";
export const EXIT_IMMERSIVE = "EXIT_IMMERSIVE";
export const RESET_SENTENCE_GATE = "RESET_SENTENCE_GATE";
export const SET_SENTENCE_JUMP_VALUE = "SET_SENTENCE_JUMP_VALUE";
export const SET_TRANSLATION_DISPLAY_MODE = "SET_TRANSLATION_DISPLAY_MODE";
export const SET_POST_ANSWER_REPLAY_STATE = "SET_POST_ANSWER_REPLAY_STATE";
export const SET_LOOP_ENABLED = "SET_LOOP_ENABLED";
export const SET_PLAYBACK_RATE = "SET_PLAYBACK_RATE";
export const SET_PLAYBACK_RATE_PINNED = "SET_PLAYBACK_RATE_PINNED";
export const SET_PHASE = "SET_PHASE";
export const SENTENCE_PASSED = "SENTENCE_PASSED";

export const DEFAULT_IMMERSIVE_PLAYBACK_RATE = 1;
export const IMMERSIVE_PLAYBACK_RATE_MIN = 0.4;
export const IMMERSIVE_PLAYBACK_RATE_MAX = 2;

function normalizeSentenceCount(lesson) {
  return Array.isArray(lesson?.sentences) ? lesson.sentences.length : 0;
}

function clampSentenceIndex(value, sentenceCount) {
  if (!Number.isFinite(value)) return 0;
  if (sentenceCount <= 0) return 0;
  return Math.min(sentenceCount - 1, Math.max(0, Math.trunc(value)));
}

function normalizeCompletedIndexes(indexes, sentenceCount) {
  if (!Array.isArray(indexes)) return [];
  return Array.from(
    new Set(
      indexes
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value >= 0 && (sentenceCount <= 0 || value < sentenceCount)),
    ),
  ).sort((left, right) => left - right);
}

function normalizeLoopEnabled(learningSettings) {
  return learningSettings?.playbackPreferences?.singleSentenceLoopEnabled === true;
}

export function normalizePlaybackRate(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_IMMERSIVE_PLAYBACK_RATE;
  }
  return Math.min(IMMERSIVE_PLAYBACK_RATE_MAX, Math.max(IMMERSIVE_PLAYBACK_RATE_MIN, numeric));
}

function resolveLessonPlaybackRateState(lesson, learningSettings) {
  const lessonId = String(lesson?.id ?? "").trim();
  const lessonOverrides = learningSettings?.playbackPreferences?.lessonPlaybackRateOverrides;
  const storedPreference =
    lessonId && lessonOverrides && typeof lessonOverrides === "object" ? lessonOverrides[lessonId] : null;
  if (storedPreference?.pinned === true) {
    return {
      playbackRatePinned: true,
      selectedPlaybackRate: normalizePlaybackRate(storedPreference.rate),
    };
  }
  return {
    playbackRatePinned: false,
    selectedPlaybackRate: DEFAULT_IMMERSIVE_PLAYBACK_RATE,
  };
}

function buildSentenceGateState(playbackRequired = true) {
  return {
    sentenceTypingDone: false,
    sentencePlaybackDone: false,
    sentencePlaybackRequired: Boolean(playbackRequired),
    postAnswerReplayState: "idle",
    translationDisplayMode: "previous",
  };
}

export function createImmersiveSessionState({
  lesson = null,
  learningSettings = null,
  phase = "idle",
  playbackRequired = true,
} = {}) {
  const sentenceCount = normalizeSentenceCount(lesson);
  const savedIndex = Number(lesson?.progress?.current_sentence_index);
  const safeIndex = clampSentenceIndex(savedIndex, sentenceCount);
  const playbackRateState = resolveLessonPlaybackRateState(lesson, learningSettings);
  return {
    phase,
    currentSentenceIndex: safeIndex,
    completedIndexes: normalizeCompletedIndexes(lesson?.progress?.completed_sentence_indexes, sentenceCount),
    ...buildSentenceGateState(playbackRequired),
    sentenceJumpValue: "",
    mediaBindingRequired: false,
    singleSentenceLoopEnabled: normalizeLoopEnabled(learningSettings),
    playbackRatePinned: playbackRateState.playbackRatePinned,
    selectedPlaybackRate: playbackRateState.selectedPlaybackRate,
  };
}

function applySentenceGateReset(state, playbackRequired = true) {
  return {
    ...state,
    ...buildSentenceGateState(playbackRequired),
  };
}

export function immersiveSessionReducer(state, event) {
  switch (event?.type) {
    case LESSON_LOADED: {
      return createImmersiveSessionState({
        lesson: event.lesson,
        learningSettings: event.learningSettings,
        phase: event.phase ?? "idle",
        playbackRequired: event.playbackRequired ?? true,
      });
    }
    case PLAYBACK_STARTED:
      return {
        ...state,
        phase: event.phase ?? "playing",
        sentencePlaybackRequired: event.playbackRequired ?? true,
        sentencePlaybackDone: false,
        translationDisplayMode: event.translationDisplayMode ?? state.translationDisplayMode,
      };
    case PLAYBACK_FINISHED:
      return {
        ...state,
        phase: event.phase ?? (!event.expectedTokensCount ? state.phase : "typing"),
        sentencePlaybackDone: true,
        sentenceTypingDone: !event.expectedTokensCount ? true : state.sentenceTypingDone,
        postAnswerReplayState: event.postAnswerReplayState ?? state.postAnswerReplayState,
      };
    case ANSWER_COMPLETED:
      return {
        ...state,
        sentenceTypingDone: true,
        translationDisplayMode: event.translationDisplayMode ?? "current_answered",
        postAnswerReplayState: event.postAnswerReplayState ?? state.postAnswerReplayState,
      };
    case NAVIGATE_TO_SENTENCE:
      return {
        ...applySentenceGateReset(state, event.playbackRequired ?? true),
        currentSentenceIndex: clampSentenceIndex(event.targetIndex, event.sentenceCount),
        phase: event.phase ?? "auto_play_pending",
        sentenceJumpValue: "",
        selectedPlaybackRate: state.playbackRatePinned ? state.selectedPlaybackRate : DEFAULT_IMMERSIVE_PLAYBACK_RATE,
      };
    case POST_ANSWER_REPLAY_STARTED:
      return {
        ...state,
        phase: event.phase ?? "playing",
        sentencePlaybackDone: false,
        postAnswerReplayState: "replaying",
        translationDisplayMode: "current_answered",
      };
    case POST_ANSWER_REPLAY_COMPLETED:
      return {
        ...state,
        phase: event.phase ?? "typing",
        sentencePlaybackDone: true,
        postAnswerReplayState: event.postAnswerReplayState ?? "completed",
      };
    case SET_MEDIA_BINDING_REQUIRED:
      return {
        ...state,
        mediaBindingRequired: event.required !== false,
        phase: event.phase ?? "typing",
        sentencePlaybackRequired: false,
      };
    case RESET_SENTENCE_GATE:
      return applySentenceGateReset(state, event.playbackRequired ?? true);
    case SET_SENTENCE_JUMP_VALUE:
      return {
        ...state,
        sentenceJumpValue: String(event.value ?? ""),
      };
    case SET_TRANSLATION_DISPLAY_MODE:
      return {
        ...state,
        translationDisplayMode: event.value ?? "previous",
      };
    case SET_POST_ANSWER_REPLAY_STATE:
      return {
        ...state,
        postAnswerReplayState: event.value ?? state.postAnswerReplayState,
      };
    case SET_LOOP_ENABLED:
      return {
        ...state,
        singleSentenceLoopEnabled: Boolean(event.enabled),
      };
    case SET_PLAYBACK_RATE:
      return {
        ...state,
        selectedPlaybackRate: normalizePlaybackRate(event.value),
      };
    case SET_PLAYBACK_RATE_PINNED:
      return {
        ...state,
        playbackRatePinned: Boolean(event.pinned),
        selectedPlaybackRate: normalizePlaybackRate(event.value ?? state.selectedPlaybackRate),
      };
    case SET_PHASE:
      return {
        ...state,
        phase: event.phase ?? state.phase,
      };
    case SENTENCE_PASSED: {
      const nextCompleted = normalizeCompletedIndexes(
        [...state.completedIndexes, Number(event.completedSentenceIndex)],
        event.sentenceCount,
      );
      const nextIndex = clampSentenceIndex(event.nextSentenceIndex, event.sentenceCount);
      const isLessonCompleted = event.isLessonCompleted === true;
      return {
        ...applySentenceGateReset(state, event.playbackRequired ?? true),
        completedIndexes: nextCompleted,
        currentSentenceIndex: isLessonCompleted ? state.currentSentenceIndex : nextIndex,
        phase: isLessonCompleted ? "lesson_completed" : event.phase ?? "auto_play_pending",
        selectedPlaybackRate: state.playbackRatePinned ? state.selectedPlaybackRate : DEFAULT_IMMERSIVE_PLAYBACK_RATE,
      };
    }
    case EXIT_IMMERSIVE:
      return {
        ...state,
        ...buildSentenceGateState(true),
        phase: "idle",
        sentenceJumpValue: "",
        playbackRatePinned: false,
        selectedPlaybackRate: DEFAULT_IMMERSIVE_PLAYBACK_RATE,
      };
    default:
      return state;
  }
}
