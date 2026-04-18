import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useReadingRewrite } from "../../hooks/useReadingRewrite";
import { clearAllRewriteRecords, saveRewriteRecord } from "./readingRewriteDB";
import { installMockIndexedDb } from "../../test/mockIndexedDb";

const mockIndexedDb = installMockIndexedDb();

describe("useReadingRewrite resume behavior", () => {
  beforeEach(async () => {
    mockIndexedDb.reset();
    window.localStorage.clear();
    await clearAllRewriteRecords();
  });

  it("restores an interrupted pipeline state from the saved article record", async () => {
    await saveRewriteRecord({
      articleId: "resume-1",
      originalText: "Original text",
      rewrittenText: null,
      mappings: [],
      validI1Words: ["target"],
      validAboveI1Words: ["complex"],
      removedWords: [],
      wordLevels: { complex: "C1" },
      diagnosticSnapshot: { selectedTargetLevel: "B2" },
      pipeline: {
        currentStage: "text_rewriting",
        lastCompletedStage: "simplification_planning",
        resumeAvailable: true,
        stages: [
          { key: "parsing", status: "completed", progressPercent: 100 },
          { key: "difficulty_judgment", status: "completed", progressPercent: 100 },
          { key: "simplification_planning", status: "completed", progressPercent: 100 },
          { key: "text_rewriting", status: "running", progressPercent: 70 },
        ],
      },
      flowStatus: "pipeline",
      viewMode: "original",
    });

    const { result } = renderHook(() =>
      useReadingRewrite({
        apiCall: null,
        accessToken: null,
        articleId: "resume-1",
      })
    );

    await waitFor(() => {
      expect(result.current.flowStatus).toBe("pipeline");
    });
    expect(result.current.pipelineState.currentStage).toBe("text_rewriting");
    expect(result.current.pipelineState.resumeAvailable).toBe(true);
    expect(result.current.readingPack).toBeNull();
  });

  it("restores a completed reading pack and its saved pack view mode", async () => {
    await saveRewriteRecord({
      articleId: "resume-pack",
      originalText: "Original sentence.",
      rewrittenText: "Simplified sentence.",
      mappings: [{ original: "Simplified", rewritten: "Original", confirmed: true }],
      validI1Words: [],
      validAboveI1Words: ["original"],
      removedWords: [],
      wordLevels: { original: "C1" },
      diagnosticSnapshot: { selectedTargetLevel: "B2" },
      readingPack: {
        status: "completed",
        comparisonCards: [{ id: "comparison-1", originalText: "Original sentence.", rewrittenText: "Simplified sentence." }],
      },
      flowStatus: "generated",
      viewMode: "original",
      packViewMode: "comparison",
    });

    const { result } = renderHook(() =>
      useReadingRewrite({
        apiCall: null,
        accessToken: null,
        articleId: "resume-pack",
      })
    );

    await waitFor(() => {
      expect(result.current.flowStatus).toBe("generated");
    });
    expect(result.current.readingPack?.status).toBe("completed");
    expect(result.current.packViewMode).toBe("comparison");
    expect(result.current.viewMode).toBe("original");
  });
});


