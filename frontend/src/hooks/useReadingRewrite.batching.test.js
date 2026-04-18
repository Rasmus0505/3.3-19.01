import { describe, expect, it } from "vitest";

import { createWordContextBatches } from "./useReadingRewrite";

describe("createWordContextBatches", () => {
  it("splits long reading material into ordered batches under the context limit", () => {
    const text = [
      "Transformation changes how cities move.",
      "Commuting becomes easier when public transit improves.",
      "Organizations adapt when work patterns shift.",
      "Ultimately the workforce changes with technology.",
    ].join(" ");

    const words = ["Transformation", "Commuting", "Organizations", "Ultimately"];
    const batches = createWordContextBatches(text, words, 90);

    expect(batches.length).toBeGreaterThan(1);
    expect(batches.flatMap((batch) => batch.words)).toEqual(words);
    expect(batches.every((batch) => batch.context.length <= 90)).toBe(true);
    expect(
      batches.every((batch) =>
        batch.words.every((word) => new RegExp(`\\b${word}\\b`, "i").test(batch.context)),
      ),
    ).toBe(true);
  });

  it("keeps a matching snippet even when one sentence alone is longer than the limit", () => {
    const text =
      "This deliberately oversized sentence keeps going until it includes pseudointellectualism in the middle and still refuses to stop so we can verify the fallback snippet logic without relying on short punctuation boundaries.";

    const [batch] = createWordContextBatches(text, ["pseudointellectualism"], 80);

    expect(batch.words).toEqual(["pseudointellectualism"]);
    expect(batch.context.length).toBeLessThanOrEqual(80);
    expect(batch.context.toLowerCase()).toContain("pseudointellectualism");
  });
});


