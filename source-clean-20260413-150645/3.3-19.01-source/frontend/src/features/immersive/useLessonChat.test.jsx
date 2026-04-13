import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useLessonChat } from "./useLessonChat";

const storageKey = (lessonId) => `immersive-lesson-chat-v1:${lessonId}`;

describe("useLessonChat", () => {
  it("hydrates stored history per lesson and switches cleanly between lessons", () => {
    window.localStorage.clear();
    window.localStorage.setItem(
      storageKey(42),
      JSON.stringify([
        {
          id: "assistant-1",
          role: "assistant",
          content: "Let's start with the key sentence.",
          avatarKey: "teacher",
        },
      ]),
    );
    window.localStorage.setItem(
      storageKey(77),
      JSON.stringify([
        {
          id: "user-1",
          role: "user",
          content: "I think the speaker sounds nervous.",
          avatarKey: "user",
        },
      ]),
    );

    const apiClient = vi.fn();
    const { result, rerender } = renderHook(
      ({ lessonId }) => useLessonChat({ lessonId, accessToken: "token", apiClient }),
      { initialProps: { lessonId: 42 } },
    );

    expect(result.current.messages).toMatchObject([
      {
        role: "assistant",
        content: "Let's start with the key sentence.",
      },
    ]);

    rerender({ lessonId: 77 });

    expect(result.current.messages).toMatchObject([
      {
        role: "user",
        content: "I think the speaker sounds nervous.",
      },
    ]);
  });

  it("appends a scored voice message only after successful SOE result", async () => {
    window.localStorage.clear();
    const apiClient = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          reply: "Tell me more about that scene.",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const { result } = renderHook(() =>
      useLessonChat({ lessonId: 42, accessToken: "token", apiClient }),
    );

    await act(async () => {
      await result.current.sendVoiceMessage({
        ok: true,
        voice_id: "voice-1",
        ref_text: "How are you today",
        user_text: "I am good today",
        total_score: 88,
        pronunciation_score: 84,
        fluency_score: 79,
        completeness_score: 91,
        word_results: [],
      });
    });

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(2);
    });

    expect(result.current.messages[0]).toMatchObject({
      role: "user",
      inputMode: "voice",
      avatarKey: "user",
      content: "I am good today",
    });
    expect(result.current.messages[0].soeData).toMatchObject({
      ok: true,
      total_score: 88,
      pronunciation_score: 84,
      fluency_score: 79,
    });
    expect(result.current.messages[1]).toMatchObject({
      role: "assistant",
      avatarKey: "teacher",
      content: "Tell me more about that scene.",
    });
    expect(apiClient).toHaveBeenCalledWith(
      "/api/lesson-chat/message",
      expect.objectContaining({
        method: "POST",
      }),
      "token",
    );
    expect(JSON.parse(window.localStorage.getItem(storageKey(42)) || "[]")).toMatchObject([
      {
        role: "user",
        content: "I am good today",
        inputMode: "voice",
      },
      {
        role: "assistant",
        content: "Tell me more about that scene.",
      },
    ]);
  });

  it("clears in-memory and persisted chat history together", async () => {
    window.localStorage.clear();
    window.localStorage.setItem(
      storageKey(42),
      JSON.stringify([
        {
          id: "assistant-1",
          role: "assistant",
          content: "Stored reply",
          avatarKey: "teacher",
        },
      ]),
    );

    const { result } = renderHook(() =>
      useLessonChat({ lessonId: 42, accessToken: "token", apiClient: vi.fn() }),
    );

    expect(result.current.messages).toHaveLength(1);

    await act(async () => {
      result.current.clearHistory();
    });

    expect(result.current.messages).toEqual([]);
    expect(window.localStorage.getItem(storageKey(42))).toBeNull();
  });
});
