import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useImmersivePreferences } from "./useImmersivePreferences";

function createMediaStub() {
  return {
    playbackRate: 1,
    defaultPlaybackRate: 1,
  };
}

function renderPreferencesHook(overrides = {}) {
  const media = createMediaStub();
  const clipAudio = createMediaStub();
  const setSelectedPlaybackRate = vi.fn();

  const hook = renderHook(() =>
    useImmersivePreferences({
      currentLessonId: "lesson-1",
      singleSentenceLoopEnabled: false,
      playbackRatePinned: false,
      selectedPlaybackRate: 1,
      setLoopEnabled: vi.fn(),
      setSelectedPlaybackRate,
      setPlaybackRatePinned: vi.fn(),
      mediaElementRef: { current: media },
      clipAudioRef: { current: clipAudio },
      ...overrides,
    }),
  );

  return {
    ...hook,
    media,
    clipAudio,
    setSelectedPlaybackRate,
  };
}

describe("useImmersivePreferences playback rate", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("applies manually committed rate to active media elements", () => {
    const { result, media, clipAudio, setSelectedPlaybackRate } = renderPreferencesHook();

    act(() => {
      result.current.handlePlaybackRateInputChange({ target: { value: "1.7" } });
    });
    expect(result.current.hasPendingPlaybackRateDraft).toBe(true);

    let committedRate;
    act(() => {
      committedRate = result.current.commitPlaybackRateInput("1.7");
    });

    expect(committedRate).toBe(1.7);
    expect(setSelectedPlaybackRate).toHaveBeenLastCalledWith(1.7);
    expect(media.playbackRate).toBe(1.7);
    expect(media.defaultPlaybackRate).toBe(1.7);
    expect(clipAudio.playbackRate).toBe(1.7);
    expect(result.current.playbackRateInputValue).toBe("1.7");
    expect(result.current.hasPendingPlaybackRateDraft).toBe(false);
  });

  it("adjusts playback rate in 0.1 steps", () => {
    const { result, media, setSelectedPlaybackRate } = renderPreferencesHook();

    act(() => {
      result.current.handlePlaybackRateInputChange({ target: { value: "1.2" } });
    });
    act(() => {
      result.current.adjustPlaybackRateByStep(1);
    });

    expect(setSelectedPlaybackRate).toHaveBeenLastCalledWith(1.3);
    expect(media.playbackRate).toBe(1.3);
    expect(result.current.playbackRateInputValue).toBe("1.3");
    expect(result.current.hasPendingPlaybackRateDraft).toBe(false);
  });

  it("treats an empty committed draft as resetting the current sentence rate to 1.0x", () => {
    const { result, media, setSelectedPlaybackRate } = renderPreferencesHook({
      selectedPlaybackRate: 1.4,
    });

    act(() => {
      result.current.handlePlaybackRateInputChange({ target: { value: "" } });
    });
    expect(result.current.hasPendingPlaybackRateDraft).toBe(true);

    let committedRate;
    act(() => {
      committedRate = result.current.commitPlaybackRateInput("");
    });

    expect(committedRate).toBe(1);
    expect(setSelectedPlaybackRate).toHaveBeenLastCalledWith(1);
    expect(media.playbackRate).toBe(1);
    expect(result.current.playbackRateInputValue).toBe("1");
    expect(result.current.hasPendingPlaybackRateDraft).toBe(false);
  });

  it("persists fullscreen study mode preference", () => {
    const { result } = renderPreferencesHook();

    act(() => {
      result.current.persistFullscreenStudyModePreference(true);
    });

    const stored = JSON.parse(window.localStorage.getItem("immersive_learning_settings_v2") || "{}");
    expect(stored.uiPreferences.fullscreenStudyMode).toBe(true);
    expect(result.current.persistedFullscreenStudyMode).toBe(true);
  });
});
