import { describe, expect, it } from "vitest";

import {
  DEFAULT_IMMERSIVE_PLAYBACK_RATE,
  NAVIGATE_TO_SENTENCE,
  SENTENCE_PASSED,
  SET_PLAYBACK_RATE,
  SET_PLAYBACK_RATE_PINNED,
  createImmersiveSessionState,
  immersiveSessionReducer,
} from "./immersiveSessionMachine";

const lesson = {
  id: 7,
  sentences: [{ idx: 0 }, { idx: 1 }, { idx: 2 }],
  progress: { current_sentence_index: 0, completed_sentence_indexes: [] },
};

describe("immersiveSessionReducer playback rate scope", () => {
  it("keeps a manual playback rate inside the current sentence and resets it when navigating unpinned", () => {
    let state = createImmersiveSessionState({ lesson });

    state = immersiveSessionReducer(state, { type: SET_PLAYBACK_RATE, value: 1.6 });
    expect(state.selectedPlaybackRate).toBe(1.6);

    state = immersiveSessionReducer(state, {
      type: NAVIGATE_TO_SENTENCE,
      targetIndex: 1,
      sentenceCount: 3,
    });

    expect(state.currentSentenceIndex).toBe(1);
    expect(state.playbackRatePinned).toBe(false);
    expect(state.selectedPlaybackRate).toBe(DEFAULT_IMMERSIVE_PLAYBACK_RATE);
  });

  it("keeps the selected playback rate across sentence navigation when pinned", () => {
    let state = createImmersiveSessionState({ lesson });

    state = immersiveSessionReducer(state, { type: SET_PLAYBACK_RATE, value: 1.6 });
    state = immersiveSessionReducer(state, { type: SET_PLAYBACK_RATE_PINNED, pinned: true, value: 1.6 });
    state = immersiveSessionReducer(state, {
      type: NAVIGATE_TO_SENTENCE,
      targetIndex: 1,
      sentenceCount: 3,
    });

    expect(state.currentSentenceIndex).toBe(1);
    expect(state.playbackRatePinned).toBe(true);
    expect(state.selectedPlaybackRate).toBe(1.6);
  });

  it("resets playback rate after auto-advancing unless pinned", () => {
    let state = createImmersiveSessionState({ lesson });

    state = immersiveSessionReducer(state, { type: SET_PLAYBACK_RATE, value: 1.4 });
    state = immersiveSessionReducer(state, {
      type: SENTENCE_PASSED,
      completedSentenceIndex: 0,
      nextSentenceIndex: 1,
      sentenceCount: 3,
    });
    expect(state.selectedPlaybackRate).toBe(DEFAULT_IMMERSIVE_PLAYBACK_RATE);

    state = immersiveSessionReducer(state, { type: SET_PLAYBACK_RATE, value: 1.4 });
    state = immersiveSessionReducer(state, { type: SET_PLAYBACK_RATE_PINNED, pinned: true, value: 1.4 });
    state = immersiveSessionReducer(state, {
      type: SENTENCE_PASSED,
      completedSentenceIndex: 1,
      nextSentenceIndex: 2,
      sentenceCount: 3,
    });
    expect(state.selectedPlaybackRate).toBe(1.4);
  });
});
