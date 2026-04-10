import { describe, expect, it } from "vitest";
import {
  buildDiagnosticSnapshot,
  deriveTargetMetrics,
  formatEstimateTime,
  getRecommendedTargetLevel,
  updateDiagnosticTarget,
} from "./readingDiagnostics";

describe("readingDiagnostics", () => {
  it("keeps the user level when material is not harder than the user", () => {
    expect(getRecommendedTargetLevel("B1", "A2")).toBe("B1");
    expect(getRecommendedTargetLevel("B1", "B1")).toBe("B1");
  });

  it("recommends i+1 when material is harder than the user", () => {
    expect(getRecommendedTargetLevel("B1", "B2")).toBe("B2");
    expect(getRecommendedTargetLevel("B1", "C2")).toBe("B2");
    expect(getRecommendedTargetLevel("C2", "C2")).toBe("C2");
  });

  it("derives selected-target impact metrics from CEFR counts", () => {
    expect(
      deriveTargetMetrics(
        { A1: 6, A2: 4, B1: 10, B2: 8, C1: 3, C2: 1, SUPER: 2 },
        34,
        "B1"
      )
    ).toEqual({
      preservedI1Count: 10,
      aboveI1Count: 14,
      simplificationImpactPercent: 41,
    });
  });

  it("builds and updates a diagnostic snapshot without losing base stats", () => {
    const snapshot = buildDiagnosticSnapshot({
      text: "Example text",
      userLevel: "B1",
      report: {
        totalWords: 20,
        overallGrade: "C1",
        levelCounts: { A1: 3, A2: 3, B1: 4, B2: 5, C1: 4, C2: 1, SUPER: 0 },
        userAdaptability: { score: 40, message: "偏难" },
      },
      estimatedTokens: 960,
      estimatedChargeYuan: 0.32,
    });

    expect(snapshot.recommendedTargetLevel).toBe("B2");
    expect(snapshot.selectedTargetLevel).toBe("B2");
    expect(snapshot.preservedI1Count).toBe(5);
    expect(snapshot.aboveI1Count).toBe(5);

    const updated = updateDiagnosticTarget(snapshot, "A2");
    expect(updated.selectedTargetLevel).toBe("A2");
    expect(updated.preservedI1Count).toBe(3);
    expect(updated.aboveI1Count).toBe(14);
    expect(updated.totalWords).toBe(20);
  });

  it("formats human-readable estimate time labels", () => {
    expect(formatEstimateTime(14)).toBe("约 14 秒");
    expect(formatEstimateTime(90)).toBe("约 2 分钟");
  });
});
