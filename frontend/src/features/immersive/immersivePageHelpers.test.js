import { describe, expect, it } from "vitest";

import { resolveReplayAssistance } from "./learningSettings";
import { resolveImmersiveShellHeightPx, shouldAutoAdvanceSentence } from "./immersivePageHelpers";

describe("resolveReplayAssistance", () => {
  it("never reveals letters or words during replay", () => {
    expect(resolveReplayAssistance({}, 0)).toEqual({ revealLetterCount: 0, revealWordCount: 0 });
    expect(resolveReplayAssistance({}, 1)).toEqual({ revealLetterCount: 0, revealWordCount: 0 });
    expect(resolveReplayAssistance({}, 3)).toEqual({ revealLetterCount: 0, revealWordCount: 0 });
  });
});

describe("shouldAutoAdvanceSentence", () => {
  it("waits for post-answer replay completion when auto replay is enabled", () => {
    expect(
      shouldAutoAdvanceSentence({
        immersiveActive: true,
        sentenceTypingDone: true,
        postAnswerReplayState: "waiting_initial_finish",
        autoReplayAnsweredSentence: true,
      }),
    ).toBe(false);

    expect(
      shouldAutoAdvanceSentence({
        immersiveActive: true,
        sentenceTypingDone: true,
        postAnswerReplayState: "completed",
        autoReplayAnsweredSentence: true,
      }),
    ).toBe(true);
  });

  it("blocks auto advance while single sentence loop is enabled", () => {
    expect(
      shouldAutoAdvanceSentence({
        immersiveActive: true,
        sentenceTypingDone: true,
        postAnswerReplayState: "completed",
        autoReplayAnsweredSentence: true,
        singleSentenceLoopEnabled: true,
      }),
    ).toBe(false);
  });

  it("falls back to playback completion when auto replay is disabled", () => {
    expect(
      shouldAutoAdvanceSentence({
        immersiveActive: true,
        sentenceTypingDone: true,
        postAnswerReplayState: "idle",
        autoReplayAnsweredSentence: false,
        sentencePlaybackRequired: true,
        sentencePlaybackDone: false,
      }),
    ).toBe(false);

    expect(
      shouldAutoAdvanceSentence({
        immersiveActive: true,
        sentenceTypingDone: true,
        postAnswerReplayState: "idle",
        autoReplayAnsweredSentence: false,
        sentencePlaybackRequired: true,
        sentencePlaybackDone: true,
      }),
    ).toBe(true);
  });
});

describe("resolveImmersiveShellHeightPx", () => {
  it("fits desktop fullscreen study to the remaining viewport below the shell top", () => {
    expect(
      resolveImmersiveShellHeightPx({
        isTouchDevice: false,
        fallbackHeight: 900,
        currentBaseline: 900,
        containerTop: 180,
      }),
    ).toBe(720);
  });

  it("keeps touch devices on the visual viewport baseline", () => {
    expect(
      resolveImmersiveShellHeightPx({
        isTouchDevice: true,
        fallbackHeight: 900,
        currentBaseline: 812,
        visualHeight: 700,
        containerTop: 180,
      }),
    ).toBe(812);
  });
});


