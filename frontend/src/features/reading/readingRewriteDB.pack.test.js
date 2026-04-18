import { beforeEach, describe, expect, it } from "vitest";
import {
  clearAllRewriteRecords,
  getAllRewriteRecords,
  getRewriteRecord,
  saveRewriteRecord,
  updatePackViewMode,
} from "./readingRewriteDB";
import { installMockIndexedDb } from "../../test/mockIndexedDb";

const mockIndexedDb = installMockIndexedDb();

describe("readingRewriteDB pack contract", () => {
  beforeEach(async () => {
    mockIndexedDb.reset();
    await clearAllRewriteRecords();
  });

  it("normalizes persisted pipeline records without creating a second store", async () => {
    await saveRewriteRecord({
      articleId: "draft-1",
      originalText: "Original",
      rewrittenText: null,
      mappings: [],
      validI1Words: [],
      validAboveI1Words: [],
      removedWords: [],
      wordLevels: {},
      diagnosticSnapshot: { selectedTargetLevel: "B2" },
      pipeline: {
        currentStage: "simplification_planning",
        lastCompletedStage: "difficulty_judgment",
        stages: [
          { key: "parsing", status: "completed", progressPercent: 100 },
          { key: "difficulty_judgment", status: "completed", progressPercent: 100 },
          { key: "simplification_planning", status: "running", progressPercent: 35 },
        ],
      },
      flowStatus: "pipeline",
      viewMode: "original",
    });

    const record = await getRewriteRecord("draft-1");
    expect(record.flowStatus).toBe("pipeline");
    expect(record.pipeline.currentStage).toBe("simplification_planning");
    expect(record.packViewMode).toBe("original");
    expect(record.readingPack).toBeNull();
  });

  it("persists reading-pack assets and pack view mode on the same article record", async () => {
    await saveRewriteRecord({
      articleId: "pack-1",
      originalText: "Original sentence.",
      rewrittenText: "Simplified sentence.",
      mappings: [{ original: "Simplified", rewritten: "Original", confirmed: true }],
      validI1Words: [],
      validAboveI1Words: ["original"],
      removedWords: [],
      wordLevels: { original: "C1" },
      diagnosticSnapshot: { selectedTargetLevel: "B2" },
      pipeline: null,
      readingPack: {
        status: "completed",
        comparisonCards: [{ id: "comparison-1", originalText: "Original sentence.", rewrittenText: "Simplified sentence." }],
      },
      flowStatus: "generated",
      viewMode: "original",
      packViewMode: "original",
    });

    await updatePackViewMode("pack-1", "comparison");
    const record = await getRewriteRecord("pack-1");
    const all = await getAllRewriteRecords();

    expect(record.flowStatus).toBe("generated");
    expect(record.readingPack?.status).toBe("completed");
    expect(record.packViewMode).toBe("comparison");
    expect(all).toHaveLength(1);
    expect(all[0].articleId).toBe("pack-1");
  });
});


