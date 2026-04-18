import { describe, expect, it } from "vitest";
import { buildComparisonCards, buildReadingPack, splitPackSentences } from "./readingPack";

describe("readingPack", () => {
  it("splits text into comparison-friendly sentence groups", () => {
    expect(splitPackSentences("One. Two!\nThree?")).toEqual(["One.", "Two!", "Three?"]);
  });

  it("builds comparison cards from saved original and rewritten text", () => {
    const cards = buildComparisonCards({
      originalText: "Hello world. Complex phrase here.",
      rewrittenText: "Hello world. Simple phrase here.",
      mappings: [{ original: "Simple", rewritten: "Complex", confirmed: true, finalLevel: "C1" }],
    });

    expect(cards).toHaveLength(2);
    expect(cards[1]).toMatchObject({
      originalText: "Complex phrase here.",
      rewrittenText: "Simple phrase here.",
      changed: true,
    });
    expect(cards[1].mappings[0]).toMatchObject({
      original: "Simple",
      rewritten: "Complex",
      confirmed: true,
    });
  });

  it("builds a pack asset with diagnostic summary and persisted comparison cards", () => {
    const pack = buildReadingPack({
      articleId: "article-1",
      originalText: "Original sentence.",
      rewrittenText: "Simplified sentence.",
      mappings: [{ original: "Simplified", rewritten: "Original", confirmed: true }],
      diagnosticSnapshot: {
        selectedTargetLevel: "B2",
        materialDifficulty: "C1",
        preservedI1Count: 4,
        aboveI1Count: 3,
      },
      wordLevels: { original: "C1" },
      validI1Words: ["target"],
      validAboveI1Words: ["original"],
      removedWords: [{ word: "easy", reason: "mastered" }],
      assembledAt: 12345,
    });

    expect(pack).toMatchObject({
      articleId: "article-1",
      status: "completed",
      targetLevel: "B2",
      diagnosticSummary: {
        materialDifficulty: "C1",
        preservedI1Count: 4,
        aboveI1Count: 3,
      },
      comparisonCards: [
        {
          originalText: "Original sentence.",
          rewrittenText: "Simplified sentence.",
          changed: true,
        },
      ],
    });
  });
});


