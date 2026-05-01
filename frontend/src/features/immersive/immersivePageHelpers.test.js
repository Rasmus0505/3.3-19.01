import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveReplayAssistance } from "./learningSettings";
import {
  isTouchPrimaryInputDevice,
  resolveRequestedPlaybackRate,
  resolveSessionPlaybackRate,
  resolveImmersiveShellHeightPx,
  shouldAutoAdvanceSentence,
} from "./immersivePageHelpers";

afterEach(() => {
  vi.unstubAllGlobals();
});

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

describe("resolveRequestedPlaybackRate", () => {
  it("prefers the live input value before older selected or media rates", () => {
    expect(resolveRequestedPlaybackRate("1.7", 1, 1)).toBe(1.7);
  });

  it("falls back through media and selected rates and clamps invalid values", () => {
    expect(resolveRequestedPlaybackRate("", 2.8, 1.4)).toBe(2);
    expect(resolveRequestedPlaybackRate("", null, 1.3, 1)).toBe(1.3);
    expect(resolveRequestedPlaybackRate("", undefined, null, "bad")).toBe(1);
  });
});

describe("resolveSessionPlaybackRate", () => {
  it("prefers the latest session ref value over an older state fallback", () => {
    expect(resolveSessionPlaybackRate(1.7, 1)).toBe(1.7);
  });

  it("falls back to session state and clamps invalid values", () => {
    expect(resolveSessionPlaybackRate(undefined, 2.8)).toBe(2);
    expect(resolveSessionPlaybackRate("bad", 1.3)).toBe(1.3);
    expect(resolveSessionPlaybackRate(null, undefined)).toBe(1);
  });
});

describe("isTouchPrimaryInputDevice", () => {
  it("does not classify Windows touch laptops with a fine pointer as mobile touch layout", () => {
    vi.stubGlobal("window", {
      matchMedia: vi.fn(() => ({ matches: false })),
    });
    vi.stubGlobal("navigator", {
      maxTouchPoints: 10,
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    });

    expect(isTouchPrimaryInputDevice()).toBe(false);
  });

  it("classifies coarse pointer devices as touch primary", () => {
    vi.stubGlobal("window", {
      matchMedia: vi.fn((query) => ({ matches: query === "(pointer: coarse)" })),
    });
    vi.stubGlobal("navigator", {
      maxTouchPoints: 5,
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
    });

    expect(isTouchPrimaryInputDevice()).toBe(true);
  });
});
