import { buildSceneActionSequence, READING_ACTION_TYPES } from "./readingActionTypes";

function asRoundtableRole(role) {
  const r = String(role || "").toLowerCase();
  if (r === "assistant") return "assistant";
  if (r === "student") return "student";
  if (r === "user") return "user";
  return "teacher";
}

export function getReadingDerivedState(course, playbackState, runtime) {
  if (!course) return null;

  const scenes = course.scenes || [];
  const activeScene = scenes[playbackState.activeSceneIndex] || null;
  if (!activeScene) return null;

  const sceneActions = buildSceneActionSequence(activeScene);
  const cursor = Number(playbackState.actionCursorByScene?.[activeScene.id]) || 0;
  const visibleActions = sceneActions.slice(0, Math.min(sceneActions.length, cursor));
  const currentVisibleAction = visibleActions[visibleActions.length - 1] || null;

  // Last spotlight visible
  const spotlightAction =
    [...visibleActions].reverse().find((a) => a.type === READING_ACTION_TYPES.SPOTLIGHT) || null;

  // Last discussion action visible
  const discussionAction =
    [...visibleActions].reverse().find((a) => a.type === READING_ACTION_TYPES.DISCUSSION) || null;

  // Task action (quiz or output)
  const taskAction =
    [...visibleActions]
      .reverse()
      .find(
        (a) =>
          a.type === READING_ACTION_TYPES.QUIZ || a.type === READING_ACTION_TYPES.OUTPUT,
      ) || null;

  // Build roundtable messages from visible speech actions
  const scriptedMessages = visibleActions.flatMap((action) => {
    if (action.type === READING_ACTION_TYPES.SPEECH) {
      return [
        {
          id: action.id,
          role: asRoundtableRole(action.role),
          avatarKey: action.avatarKey || "",
          name: action.name || "",
          content: action.text,
          source: "playback",
        },
      ];
    }
    return [];
  });

  // Live discussion messages from runtime
  const liveMessages = (runtime?.discussion?.[activeScene.id]?.messages || []).map((msg, i) => ({
    id: `${activeScene.id}-live-${i + 1}`,
    role: msg.role === "assistant" ? "teacher" : "user",
    avatarKey: msg.role === "assistant" ? "teacher" : "user",
    name: msg.role === "assistant" ? course?.cast?.teacher?.name || "Coach Mira" : "You",
    content: msg.content,
    source: "live",
  }));

  const completedScenes = new Set(runtime?.completedSceneIds || []);
  const progressPercent =
    scenes.length > 0 ? Math.round((completedScenes.size / scenes.length) * 100) : 0;

  const taskCompleted =
    taskAction?.type === READING_ACTION_TYPES.QUIZ
      ? Boolean(runtime?.quiz?.[activeScene.id]?.submitted)
      : taskAction?.type === READING_ACTION_TYPES.OUTPUT
        ? Boolean(runtime?.output?.[activeScene.id]?.evaluation)
        : true;

  const allActionsRevealed = cursor >= sceneActions.length;

  return {
    scenes,
    activeScene,
    sceneActions,
    visibleActions,
    currentVisibleAction,
    spotlightAction,
    discussionAction,
    taskAction,
    roundtableMessages: [...scriptedMessages, ...liveMessages],
    progressPercent,
    hasMoreActions: cursor < sceneActions.length,
    allActionsRevealed,
    taskCompleted,
    canAdvanceScene:
      allActionsRevealed &&
      taskCompleted &&
      playbackState.mode !== "live" &&
      playbackState.mode !== "playing",
    isLiveMode: playbackState.mode === "live",
    isPlaying: playbackState.mode === "playing",
    isPaused: playbackState.mode === "paused",
    isIdle: playbackState.mode === "idle",
    canStart: playbackState.mode === "idle" || playbackState.mode === "paused",
    canPause: playbackState.mode === "playing",
  };
}
