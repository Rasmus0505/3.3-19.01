/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";

import { readUploadPreferences, sanitizeGenerationOptions, writeUploadPreferences } from "./uploadPreferences";

describe("uploadPreferences", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("defaults word explanation and forced alignment to false", () => {
    const prefs = readUploadPreferences();
    expect(prefs.generationOptions.word_explanation).toBe(false);
    expect(prefs.generationOptions.forced_alignment).toBe(false);
  });

  it("persists selected upload model and generation options", () => {
    writeUploadPreferences({
      selectedUploadModel: "stepaudio-2.5-asr",
      generationOptions: {
        core_subtitles: true,
        zh_translation: false,
        vocabulary_annotation: true,
        word_explanation: false,
        forced_alignment: true,
      },
    });

    const prefs = readUploadPreferences();
    expect(prefs.selectedUploadModel).toBe("stepaudio-2.5-asr");
    expect(prefs.generationOptions.zh_translation).toBe(false);
    expect(prefs.generationOptions.forced_alignment).toBe(true);
  });

  it("forces vocabulary annotation on when word explanation is enabled", () => {
    const options = sanitizeGenerationOptions({
      word_explanation: true,
      vocabulary_annotation: false,
    });
    expect(options.word_explanation).toBe(true);
    expect(options.vocabulary_annotation).toBe(true);
  });
});
