import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

let mockRewriteState = null;

vi.mock("../../app/authStorage", () => ({
  readCollinsLevel: () => 3,
}));

vi.mock("./ArticlePanel", () => ({
  computeDifficultyClassName: () => "difficulty-i-plus-one",
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
    readingCourse: mockRewriteState?.readingCourse ?? null,
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

vi.mock("./classroom/ReadingClassroom", () => ({
  ReadingClassroom: ({ course }) => <div>{course?.article_title || "ReadingClassroom"}</div>,
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
          { key: "parsing", label: "读取材料", status: "completed", progressPercent: 100 },
          { key: "difficulty_judgment", label: "确认目标难度", status: "completed", progressPercent: 100 },
          { key: "simplification_planning", label: "规划简化策略", status: "completed", progressPercent: 100 },
          { key: "text_rewriting", label: "生成 i+1 文本", status: "failed", progressPercent: 70 },
          { key: "reading_course_generation", label: "生成阅读课堂", status: "pending", progressPercent: 0 },
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
      expect(screen.getByText("生成中断")).toBeTruthy();
    });
    expect(screen.getByText("text rewriting failed")).toBeTruthy();
  });

  it("reopens completed history directly into the classroom surface", async () => {
    const user = userEvent.setup();
    mockRewriteState = {
      flowStatus: "generated",
      readingCourse: {
        mode: "reading_classroom_v1",
        article_title: "Reading Classroom",
        scenes: [{ id: "intro", type: "intro", title: "进入课堂", content: {} }],
      },
      historyMeta: {
        flowStatus: "generated",
        readingCourse: { mode: "reading_classroom_v1" },
      },
    };

    render(<ReadingPage accessToken="token" apiCall={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "选择历史记录" }));

    await waitFor(() => {
      expect(screen.getByText("Reading Classroom")).toBeTruthy();
    });
  });

  it("uses history meta to reopen the classroom immediately before async rewrite state finishes loading", async () => {
    const user = userEvent.setup();
    mockRewriteState = {
      flowStatus: "idle",
      readingCourse: null,
      historyMeta: {
        flowStatus: "generated",
        readingCourse: {
          mode: "reading_classroom_v2",
          article_title: "Recovered Classroom",
          scenes: [{ id: "entry", type: "entry", title: "进入课堂", beats: [] }],
        },
      },
    };

    render(<ReadingPage accessToken="token" apiCall={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "选择历史记录" }));

    await waitFor(() => {
      expect(screen.getByText("Recovered Classroom")).toBeTruthy();
    });
  });
});


