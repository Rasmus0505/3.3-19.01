import { buildSceneActionSequence, READING_ACTION_TYPES } from "./readingActionTypes";

function asRoundtableRole(role) {
  if (role === "assistant") return "assistant";
  if (role === "student") return "student";
  if (role === "user") return "user";
  return "teacher";
}

export function getReadingDerivedState(course, playbackState, runtime) {
  if (!course) return null;

  const scenes = course.scenes || [];
  const activeScene = scenes[playbackState.activeSceneIndex] || null;
  if (!activeScene) return null;

  const sceneActions = buildSceneActionSequence(activeScene);
  const visibleActionCount = Math.min(
    sceneActions.length,
    Number(playbackState.actionCursorByScene?.[activeScene.id]) || 0,
  );
  const visibleActions = sceneActions.slice(0, visibleActionCount);
  const currentVisibleAction = visibleActions[visibleActions.length - 1] || null;
  const nextAction = sceneActions[visibleActionCount] || null;
  const spotlightAction = [...visibleActions].reverse().find((action) => action.type === READING_ACTION_TYPES.SPOTLIGHT) || null;
  const discussionAction = [...visibleActions].reverse().find((action) => action.type === READING_ACTION_TYPES.DISCUSSION) || null;
  const taskAction = [...visibleActions].reverse().find((action) => action.type === READING_ACTION_TYPES.QUIZ || action.type === READING_ACTION_TYPES.OUTPUT) || null;

  const scriptedMessages = visibleActions.flatMap((action) => {
    if (action.type === READING_ACTION_TYPES.SPEECH) {
      return [{ id: action.id, role: asRoundtableRole(action.role), content: action.text, source: "playback" }];
    }
    if (action.type === READING_ACTION_TYPES.DISCUSSION) {
      return (action.messages || []).map((message) => ({
        id: message.id,
        role: asRoundtableRole(message.role),
        content: message.content,
        source: "scripted_discussion",
      }));
    }
    return [];
  });

  const liveDiscussionMessages = (runtime?.discussion?.[activeScene.id]?.messages || []).map((message, index) => ({
    id: `${activeScene.id}-live-${index + 1}`,
    role: message.role === "assistant" ? "teacher" : "user",
    content: message.content,
    source: "live_discussion",
  }));

  const completedScenes = new Set(runtime?.completedSceneIds || []);
  const progressPercent = scenes.length > 0 ? Math.round((completedScenes.size / scenes.length) * 100) : 0;
  const taskCompleted =
    taskAction?.type === READING_ACTION_TYPES.QUIZ
      ? Boolean(runtime?.quiz?.[activeScene.id]?.submitted)
      : taskAction?.type === READING_ACTION_TYPES.OUTPUT
        ? Boolean(runtime?.output?.[activeScene.id]?.evaluation)
        : true;

  return {
    scenes,
    activeScene,
    sceneActions,
    visibleActions,
    currentVisibleAction,
    nextAction,
    spotlightAction,
    discussionAction,
    taskAction,
    roundtableMessages: [...scriptedMessages, ...liveDiscussionMessages],
    progressPercent,
    hasMoreActions: visibleActionCount < sceneActions.length,
    canAdvanceScene: visibleActionCount >= sceneActions.length && taskCompleted && playbackState.mode !== "live",
    isLiveMode: playbackState.mode === "live",
    isPlaying: playbackState.mode === "playing",
    isPaused: playbackState.mode === "paused",
    canStart: playbackState.mode === "idle",
    canResume: playbackState.mode === "paused",
    canPause: playbackState.mode === "playing",
  };
}
