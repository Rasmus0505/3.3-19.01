/**
 * useRichLayout.ts — CEFR-aware Pretext 布局 hook
 * =================================================
 * 结合 @chenglou/pretext 的 prepareWithSegments/layoutWithLines 与
 * VocabAnalyzer 的词级 CEFR 查询，返回带 CEFR 元数据的行布局数据。
 *
 * 流程：text + font
 *   → prepareWithSegments(text, font)
 *   → enrichWithCefr(text) → RichSegment[]
 *   → layoutWithLines(prepared, maxWidth, lineHeight)
 *   → extractLineSegments(lines, segments) → RichLine[]
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  layoutWithLines,
  prepareWithSegments,
  type LayoutLine,
  type PreparedTextWithSegments,
} from "@chenglou/pretext";
import { VocabAnalyzer } from "../utils/vocabAnalyzer";

/** 单个词的 CEFR 标注 */
export interface RichSegment {
  text: string;
  cefrLevel: string | null;
  word: string;
}

/** 带 CEFR 元数据的单行 */
export interface RichLine {
  text: string;
  width: number;
  segments: RichSegment[];
}

/** VocabAnalyzer 单例（页面生命周期内只 load 一次） */
let _analyzerInstance: VocabAnalyzer | null = null;
let _analyzerLoadPromise: Promise<VocabAnalyzer> | null = null;

async function getOrCreateAnalyzer(): Promise<VocabAnalyzer> {
  if (_analyzerInstance?.isLoaded) {
    return _analyzerInstance;
  }
  if (_analyzerLoadPromise) {
    return _analyzerLoadPromise;
  }
  _analyzerLoadPromise = (async () => {
    _analyzerInstance = new VocabAnalyzer();
    await _analyzerInstance.load();
    return _analyzerInstance;
  })();
  return _analyzerLoadPromise;
}

/**
 * 对纯文本中每个词进行 CEFR 等级查询。
 * 使用 VocabAnalyzer.lookupCefrLevelForSurfaceForm —— 它不做 stopwords 过滤，
 * 保证所有词（包括介词、代词）都能查到等级。
 */
async function enrichWithCefr(text: string): Promise<RichSegment[]> {
  const analyzer = await getOrCreateAnalyzer();
  // 按空格分词，保持与 prepareWithSegments 段数一致
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  return words.map((word) => {
    const level = analyzer.lookupCefrLevelForSurfaceForm(word);
    const normalized = word.toLowerCase().replace(/[^a-zA-Z']/g, "");
    return {
      text: word,
      cefrLevel: level,
      word: normalized,
    };
  });
}

/**
 * 将 RichSegment[] 按 Pretext 行边界切分。
 * 策略：以 line.text 为准，用贪婪词匹配将 segments 分配到各行。
 */
function extractLineSegments(lines: LayoutLine[], allSegments: RichSegment[]): RichLine[] {
  const richLines: RichLine[] = [];
  let segmentIdx = 0;
  const cleanSegment = (s: string) => s.toLowerCase().replace(/[^a-zA-Z']/g, "");

  for (const line of lines) {
    const lineSegments: RichSegment[] = [];
    if (segmentIdx >= allSegments.length) break;

    let remaining = line.text;
    while (remaining.length > 0 && segmentIdx < allSegments.length) {
      const seg = allSegments[segmentIdx];
      const cleanSeg = cleanSegment(seg.text);
      if (!cleanSeg) {
        segmentIdx++;
        continue;
      }
      if (remaining.toLowerCase().startsWith(cleanSeg)) {
        lineSegments.push(seg);
        remaining = remaining.slice(seg.text.length).replace(/^\s+/, "");
        segmentIdx++;
      } else {
        // 标点或其他无法匹配的字符：消费 remaining 首字符，继续尝试匹配
        remaining = remaining.slice(1);
      }
    }

    richLines.push({
      text: line.text,
      width: line.width,
      segments: lineSegments,
    });
  }

  return richLines;
}

const DEFAULT_FONT = "16px Inter";
const DEFAULT_LINE_HEIGHT = 24;

/**
 * useRichLayout — CEFR-aware Pretext 行布局 hook
 *
 * @param text - 要渲染的英文文章文本
 * @param maxWidth - 内容区最大宽度（px）
 * @param font - CSS font shorthand（默认 "16px Inter"）
 * @param lineHeight - 行高 px（默认 24）
 *
 * 返回值：
 * - lines: RichLine[] — 每行的文本、宽度和带 CEFR 标注的分段
 * - isReady: boolean — 初始加载完成（含 VocabAnalyzer.load）
 * - reload: (text: string, maxWidth: number) => void — 重新测量
 * - analyzeProgress: { current: number, total: number } | null — 分析进度
 */
export function useRichLayout(
  text: string,
  maxWidth: number,
  font: string = DEFAULT_FONT,
  lineHeight: number = DEFAULT_LINE_HEIGHT
) {
  const [lines, setLines] = useState<RichLine[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preparedRef = useRef<PreparedTextWithSegments | null>(null);

  const compute = useCallback(
    async (textToMeasure: string, width: number) => {
      if (!textToMeasure.trim()) {
        setLines([]);
        setIsReady(true);
        setError(null);
        return;
      }

      try {
        setIsReady(false);
        setError(null);

        // 1. Pretext prepare（快速，内部缓存）
        const prepared = prepareWithSegments(textToMeasure, font);
        preparedRef.current = prepared;

        // 2. CEFR enrichment（异步，需要 load VocabAnalyzer）
        const segments = await enrichWithCefr(textToMeasure);

        // 3. layout
        const result = layoutWithLines(prepared, width, lineHeight);

        // 4. 切分到行
        const richLines = extractLineSegments(result.lines, segments);
        setLines(richLines);
        setIsReady(true);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        setLines([]);
        setIsReady(true);
      }
    },
    [font, lineHeight]
  );

  useEffect(() => {
    compute(text, maxWidth);
  }, [text, maxWidth, compute]);

  const reload = useCallback(
    (newText: string, newWidth: number) => {
      compute(newText, newWidth);
    },
    [compute]
  );

  return { lines, isReady, error, reload };
}
