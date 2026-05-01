import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import SessionControls from "./SessionControls";

function renderControls(overrides = {}) {
  return render(
    <SessionControls
      currentSentenceIndex={0}
      sentenceCount={3}
      requestNavigateSentence={vi.fn()}
      requestReplayCurrentSentence={vi.fn()}
      requestTogglePausePlayback={vi.fn()}
      fullscreenStudyMode={false}
      onToggleFullscreenStudyMode={vi.fn()}
      singleSentenceLoopEnabled={false}
      handleToggleSingleSentenceLoop={vi.fn()}
      playbackRateInputValue="1"
      handlePlaybackRateInputChange={vi.fn()}
      handlePlaybackRateInputBlur={vi.fn()}
      handlePlaybackRateInputKeyDown={vi.fn()}
      adjustPlaybackRateByStep={vi.fn()}
      handleResetPlaybackRate={vi.fn()}
      playbackRatePinned={false}
      handleTogglePlaybackRatePinned={vi.fn()}
      isPlaying={false}
      isPlaybackPaused={false}
      {...overrides}
    />,
  );
}

describe("SessionControls toggle state display", () => {
  it("shows explicit off state for inactive toggles", () => {
    renderControls();

    expect(screen.getByRole("button", { name: /精听\s*关/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /固定\s*关/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /全屏学习\s*关/ })).toBeTruthy();
  });

  it("shows explicit on state for active toggles", () => {
    renderControls({
      fullscreenStudyMode: true,
      singleSentenceLoopEnabled: true,
      playbackRatePinned: true,
    });

    expect(screen.getByRole("button", { name: /精听\s*开/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /固定\s*开/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /退出全屏\s*开/ })).toBeTruthy();
  });
});
