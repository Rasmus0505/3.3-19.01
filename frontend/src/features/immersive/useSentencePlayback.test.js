import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useSentencePlayback } from "./useSentencePlayback";

function createMediaStub() {
  const media = {
    currentTime: 0,
    defaultPlaybackRate: 1,
    paused: true,
    playbackRate: 1,
    pause: vi.fn(() => {
      media.paused = true;
    }),
    play: vi.fn(async () => {
      media.paused = false;
    }),
  };
  return media;
}

function renderPlaybackHook({
  media = createMediaStub(),
  selectedPlaybackRate = 1,
  resolveSelectedPlaybackRate = null,
} = {}) {
  const props = {
    mode: "video",
    mediaElementRef: { current: media },
    clipAudioRef: { current: null },
    apiClient: vi.fn(),
    accessToken: "token",
    onSentenceFinished: vi.fn(),
    selectedPlaybackRate,
    resolveSelectedPlaybackRate,
  };
  const hook = renderHook((hookProps) => useSentencePlayback(hookProps), {
    initialProps: props,
  });
  return { ...hook, media, props };
}

describe("useSentencePlayback playback rate", () => {
  it("keeps the selected rate on the media element after a sentence segment finishes", async () => {
    const { result, media, props } = renderPlaybackHook({ selectedPlaybackRate: 1.7 });

    await act(async () => {
      await result.current.playSentence({ begin_ms: 0, end_ms: 100 }, { initialRate: 1.7, rateSteps: [] });
    });

    expect(media.playbackRate).toBe(1.7);

    act(() => {
      media.currentTime = 0.11;
      result.current.onMainMediaTimeUpdate();
    });

    expect(media.paused).toBe(true);
    expect(media.playbackRate).toBe(1.7);
    expect(media.defaultPlaybackRate).toBe(1.7);
    expect(props.onSentenceFinished).toHaveBeenCalledTimes(1);
  });

  it("applies selected rate changes to the active media element", async () => {
    const { result, rerender, media, props } = renderPlaybackHook({ selectedPlaybackRate: 1 });

    await act(async () => {
      await result.current.playSentence({ begin_ms: 0, end_ms: 1000 }, { initialRate: 1, rateSteps: [] });
    });

    expect(media.playbackRate).toBe(1);

    rerender({
      ...props,
      selectedPlaybackRate: 1.4,
    });

    expect(media.playbackRate).toBe(1.4);
    expect(media.defaultPlaybackRate).toBe(1.4);
  });

  it("keeps the current sentence rate across repeated replays until sentence navigation resets it upstream", async () => {
    const { result, media } = renderPlaybackHook({ selectedPlaybackRate: 1.4 });

    await act(async () => {
      await result.current.playSentence({ begin_ms: 0, end_ms: 120 }, { initialRate: 1.4, rateSteps: [] });
    });
    expect(media.playbackRate).toBe(1.4);

    act(() => {
      media.currentTime = 0.13;
      result.current.onMainMediaTimeUpdate();
    });
    expect(media.playbackRate).toBe(1.4);

    await act(async () => {
      await result.current.playSentence({ begin_ms: 0, end_ms: 120 }, { initialRate: 1.4, rateSteps: [] });
    });

    expect(media.playbackRate).toBe(1.4);
    expect(media.defaultPlaybackRate).toBe(1.4);
  });

  it("uses the page-provided immediate rate source instead of a stale selectedPlaybackRate prop", async () => {
    const resolveSelectedPlaybackRate = vi.fn(() => 1.6);
    const { result, media, props } = renderPlaybackHook({
      selectedPlaybackRate: 1,
      resolveSelectedPlaybackRate,
    });

    await act(async () => {
      await result.current.playSentence({ begin_ms: 0, end_ms: 100 }, { initialRate: 1.6, rateSteps: [] });
    });

    act(() => {
      media.currentTime = 0.11;
      result.current.onMainMediaTimeUpdate();
    });

    expect(props.onSentenceFinished).toHaveBeenCalledTimes(1);
    expect(resolveSelectedPlaybackRate).toHaveBeenCalled();
    expect(media.playbackRate).toBe(1.6);
    expect(media.defaultPlaybackRate).toBe(1.6);
  });

  it("does not pause media when selectedPlaybackRate changes during active playback", async () => {
    const { result, rerender, media, props } = renderPlaybackHook({ selectedPlaybackRate: 1 });

    await act(async () => {
      await result.current.playSentence({ begin_ms: 0, end_ms: 10000 });
    });

    expect(media.paused).toBe(false);
    const pauseCallCountBefore = media.pause.mock.calls.length;

    rerender({
      ...props,
      selectedPlaybackRate: 1.5,
    });

    expect(media.pause.mock.calls.length).toBe(pauseCallCountBefore);
    expect(media.playbackRate).toBe(1.5);
    expect(media.paused).toBe(false);

    rerender({
      ...props,
      selectedPlaybackRate: 0.7,
    });

    expect(media.pause.mock.calls.length).toBe(pauseCallCountBefore);
    expect(media.playbackRate).toBe(0.7);
    expect(media.paused).toBe(false);
  });
});
