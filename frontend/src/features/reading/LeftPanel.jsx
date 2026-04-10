/**
 * LeftPanel.jsx — 阅读板块左侧面板
 * =================================
 * 两种模式：
 * - 输入模式（空状态 / 有内容）：tab bar + 输入区域
 * - 阅读模式：渲染 ArticlePanel，带「重新输入」按钮
 *
 * Phase 39: 新增多模态输入标签栏
 *   - 文本（默认）：textarea 直接粘贴/输入
 *   - 网页链接：URL 输入框，调用后端 /api/extract/url
 *   - PDF：文件拖放，客户端 pdf.js 提取
 *   - 字幕：.srt/.vtt 文件拖放，客户端解析
 *   - 图片OCR：图片上传，调用后端 /api/extract/ocr
 *
 * Props:
 *   mode           {'input'|'reading'}
 *   articleText    {string} — 当前文章文本（阅读模式使用）
 *   onSubmit       {(text: string, sourceMetadata?: object) => void} — 提交文章
 *   onEditAgain    {() => void} — 重新输入
 *   contentWidth   {number}
 *   onWidthChange  {(w: number) => void}
 *   articleLines   {RichLine[]} — 传给 ArticlePanel 的行数据
 *   onLinesReady   {(lines: RichLine[]) => void}
 *   selectedWords  {WordItem[]}
 *   onWordClick    {(word, segment) => void}
 *   rewriteMappings {{original, rewritten}[]}
 *   validI1Words  {string[]} — 有效的 i+1 词汇列表
 *   validAboveI1Words {string[]} — 有效的 >i+1 词汇列表
 *   removedWords {string[]} — DeepSeek 过滤掉的词（过于简单，不再标红）
 *   wordLevels {object} — 二次筛选后的最终等级 {wordLower: level}
 *   accessToken {string} — 当前用户 token（URL/OCR tab 需要）
 */
import { lazy, Suspense, useCallback, useRef, useState } from "react";
import { Captions, FileText, Globe, Image, Loader2, Unlock } from "lucide-react";
import { cn } from "../../lib/utils";
import { readSubtitleFile } from "./inputAdapters/subtitleParser";
import { extractPdfText } from "./inputAdapters/pdfExtractor";
import { extractUrl, extractOcr } from "./api/extractApi";
import "./reading.css";

const ArticlePanel = lazy(() => import("./ArticlePanel").then((m) => ({ default: m.ArticlePanel })));

/* ─── 标签定义 ─────────────────────────────────────── */

const INPUT_TABS = [
  { id: "text", label: "文本" },
  { id: "url", label: "网页链接", icon: Globe },
  { id: "pdf", label: "PDF", icon: FileText },
  { id: "subtitle", label: "字幕", icon: Captions },
  { id: "ocr", label: "图片OCR", icon: Image },
];

/* ─── 输入模式占位提示 ─────────────────────────────── */

function InputPlaceholder() {
  return (
    <div className="left-panel__placeholder">
      <div className="left-panel__placeholder-icon">
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="6" y="8" width="28" height="24" rx="3" stroke="currentColor" strokeWidth="1.5" fill="none" />
          <line x1="11" y1="15" x2="29" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="11" y1="20" x2="25" y2="20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="11" y1="25" x2="21" y2="25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
      <p className="left-panel__placeholder-title">粘贴或输入英文文章</p>
      <p className="left-panel__placeholder-hint">
        直接在下方输入框粘贴文章，自动进行 CEFR 难度分析
      </p>
    </div>
  );
}

/* ─── 重新输入按钮 ─────────────────────────────────── */

function EditAgainButton({ onClick }) {
  return (
    <button className="left-panel__edit-again" onClick={onClick}>
      重新输入
    </button>
  );
}

/* ─── 文本 Tab ─────────────────────────────────────── */

function TextTab({ onSubmit }) {
  const [draft, setDraft] = useState("");
  const draftRef = useRef("");

  const handleDraftChange = useCallback((value) => {
    setDraft(value);
    draftRef.current = value;
  }, []);

  const handleConfirm = useCallback(() => {
    const trimmed = draftRef.current.trim();
    if (trimmed.length > 0) {
      onSubmit(trimmed, { type: "text" });
    }
  }, [onSubmit]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleConfirm();
      }
    },
    [handleConfirm]
  );

  const charCount = draft.length;
  const hasContent = draft.trim().length > 0;

  return (
    <>
      {!hasContent && <InputPlaceholder />}
      <div className={cn("left-panel__input-area", !hasContent && "left-panel__input-area--empty")}>
        <textarea
          className="left-panel__textarea"
          value={draft}
          onChange={(e) => handleDraftChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder=""
          spellCheck={false}
          autoFocus
          aria-label="输入或粘贴英文文章"
        />
        {hasContent && (
          <div className="left-panel__input-footer">
            <span className="left-panel__char-count">{charCount} 字符</span>
            <button className="btn-unlock" onClick={handleConfirm}>
              <span className="inline-flex items-center gap-2">
                <Unlock className="size-4" />
                Unlock
              </span>
            </button>
          </div>
        )}
      </div>
    </>
  );
}

