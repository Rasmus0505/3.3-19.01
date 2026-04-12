import { describe, expect, it } from "vitest";

import {
  getReadingClassroomTtsConfig,
  READING_CLASSROOM_TTS_MODEL,
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
