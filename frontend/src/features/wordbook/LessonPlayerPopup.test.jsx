import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LessonPlayerPopup } from "./LessonPlayerPopup";

vi.mock("../../shared/media/localMediaStore", () => ({
  getLessonMedia: vi.fn(async () => null),
}));

describe("LessonPlayerPopup", () => {
  beforeEach(() => {
    global.URL.createObjectURL = vi.fn(() => "blob:wordbook-media");
    global.URL.revokeObjectURL = vi.fn();
    HTMLMediaElement.prototype.pause = vi.fn();
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue();
  });

  it("loads lesson detail and main media through apiCall", async () => {
    const apiCall = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 12,
            title: "Replay Lesson",
            media_storage: "server",
            source_filename: "demo.mp4",
            sentences: [
              {
                idx: 0,
                begin_ms: 0,
                end_ms: 1200,
                text_en: "Hello world",
                text_zh: "你好，世界",
                tokens: ["Hello", "world"],
                audio_url: "/api/lessons/12/sentences/0/audio",
              },
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(new Blob(["media"], { type: "video/mp4" }), {
          status: 200,
          headers: { "Content-Type": "video/mp4" },
        }),
      );

    render(
      <LessonPlayerPopup
        open
        onClose={() => {}}
        lessonId={12}
        sentenceIndex={0}
        highlightStartTokenIndex={0}
        highlightEndTokenIndex={0}
        entryText="Hello"
        apiCall={apiCall}
      />,
    );

    await waitFor(() => {
      expect(apiCall).toHaveBeenCalledWith("/api/lessons/12");
      expect(apiCall).toHaveBeenCalledWith("/api/lessons/12/media");
    });

    await screen.findAllByText("Replay Lesson");
    expect(screen.getByText("Hello")).toBeTruthy();
    expect(screen.getByText("高亮词条：Hello")).toBeTruthy();
    expect(document.querySelector(".text-primary")).not.toBeNull();
    expect(document.querySelector("video")).not.toBeNull();
  });
});