/* ─── URL Tab ──────────────────────────────────────── */

function UrlTab({ onSubmit, accessToken }) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleExtract = useCallback(async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    try {
      const result = await extractUrl(trimmed, accessToken);
      onSubmit(result.text, { type: "url", sourceUrl: trimmed, title: result.title });
    } catch (err) {
      setError(err.message || "无法提取该网页内容，请检查链接是否正确");
    } finally {
      setLoading(false);
    }
  }, [url, accessToken, onSubmit]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleExtract();
      }
    },
    [handleExtract]
  );

  return (
    <div className="left-panel__source-tab">
      <p className="left-panel__source-hint">
        粘贴英文网页链接，自动提取文章正文
      </p>
      <div className="left-panel__url-row">
        <input
          className="left-panel__url-input"
          type="url"
          value={url}
          onChange={(e) => { setUrl(e.target.value); setError(null); }}
          onKeyDown={handleKeyDown}
          placeholder="https://example.com/article"
          disabled={loading}
          autoFocus
        />
        <button
          className="btn-unlock left-panel__source-btn"
          onClick={handleExtract}
          disabled={!url.trim() || loading}
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Globe className="size-4" />}
          {loading ? "提取中…" : "提取"}
        </button>
      </div>
      {error && <p className="left-panel__source-error">{error}</p>}
    </div>
  );
}

/* ─── 文件拖放区域 ─────────────────────────────────── */

function FileDropzone({ accept, hint, onFile, loading, disabled }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const handleFile = useCallback(
    (file) => {
      if (!file) return;
      onFile(file);
    },
    [onFile]
  );

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      handleFile(file);
    },
    [handleFile]
  );

  return (
    <div
      className={cn("left-panel__dropzone", dragging && "left-panel__dropzone--drag", (loading || disabled) && "left-panel__dropzone--disabled")}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => !loading && !disabled && inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(e) => handleFile(e.target.files?.[0])}
        disabled={loading || disabled}
      />
      {loading ? (
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      ) : (
        <>
          <p className="left-panel__dropzone-hint">{hint}</p>
          <p className="left-panel__dropzone-sub">点击选择或拖放文件</p>
        </>
      )}
    </div>
  );
}

/* ─── PDF Tab ──────────────────────────────────────── */

function PdfTab({ onSubmit }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleFile = useCallback(async (file) => {
    setLoading(true);
    setError(null);
    try {
      const result = await extractPdfText(file);
      onSubmit(result.text, { type: "pdf", filename: file.name, pageCount: result.pageCount });
    } catch (err) {
      setError(err.message || "无法解析该 PDF 文件");
    } finally {
      setLoading(false);
    }
  }, [onSubmit]);

  return (
    <div className="left-panel__source-tab">
      <p className="left-panel__source-hint">上传 PDF 文件，自动提取英文文字</p>
      <FileDropzone
        accept=".pdf,application/pdf"
        hint="选择 PDF 文件（最大 10MB）"
        onFile={handleFile}
        loading={loading}
      />
      {error && <p className="left-panel__source-error">{error}</p>}
    </div>
  );
}

/* ─── 字幕 Tab ─────────────────────────────────────── */

function SubtitleTab({ onSubmit }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleFile = useCallback(async (file) => {
    setLoading(true);
    setError(null);
    try {
      const result = await readSubtitleFile(file);
      onSubmit(result.text, { type: "subtitle", filename: file.name, format: result.format });
    } catch (err) {
      setError(err.message || "无法解析字幕文件格式");
    } finally {
      setLoading(false);
    }
  }, [onSubmit]);

  return (
    <div className="left-panel__source-tab">
      <p className="left-panel__source-hint">上传字幕文件，提取英文对白文本</p>
      <FileDropzone
        accept=".srt,.vtt,text/plain"
        hint="选择 .srt 或 .vtt 字幕文件（最大 2MB）"
        onFile={handleFile}
        loading={loading}
      />
      {error && <p className="left-panel__source-error">{error}</p>}
    </div>
  );
}

