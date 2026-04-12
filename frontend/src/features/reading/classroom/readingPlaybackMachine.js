import { buildSceneActionSequence } from "./readingActionTypes";

export const READING_PLAYBACK_EVENTS = {
  LOAD_COURSE: "LOAD_COURSE",
  START: "START",
  PAUSE: "PAUSE",
  RESUME: "RESUME",
  SET_MODE: "SET_MODE",
  GO_TO_SCENE: "GO_TO_SCENE",
  REVEAL_NEXT_ACTION: "REVEAL_NEXT_ACTION",
  SET_ACTIVE_SPEECH: "SET_ACTIVE_SPEECH",
  SET_PENDING_SPEECH: "SET_PENDING_SPEECH",
  CLEAR_PENDING_SPEECH: "CLEAR_PENDING_SPEECH",
  TOGGLE_TTS: "TOGGLE_TTS",
  ENTER_LIVE: "ENTER_LIVE",
  EXIT_LIVE: "EXIT_LIVE",
  ACTION_SETTLED: "ACTION_SETTLED",
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function buildActionCursor(course) {
  const scenes = course?.scenes || [];
  const runtime = course?.runtime || {};
  const fallbackFirstSceneId = scenes[0]?.id;
  const sourceMap = runtime.actionCursorByScene || runtime.revealCountsByScene || {};
  const output = {};
  scenes.forEach((scene, index) => {
    const totalActions = buildSceneActionSequence(scene).length;
    const fallbackCount = index === 0 ? Math.min(1, totalActions) : 0;
    output[scene.id] = clamp(Number(sourceMap?.[scene.id]) || fallbackCount, 0, totalActions);
  });
  if (fallbackFirstSceneId && output[fallbackFirstSceneId] == null) {
    output[fallbackFirstSceneId] = 1;
  }
  return output;
}

export function createReadingPlaybackState(course) {
  const scenes = course?.scenes || [];
  const runtime = course?.runtime || {};
  const sceneIds = new Set(scenes.map((scene) => scene.id));
  const pendingSpeechActionId = String(runtime.pendingSpeechActionId || "").trim() || null;
  const pendingSpeechSceneId = sceneIds.has(runtime.pendingSpeechSceneId)
    ? runtime.pendingSpeechSceneId
    : null;
  return {
    mode: runtime.engineMode || "idle",
    activeSceneIndex: clamp(Number(runtime.activeSceneIndex) || 0, 0, Math.max(0, scenes.length - 1)),
    actionCursorByScene: buildActionCursor(course),
    ttsEnabled: runtime.ttsEnabled !== false,
    activeSpeechActionId: null,
    pendingSpeechActionId,
    pendingSpeechSceneId: pendingSpeechActionId ? pendingSpeechSceneId : null,
    liveDiscussionSceneId: runtime.liveDiscussionSceneId || null,
    sequence: 0,
  };
}

export function playbackStateToRuntimePatch(state) {
  return {
    activeSceneIndex: state.activeSceneIndex,
    actionCursorByScene: state.actionCursorByScene,
    revealCountsByScene: state.actionCursorByScene,
    engineMode: state.mode,
    ttsEnabled: state.ttsEnabled,
    liveDiscussionSceneId: state.liveDiscussionSceneId,
    pendingSpeechActionId: state.pendingSpeechActionId,
    pendingSpeechSceneId: state.pendingSpeechSceneId,
    resumeFromInterruptedSpeech: Boolean(state.pendingSpeechActionId),
  };
}

export function readingPlaybackReducer(state, event) {
  switch (event?.type) {
    case READING_PLAYBACK_EVENTS.LOAD_COURSE:
      return createReadingPlaybackState(event.course);
    case READING_PLAYBACK_EVENTS.START:
      return { ...state, mode: "playing" };
    case READING_PLAYBACK_EVENTS.PAUSE:
      return { ...state, mode: "paused", activeSpeechActionId: null };
    case READING_PLAYBACK_EVENTS.RESUME:
      return { ...state, mode: "playing" };
    case READING_PLAYBACK_EVENTS.SET_MODE:
      return { ...state, mode: event.mode || state.mode };
    case READING_PLAYBACK_EVENTS.GO_TO_SCENE:
      return {
        ...state,
        activeSceneIndex: Math.max(0, Number(event.index) || 0),
        mode: event.mode || "paused",
        activeSpeechActionId: null,
        pendingSpeechActionId: null,
        pendingSpeechSceneId: null,
        actionCursorByScene: {
          ...state.actionCursorByScene,
          // Always reset to 0 for the target scene so playback starts from first action
          ...(event.sceneId ? { [event.sceneId]: 0 } : {}),
        },
      };
    case READING_PLAYBACK_EVENTS.REVEAL_NEXT_ACTION:
      return {
        ...state,
        actionCursorByScene: {
          ...state.actionCursorByScene,
          [event.sceneId]: Math.min(Number(event.totalActions) || 0, (state.actionCursorByScene?.[event.sceneId] || 0) + 1),
        },
      };
    case READING_PLAYBACK_EVENTS.SET_ACTIVE_SPEECH:
      return {
        ...state,
        activeSpeechActionId: event.actionId || null,
      };
    case READING_PLAYBACK_EVENTS.SET_PENDING_SPEECH:
      return {
        ...state,
        pendingSpeechActionId: event.actionId || null,
        pendingSpeechSceneId: event.sceneId || null,
      };
    case READING_PLAYBACK_EVENTS.CLEAR_PENDING_SPEECH:
      return {
        ...state,
        pendingSpeechActionId: null,
        pendingSpeechSceneId: null,
      };
    case READING_PLAYBACK_EVENTS.TOGGLE_TTS:
      return {
        ...state,
        ttsEnabled: event.enabled == null ? !state.ttsEnabled : Boolean(event.enabled),
      };
    case READING_PLAYBACK_EVENTS.ENTER_LIVE:
      return {
        ...state,
        mode: "live",
        activeSpeechActionId: null,
        pendingSpeechActionId: null,
        pendingSpeechSceneId: null,
        liveDiscussionSceneId: event.sceneId || state.liveDiscussionSceneId,
      };
    case READING_PLAYBACK_EVENTS.EXIT_LIVE:
      return {
        ...state,
        mode: event.nextMode || "paused",
        liveDiscussionSceneId: null,
      };
    case READING_PLAYBACK_EVENTS.ACTION_SETTLED:
      return {
        ...state,
        sequence: state.sequence + 1,
      };
    default:
      return state;
  }
}
