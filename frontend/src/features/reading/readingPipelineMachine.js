export const READING_PIPELINE_STAGES = [
  { key: "parsing", label: "parsing" },
  { key: "difficulty_judgment", label: "difficulty judgment" },
  { key: "simplification_planning", label: "simplification planning" },
  { key: "text_rewriting", label: "text rewriting" },
  { key: "reading_pack_assembly", label: "reading-pack assembly" },
];

export const READING_PIPELINE_STAGE_KEYS = READING_PIPELINE_STAGES.map((stage) => stage.key);

function createStageState(stage) {
  return {
    key: stage.key,
    label: stage.label,
    status: "pending",
    headline: "",
    detail: "",
    progressPercent: 0,
    updatedAt: null,
  };
}

export function createInitialPipelineState() {
  return {
    mode: "idle",
    currentStage: null,
    lastCompletedStage: null,
    stages: READING_PIPELINE_STAGES.map(createStageState),
    error: null,
    resumeAvailable: false,
    restoredFromStorage: false,
    updatedAt: null,
  };
}

function normalizeStage(stage) {
  const template = READING_PIPELINE_STAGES.find((item) => item.key === stage?.key);
  if (!template) {
    return null;
  }
  return {
    ...createStageState(template),
    ...stage,
    key: template.key,
    label: template.label,
    progressPercent: Math.max(0, Math.min(100, Number(stage?.progressPercent) || 0)),
  };
}

export function normalizePipelineState(pipeline) {
  if (!pipeline) {
    return createInitialPipelineState();
  }

  const stageMap = new Map(
    (Array.isArray(pipeline.stages) ? pipeline.stages : [])
      .map((stage) => normalizeStage(stage))
      .filter(Boolean)
      .map((stage) => [stage.key, stage]),
  );

  return {
    ...createInitialPipelineState(),
    ...pipeline,
    stages: READING_PIPELINE_STAGES.map((stage) => stageMap.get(stage.key) || createStageState(stage)),
    currentStage: READING_PIPELINE_STAGE_KEYS.includes(pipeline.currentStage) ? pipeline.currentStage : null,
    lastCompletedStage: READING_PIPELINE_STAGE_KEYS.includes(pipeline.lastCompletedStage)
      ? pipeline.lastCompletedStage
      : null,
    error: pipeline.error
      ? {
          stage: READING_PIPELINE_STAGE_KEYS.includes(pipeline.error.stage) ? pipeline.error.stage : null,
          message: String(pipeline.error.message || ""),
          originalFallbackAvailable: pipeline.error.originalFallbackAvailable !== false,
        }
      : null,
    resumeAvailable: Boolean(pipeline.resumeAvailable),
    restoredFromStorage: Boolean(pipeline.restoredFromStorage),
    updatedAt: pipeline.updatedAt || null,
  };
}

function updateStages(stages, stageKey, updater) {
  return stages.map((stage) => (stage.key === stageKey ? updater(stage) : stage));
}

function markPriorStagesCompleted(stages, stageKey) {
  const nextStages = [];
  let reachedCurrent = false;
  for (const stage of stages) {
    if (stage.key === stageKey) {
      reachedCurrent = true;
      nextStages.push(stage);
      continue;
    }
    if (!reachedCurrent && stage.status !== "completed") {
      nextStages.push({ ...stage, status: "completed", progressPercent: 100 });
      continue;
    }
    nextStages.push(stage);
  }
  return nextStages;
}

export function readingPipelineReducer(state, action) {
  const currentState = normalizePipelineState(state);
  const timestamp = action?.updatedAt || Date.now();

  switch (action?.type) {
    case "hydrate":
      return normalizePipelineState({
        ...action.pipeline,
        restoredFromStorage: Boolean(action.restoredFromStorage),
      });

    case "reset":
      return createInitialPipelineState();

    case "stage_started": {
      if (!READING_PIPELINE_STAGE_KEYS.includes(action.stage)) {
        return currentState;
      }
      const markedStages = markPriorStagesCompleted(currentState.stages, action.stage);
      return {
        ...currentState,
        mode: "pipeline",
        currentStage: action.stage,
        error: null,
        resumeAvailable: false,
        restoredFromStorage: false,
        updatedAt: timestamp,
        stages: updateStages(markedStages, action.stage, (stage) => ({
          ...stage,
          status: "running",
          headline: String(action.headline || stage.headline || ""),
          detail: String(action.detail || stage.detail || ""),
          progressPercent: Math.max(stage.progressPercent, Number(action.progressPercent) || 0),
          updatedAt: timestamp,
        })),
      };
    }

    case "stage_completed": {
      if (!READING_PIPELINE_STAGE_KEYS.includes(action.stage)) {
        return currentState;
      }
      return {
        ...currentState,
        mode: "pipeline",
        currentStage: null,
        lastCompletedStage: action.stage,
        error: null,
        updatedAt: timestamp,
        stages: updateStages(currentState.stages, action.stage, (stage) => ({
          ...stage,
          status: "completed",
          detail: String(action.detail || stage.detail || ""),
          progressPercent: 100,
          updatedAt: timestamp,
        })),
      };
    }

    case "stage_failed": {
      if (!READING_PIPELINE_STAGE_KEYS.includes(action.stage)) {
        return currentState;
      }
      return {
        ...currentState,
        mode: "pipeline",
        currentStage: action.stage,
        error: {
          stage: action.stage,
          message: String(action.message || ""),
          originalFallbackAvailable: action.originalFallbackAvailable !== false,
        },
        resumeAvailable: true,
        updatedAt: timestamp,
        stages: updateStages(currentState.stages, action.stage, (stage) => ({
          ...stage,
          status: "failed",
          headline: String(action.headline || stage.headline || ""),
          detail: String(action.message || action.detail || ""),
          updatedAt: timestamp,
        })),
      };
    }

    case "pack_completed": {
      const finalStage = action.stage || "reading_pack_assembly";
      const nextStages = READING_PIPELINE_STAGE_KEYS.includes(finalStage)
        ? updateStages(currentState.stages, finalStage, (stage) => ({
            ...stage,
            status: "completed",
            progressPercent: 100,
            detail: String(action.detail || stage.detail || ""),
            updatedAt: timestamp,
          }))
        : currentState.stages;

      return {
        ...currentState,
        mode: "pack",
        currentStage: null,
        lastCompletedStage: READING_PIPELINE_STAGE_KEYS.includes(finalStage) ? finalStage : currentState.lastCompletedStage,
        error: null,
        resumeAvailable: false,
        restoredFromStorage: false,
        updatedAt: timestamp,
        stages: nextStages,
      };
    }

    default:
      return currentState;
  }
}