/* ─── OCR Tab ──────────────────────────────────────── */

function OcrTab({ onSubmit, accessToken }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleFile = useCallback(async (file) => {
    setLoading(true);
    setError(null);
    try {
      const result = await extractOcr(file, accessToken);
      onSubmit(result.text, { type: "ocr", filename: file.name });
    } catch (err) {
      setError(err.message || "图片识别失败，请确保图片清晰且包含英文文字");
    } finally {
      setLoading(false);
    }
  }, [accessToken, onSubmit]);

  return (
    <div className="left-panel__source-tab">
      <p className="left-panel__source-hint">上传含英文文字的图片，自动识别文本</p>
      <FileDropzone
        accept="image/*"
        hint="选择图片文件（最大 5MB）"
        onFile={handleFile}
        loading={loading}
      />
      {error && <p className="left-panel__source-error">{error}</p>}
    </div>
  );
}

/* ─── LeftPanel ───────────────────────────────────── */

export function LeftPanel({
  mode,
  articleText,
  onSubmit,
  onEditAgain,
  showEditAgain = true,
  contentWidth,
  onWidthChange,
  onLinesReady,
  selectedWords,
  onWordClick,
  activeLevels,
  rewriteMappings,
  validI1Words = [],
  validAboveI1Words = [],
  removedWords = [],
  wordLevels = {},
  viewMode = "original",
  isRewriting = false,
  rewriteError = null,
  accessToken = "",
}) {
  const [activeTab, setActiveTab] = useState("text");

  const handleTabSubmit = useCallback(
    (text, sourceMetadata) => {
      onSubmit(text, sourceMetadata);
    },
    [onSubmit]
  );

  if (mode === "reading") {
    return (
      <div className="left-panel left-panel--reading">
        <div className="left-panel__reading-area">
          {isRewriting ? (
            <div className="left-panel__rewriting-overlay">
              <div className="left-panel__rewriting-spinner" />
              <p className="left-panel__rewriting-text">
                Unlock 中...
              </p>
              <p className="left-panel__rewriting-sub">
                DeepSeek 正在判断每个词是否真的超过你的水平
              </p>
            </div>
          ) : rewriteError ? (
            <div className="left-panel__error-state">
              <p className="left-panel__error-text">简化失败：{rewriteError}</p>
            </div>
          ) : null}
          <Suspense fallback={<LeftPanelSkeleton />}>
            <ArticlePanel
              text={articleText}
              contentWidth={contentWidth}
              onWidthChange={onWidthChange}
              onWordClick={onWordClick}
              onLinesReady={onLinesReady}
              selectedWords={selectedWords}
              activeLevels={activeLevels}
              rewriteMappings={rewriteMappings}
              validI1Words={validI1Words}
              validAboveI1Words={validAboveI1Words}
              removedWords={removedWords}
              wordLevels={wordLevels}
              viewMode={viewMode}
            />
          </Suspense>
        </div>
        {showEditAgain ? <EditAgainButton onClick={onEditAgain} /> : null}
      </div>
    );
  }

  // mode === 'input'
  return (
    <div className="left-panel left-panel--input">
      {/* 标签栏 */}
      <div className="left-panel__tabs" role="tablist">
        {INPUT_TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              className={cn("left-panel__tab", activeTab === tab.id && "left-panel__tab--active")}
              onClick={() => setActiveTab(tab.id)}
            >
              {Icon && <Icon className="size-3.5" />}
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* 标签内容 */}
      <div className="left-panel__tab-content">
        {activeTab === "text" && <TextTab onSubmit={handleTabSubmit} />}
        {activeTab === "url" && <UrlTab onSubmit={handleTabSubmit} accessToken={accessToken} />}
        {activeTab === "pdf" && <PdfTab onSubmit={handleTabSubmit} />}
        {activeTab === "subtitle" && <SubtitleTab onSubmit={handleTabSubmit} />}
        {activeTab === "ocr" && <OcrTab onSubmit={handleTabSubmit} accessToken={accessToken} />}
      </div>
    </div>
  );
}

function LeftPanelSkeleton() {
  const widths = [88, 72, 95, 60, 80, 68, 90, 55, 75, 85];
  return (
    <div className="article-panel">
      <div className="article-content">
        {widths.map((w, i) => (
          <div key={i} className="article-line" aria-hidden="true">
            <div
              className="h-5 animate-pulse rounded bg-muted"
              style={{ width: `${w}%`, animationDelay: `${i * 50}ms` }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
