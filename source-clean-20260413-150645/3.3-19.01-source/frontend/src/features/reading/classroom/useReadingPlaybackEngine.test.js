import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  getReadingClassroomTtsConfig,
  READING_CLASSROOM_TTS_MODEL,
  useReadingPlaybackEngine,
} from "./useReadingPlaybackEngine";

describe("getReadingClassroomTtsConfig", () => {
  it("maps classroom roles to the planned official qwen3 voices", () => {
    expect(
      getReadingClassroomTtsConfig({ role: "teacher", avatarKey: "teacher" }),
    ).toEqual({
      model: READING_CLASSROOM_TTS_MODEL,
      voice: "Jennifer",
      languageType: "English",
    });

    expect(
      getReadingClassroomTtsConfig({ role: "assistant", avatarKey: "assistant" }),
    ).toEqual({
      model: READING_CLASSROOM_TTS_MODEL,
      voice: "Ryan",
      languageType: "English",
    });

    expect(
      getReadingClassroomTtsConfig({ role: "student", avatarKey: "student-curious" }),
    ).toEqual({
      model: READING_CLASSROOM_TTS_MODEL,
      voice: "Mia",
      languageType: "English",
    });

    expect(
      getReadingClassroomTtsConfig({ role: "student", avatarKey: "student-thinker" }),
    ).toEqual({
      model: READING_CLASSROOM_TTS_MODEL,
      voice: "Aiden",
      languageType: "English",
    });
  });

  it("skips synthesis for user messages", () => {
    expect(getReadingClassroomTtsConfig({ role: "user", avatarKey: "user" })).toBeNull();
  });
});

describe("useReadingPlaybackEngine", () => {
  it("replays the interrupted speech action after pause and resume", async () => {
    const onPersistPlayback = vi.fn();
    const course = {
      article_id: "article-1",
      generated_at: "2026-04-12T00:00:00Z",
      scenes: [
        {
          id: "scene-1",
          type: "entry",
          title: "进入课堂",
          beats: [
            {
              id: "beat-1",
              type: "bullet_list",
              items: ["Watch the structure first."],
            },
            {
              id: "beat-2",
              type: "teacher_talk",
              speaker: "teacher",
              text: "Focus on the main idea first.",
            },
          ],
        },
      ],
      runtime: {
        activeSceneIndex: 0,
        actionCursorByScene: { "scene-1": 0 },
        revealCountsByScene: { "scene-1": 0 },
        engineMode: "idle",
      },
    };

    const { result } = renderHook(() =>
      useReadingPlaybackEngine({
        course,
        apiCall: null,
        onPersistPlayback,
      }),
    );

    act(() => {
      result.current.actions.start();
    });

    await waitFor(() => {
      expect(result.current.playbackState.activeSpeechActionId).toBe("beat-2-speech");
    });
    expect(result.current.playbackState.pendingSpeechActionId).toBe("beat-2-speech");
    expect(result.current.playbackState.actionCursorByScene["scene-1"]).toBe(2);

    act(() => {
      result.current.actions.pause();
    });

    expect(result.current.playbackState.mode).toBe("paused");
    expect(result.current.playbackState.activeSpeechActionId).toBeNull();
    expect(result.current.playbackState.pendingSpeechActionId).toBe("beat-2-speech");

    act(() => {
      result.current.actions.resume();
    });

    await waitFor(() => {
      expect(result.current.playbackState.activeSpeechActionId).toBe("beat-2-speech");
    });

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 2300));
    });

    await waitFor(() => {
      expect(result.current.playbackState.activeSpeechActionId).toBeNull();
    });
    expect(result.current.playbackState.pendingSpeechActionId).toBeNull();
    expect(result.current.playbackState.actionCursorByScene["scene-1"]).toBe(2);
    expect(onPersistPlayback).toHaveBeenCalledWith(
      expect.objectContaining({
        pendingSpeechActionId: "beat-2-speech",
        pendingSpeechSceneId: "scene-1",
        resumeFromInterruptedSpeech: true,
      }),
    );
  });
});
