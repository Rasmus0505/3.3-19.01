import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ReadingPackPanel } from "./ReadingPackPanel";

vi.mock("./ArticlePanel", () => ({
  ArticlePanel: ({ text, viewMode }) => (
    <div data-testid={`article-panel-${viewMode}`}>{text}</div>
  ),
}));

const pack = {
  status: "completed",
  assembledAt: 1710000000000,
  targetLevel: "B2",
  originalText: "Original sentence.",
  rewrittenText: "Simplified sentence.",
  mappings: [{ original: "Simplified", rewritten: "Original", confirmed: true }],
  wordLevels: { original: "C1" },
  validI1Words: ["target"],
  validAboveI1Words: ["original"],
  removedWords: [],
  diagnosticSummary: {
    materialDifficulty: "C1",
    preservedI1Count: 4,
    aboveI1Count: 3,
  },
  comparisonCards: [
    {
      id: "comparison-1",
      originalText: "Original sentence.",
      rewrittenText: "Simplified sentence.",
    },
  ],
};

describe("ReadingPackPanel", () => {
  it("renders pack header and summary metrics", () => {
    render(
      <ReadingPackPanel
        pack={pack}
        packViewMode="original"
        onPackViewModeChange={() => {}}
        contentWidth={640}
        onWidthChange={() => {}}
        onLinesReady={() => {}}
      />
    );

    expect(screen.getByText("这份材料现在是一份可回看的阅读包")).toBeTruthy();
    expect(screen.getByText("材料难度")).toBeTruthy();
    expect(screen.getByText("保留 i+1 词")).toBeTruthy();
    expect(screen.getByText("超纲表达")).toBeTruthy();
    expect(screen.getByText(/目标/).textContent).toContain("B2");
  });

  it("switches between original, i+1, and comparison modes", async () => {
    const user = userEvent.setup();
    const onPackViewModeChange = vi.fn();
    const { rerender } = render(
      <ReadingPackPanel
        pack={pack}
        packViewMode="original"
        onPackViewModeChange={onPackViewModeChange}
        contentWidth={640}
        onWidthChange={() => {}}
        onLinesReady={() => {}}
      />
    );

    expect(screen.getByTestId("article-panel-original").textContent).toContain("Original sentence.");

    await user.click(screen.getByRole("tab", { name: "i+1" }));
    expect(onPackViewModeChange).toHaveBeenCalledWith("rewritten");

    rerender(
      <ReadingPackPanel
        pack={pack}
        packViewMode="rewritten"
        onPackViewModeChange={onPackViewModeChange}
        contentWidth={640}
        onWidthChange={() => {}}
        onLinesReady={() => {}}
      />
    );
    expect(screen.getByTestId("article-panel-rewritten").textContent).toContain("Simplified sentence.");

    rerender(
      <ReadingPackPanel
        pack={pack}
        packViewMode="comparison"
        onPackViewModeChange={onPackViewModeChange}
        contentWidth={640}
        onWidthChange={() => {}}
        onLinesReady={() => {}}
      />
    );
    expect(screen.getByText("原句")).toBeTruthy();
    expect(screen.getByText("Simplified sentence.")).toBeTruthy();
  });
});


