import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ExplanationSidebarContent from "./ExplanationSidebarContent";

describe("ExplanationSidebarContent", () => {
  it("renders previous subtitle context above the explanation content", () => {
    const { container } = render(
      <ExplanationSidebarContent
        sentence={{ text_en: "Current line" }}
        explanation={{
          key_explanations: [
            {
              original_word: "resilient",
              explanation: "able to recover quickly",
              simple_example: "Small teams stay resilient under pressure.",
            },
          ],
          simplified_sentence: "The speaker says the team can recover fast.",
          listen_tips: "Listen for the stress on the key adjective.",
        }}
        previousSentence="They kept working after the setback."
        previousSentenceTranslation="他们在受挫后还是继续推进。"
        wordStatuses={[]}
        expectedTokens={[]}
        sentenceTypingDone
        showKeywordHints={false}
      />,
    );

    expect(screen.getByText("上一句")).toBeTruthy();
    expect(screen.getByText("They kept working after the setback.")).toBeTruthy();
    expect(screen.getByText("他们在受挫后还是继续推进。")).toBeTruthy();
    expect(screen.getByText("关键表达讲解")).toBeTruthy();

    const panel = container.querySelector(".immersive-explanation-panel");
    expect(panel?.firstElementChild?.classList.contains("immersive-explanation-panel__context-card")).toBe(true);
  });

  it("shows a graceful fallback when there is no previous subtitle", () => {
    render(
      <ExplanationSidebarContent
        sentence={{ text_en: "Current line" }}
        explanation={null}
        previousSentence=""
        previousSentenceTranslation=""
        wordStatuses={[]}
        expectedTokens={[]}
        sentenceTypingDone={false}
        showKeywordHints={false}
      />,
    );

    expect(screen.getByText("上一句")).toBeTruthy();
    expect(screen.getByText("(当前是第一句，暂时没有上一句字幕)")).toBeTruthy();
    expect(screen.getByText("(暂无上一句翻译)")).toBeTruthy();
  });
});
