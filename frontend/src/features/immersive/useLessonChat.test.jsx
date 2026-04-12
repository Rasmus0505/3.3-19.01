import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useLessonChat } from "./useLessonChat";

describe("useLessonChat", () => {
  it("appends a scored voice message only after successful SOE result", async () => {
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
  });
});
