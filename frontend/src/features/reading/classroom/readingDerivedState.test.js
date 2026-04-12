import { describe, expect, it } from "vitest";

import { getReadingDerivedState } from "./readingDerivedState";

describe("getReadingDerivedState", () => {
  it("preserves student avatar identity through scripted roundtable messages", () => {
    const course = {
      cast: {
        teacher: { name: "Coach Mira" },
        assistant: { name: "Noah" },
        students: [
          { avatarKey: "student-curious", name: "Lena" },
          { avatarKey: "student-thinker", name: "Max" },
        ],
      },
      scenes: [
        {
          id: "discussion-scene",
          type: "discussion",
          title: "课堂讨论",
          beats: [
            {
              id: "discussion-beat",
              type: "conversation",
              messages: [
                {
                  speaker: "teacher",
                  avatarKey: "teacher",
                  text: "Let's begin.",
                },
                {
                  speaker: "student",
                  avatarKey: "student-thinker",
                  name: "Max",
                  text: "I think the second paragraph carries the key idea.",
                },
              ],
            },
          ],
        },
      ],
    };

    const playbackState = {
      activeSceneIndex: 0,
      actionCursorByScene: { "discussion-scene": 2 },
      mode: "playing",
    };

    const derived = getReadingDerivedState(course, playbackState, {});
    const latestMessage = derived.roundtableMessages.at(-1);

    expect(latestMessage).toMatchObject({
      role: "student",
      avatarKey: "student-thinker",
      name: "Max",
      content: "I think the second paragraph carries the key idea.",
    });
  });
});
