import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

let mockRewriteState = null;

vi.mock("../../app/authStorage", () => ({
  readCefrLevel: () => "B1",
}));

vi.mock("./ArticlePanel", () => ({
  computeCefrClassName: () => "cefr-i-plus-one",
  ArticlePanel: () => <div>ArticlePanel</div>,
}));

vi.mock("../../hooks/useRichLayout", () => ({
  getOrCreateAnalyzer: vi.fn(),
}));

vi.mock("../../hooks/useReadingRewrite", () => ({
  useReadingRewrite: ({ articleId }) => ({
    rewrittenText: mockRewriteState?.rewrittenText ?? null,
    rewriteMappings: mockRewriteState?.rewriteMappings ?? [],
    validI1Words: mockRewriteState?.validI1Words ?? [],
    validAboveI1Words: mockRewriteState?.validAboveI1Words ?? [],
    removedWords: mockRewriteState?.removedWords ?? [],
    wordLevels: mockRewriteState?.wordLevels ?? {},
    viewMode: "original",
    setViewMode: vi.fn(),
    packViewMode: mockRewriteState?.packViewMode ?? "original",
    setPackViewMode: vi.fn(),
    isRewriting: false,
    rewriteError: mockRewriteState?.rewriteError ?? null,
    diagnosticSnapshot: mockRewriteState?.diagnosticSnapshot ?? null,
    flowStatus: articleId ? mockRewriteState?.flowStatus ?? "idle" : "idle",
    pipelineState: mockRewriteState?.pipelineState ?? { stages: [] },
    readingPack: mockRewriteState?.readingPack ?? null,
    saveDiagnosticSnapshot: vi.fn(),
    clearRewrite: vi.fn(),
    handleRewrite: vi.fn(),
  }),
}));

vi.mock("./useVocabularyFilter", () => ({
  useVocabularyFilter: () => ({}),
}));

vi.mock("./HistoryPanel", () => ({
  HistoryPanel: ({ onSelect }) => (
    <button
      type="button"
      onClick={() =>
        onSelect?.(
          { id: "history-1", text: "Original article text." },
          mockRewriteState?.historyMeta || null,
        )
      }
    >
      选择历史记录
    </button>
  ),
  saveHistoryRecord: vi.fn(),
}));

vi.mock("./LeftPanel", () => ({
  LeftPanel: ({ mode, articleText }) => (
    <div data-testid={`left-panel-${mode}`}>{articleText || "empty-left-panel"}</div>
  ),
}));

vi.mock("./AnalysisPanel", () => ({
  AnalysisPanel: () => <div>AnalysisPanel</div>,
  getDefaultActiveLevels: () => ["B2", "C1", "C2", "SUPER"],
}));

vi.mock("./DiagnosticPanel", () => ({
  DiagnosticPanel: () => <div>DiagnosticPanel</div>,
}));

vi.mock("../wordbook/TranslationDialog", () => ({
  TranslationDialog: () => null,
}));

vi.mock("./api/readingRewriteApi", () => ({
  estimateRewriteTokens: vi.fn(),
}));

import { ReadingPage } from "./ReadingPage";

describe("ReadingPage phase 36 flow", () => {
  beforeEach(() => {
    mockRewriteState = null;
  });

  it("reopens interrupted work into the pipeline surface and preserves original fallback", async () => {
    const user = userEvent.setup();
    mockRewriteState = {
      flowStatus: "failed",
      diagnosticSnapshot: { selectedTargetLevel: "B2" },
      rewriteError: "text rewriting failed",
      pipelineState: {
        currentStage: "text_rewriting",
        lastCompletedStage: "simplification_planning",
        resumeAvailable: true,
        error: { stage: "text_rewriting", message: "text rewriting failed" },
        stages: [
          { key: "parsing", label: "parsing", status: "completed", progressPercent: 100 },
          { key: "difficulty_judgment", label: "difficulty judgment", status: "completed", progressPercent: 100 },
          { key: "simplification_planning", label: "simplification planning", status: "completed", progressPercent: 100 },
          { key: "text_rewriting", label: "text rewriting", status: "failed", progressPercent: 70 },
          { key: "reading_pack_assembly", label: "reading-pack assembly", status: "pending", progressPercent: 0 },
        ],
      },
      historyMeta: {
        flowStatus: "failed",
        pipeline: {
          currentStage: "text_rewriting",
          lastCompletedStage: "simplification_planning",
        },
        diagnosticSnapshot: { selectedTargetLevel: "B2" },
      },
    };

    render(<ReadingPage accessToken="token" apiCall={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "选择历史记录" }));

    await waitFor(() => {
      expect(screen.getByText("把材料组装成可回看的阅读包")).toBeTruthy();
    });
    expect(screen.getByText("在“text rewriting”阶段中断")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /查看原文/i }));
    expect(screen.getByTestId("left-panel-reading").textContent).toContain("Original article text.");
  });

  it("reopens completed history directly into the pack surface", async () => {
    const user = userEvent.setup();
    mockRewriteState = {
      flowStatus: "generated",
      packViewMode: "original",
      readingPack: {
        status: "completed",
        targetLevel: "B2",
        assembledAt: 1710000000000,
        originalText: "Original article text.",
        rewrittenText: "Simplified article text.",
        diagnosticSummary: {
          materialDifficulty: "C1",
          preservedI1Count: 4,
          aboveI1Count: 3,
        },
        comparisonCards: [],
      },
      historyMeta: {
        flowStatus: "generated",
        readingPack: {
          status: "completed",
        },
      },
    };

    render(<ReadingPage accessToken="token" apiCall={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "选择历史记录" }));

    await waitFor(() => {
      expect(screen.getByText("这份材料现在是一份可回看的阅读包")).toBeTruthy();
    });
    expect(screen.getByRole("tab", { name: "原文" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "i+1" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "逐句对照" })).toBeTruthy();
  });
});
