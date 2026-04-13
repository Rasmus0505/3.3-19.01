import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ChatMessage } from "./ChatMessage";

describe("ChatMessage", () => {
  it("renders user voice message avatar and opens SOE detail", async () => {
    const user = userEvent.setup();

    render(
      <ChatMessage
        message={{
          id: "user-1",
          role: "user",
          content: "I am good today",
          avatarKey: "user",
          inputMode: "voice",
          soeData: {
            ok: true,
            ref_text: "How are you today",
            user_text: "I am good today",
            total_score: 88,
            pronunciation_score: 84,
            fluency_score: 79,
            completeness_score: 91,
            word_results: [],
          },
        }}
        accessToken="token"
        apiClient={vi.fn()}
      />,
    );

    const avatar = screen.getByAltText("You");
    expect(avatar.getAttribute("src")).toContain("/avatars/user.png");

    await user.click(screen.getByRole("button", { name: /查看详情/i }));

    expect(await screen.findByText("参考文本")).toBeTruthy();
    expect(screen.getByText("How are you today")).toBeTruthy();
  });

  it("renders assistant avatar with public asset path", () => {
    const { container } = render(
      <ChatMessage
        message={{
          id: "assistant-1",
          role: "assistant",
          content: "Let's talk about what you heard.",
          avatarKey: "teacher",
        }}
        accessToken=""
        apiClient={null}
      />,
    );

    const avatar = screen.getByAltText("AI");
    expect(avatar.getAttribute("src")).toContain("/avatars/teacher.png");
    expect(screen.getByText("AI Teacher")).toBeTruthy();
    expect(container.querySelector(".chat-msg__bubble--ai")).toBeTruthy();
  });

  it("renders user and assistant messages as distinct chat bubbles", () => {
    const { container, rerender } = render(
      <ChatMessage
        message={{
          id: "user-2",
          role: "user",
          content: "I only caught the last part.",
          avatarKey: "user",
        }}
        accessToken=""
        apiClient={null}
      />,
    );

    expect(screen.getByText("You")).toBeTruthy();
    expect(container.querySelector(".chat-msg__bubble--user")).toBeTruthy();

    rerender(
      <ChatMessage
        message={{
          id: "assistant-2",
          role: "assistant",
          content: "Try listening again for the transition phrase.",
          avatarKey: "teacher",
        }}
        accessToken=""
        apiClient={null}
      />,
    );

    expect(screen.getByText("AI Teacher")).toBeTruthy();
    expect(container.querySelector(".chat-msg__bubble--ai")).toBeTruthy();
  });
});
