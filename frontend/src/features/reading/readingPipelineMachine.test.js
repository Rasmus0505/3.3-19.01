import { describe, expect, it } from "vitest";
import {
  createInitialPipelineState,
  normalizePipelineState,
  READING_PIPELINE_STAGE_KEYS,
  readingPipelineReducer,
} from "./readingPipelineMachine";

describe("readingPipelineMachine", () => {
  it("creates the full five-stage pipeline ledger", () => {
    const state = createInitialPipelineState();

    expect(state.mode).toBe("idle");
    expect(state.stages.map((stage) => stage.key)).toEqual(READING_PIPELINE_STAGE_KEYS);
    expect(state.stages.every((stage) => stage.status === "pending")).toBe(true);
  });

  it("marks running, completed, and failed stages deterministically", () => {
    let state = createInitialPipelineState();

    state = readingPipelineReducer(state, {
      type: "stage_started",
      stage: "parsing",
      headline: "Parsing",
      detail: "Preparing text",
    });
    expect(state.mode).toBe("pipeline");
    expect(state.currentStage).toBe("parsing");
    expect(state.stages[0].status).toBe("running");

    state = readingPipelineReducer(state, {
      type: "stage_completed",
      stage: "parsing",
      detail: "Parsing complete",
    });
    expect(state.currentStage).toBeNull();
    expect(state.lastCompletedStage).toBe("parsing");
    expect(state.stages[0].status).toBe("completed");

    state = readingPipelineReducer(state, {
      type: "stage_failed",
      stage: "text_rewriting",
      message: "Rewrite failed",
    });
    expect(state.error).toEqual({
      stage: "text_rewriting",
      message: "Rewrite failed",
      originalFallbackAvailable: true,
    });
    expect(state.resumeAvailable).toBe(true);
    expect(state.stages.find((stage) => stage.key === "text_rewriting")?.status).toBe("failed");
  });

  it("restores saved pipeline state and preserves approved stages", () => {
    const restored = normalizePipelineState({
      mode: "pipeline",
      currentStage: "simplification_planning",
      lastCompletedStage: "difficulty_judgment",
      resumeAvailable: true,
      stages: [
        { key: "parsing", status: "completed", progressPercent: 100 },
        { key: "difficulty_judgment", status: "completed", progressPercent: 100 },
        { key: "simplification_planning", status: "running", progressPercent: 45 },
      ],
    });

    expect(restored.stages.find((stage) => stage.key === "parsing")?.status).toBe("completed");
    expect(restored.stages.find((stage) => stage.key === "difficulty_judgment")?.status).toBe("completed");
    expect(restored.stages.find((stage) => stage.key === "simplification_planning")?.status).toBe("running");
    expect(restored.resumeAvailable).toBe(true);
  });
});
