/**
 * useRichLayout.ts — CEFR-aware Pretext 布局 hook
 * =================================================
 * 结合 @chenglou/pretext 的 prepareWithSegments/layoutWithLines 与
 * VocabAnalyzer 的词级 CEFR 查询，返回带 CEFR 元数据的行布局数据。
 *
 * 流程：text + font
 *   → prepareWithSegments(text, font)
 *   → layoutWithLines(prepared, maxWidth, lineHeight)
 *   → 用每条 LayoutLine 的 start/end 游标在 prepared.segments 上切片 → RichLine[]
 *   （不再用 line.text 与 split(/\\s+/) 词做前缀匹配：Pretext 行内逗号等处无空格，会失步导致只渲染首行）
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

/** 与 @chenglou/pretext buildLineTextFromRange 中 discretionary hyphen 判定一致 */
function lineHasDiscretionaryHyphen(
  kinds: readonly string[],
  startSegmentIndex: number,
  startGraphemeIndex: number,
  endSegmentIndex: number
): boolean {
  return (
    endSegmentIndex > 0 &&
    kinds[endSegmentIndex - 1] === "soft-hyphen" &&
    !(startSegmentIndex === endSegmentIndex && startGraphemeIndex > 0)
  );
}

function getSegmentGraphemesFromCache(
  segmentIndex: number,
  segments: readonly string[],
  cache: Map<number, string[]>
): string[] {
  let g = cache.get(segmentIndex);
  if (g) return g;
  const raw = segments[segmentIndex] ?? "";
  const ge = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  g = [];
  for (const x of ge.segment(raw)) {
    g.push(x.segment);
  }
  cache.set(segmentIndex, g);
  return g;
}

function pushRichPiece(
  out: RichSegment[],
  piece: string,
  kind: string,
  analyzer: VocabAnalyzer
): void {
  if (!piece) return;
  if (kind === "space" || kind === "preserved-space") {
    out.push({ text: piece, cefrLevel: null, word: "" });
    return;
  }
  if (kind === "zero-width-break" || kind === "tab" || kind === "glue") {
    out.push({ text: piece, cefrLevel: null, word: "" });
    return;
  }
  if (kind === "soft-hyphen" || kind === "hard-break") {
    return;
  }
  const level = analyzer.lookupCefrLevelForSurfaceForm(piece);
  const normalized = piece.toLowerCase().replace(/[^a-zA-Z']/g, "");
  out.push({ text: piece, cefrLevel: level, word: normalized });
}

/**
 * 按 Pretext 的 segment 游标收集本行要渲染的片段（与 line.text 逐字对齐）
 */
function collectRichSegmentsForLayoutLine(
  prepared: PreparedTextWithSegments,
  line: LayoutLine,
  analyzer: VocabAnalyzer,
  graphemeCache: Map<number, string[]>
): RichSegment[] {
  const segments = prepared.segments;
  const kinds = prepared.kinds as readonly string[];
  const out: RichSegment[] = [];

  const si = line.start.segmentIndex;
  const sg = line.start.graphemeIndex;
  const ei = line.end.segmentIndex;
  const eg = line.end.graphemeIndex;

  const endsWithDiscretionaryHyphen = lineHasDiscretionaryHyphen(kinds, si, sg, ei);

  for (let i = si; i < ei; i++) {
    const kind = kinds[i] ?? "text";
    if (kind === "soft-hyphen" || kind === "hard-break") continue;

    let piece: string;
    if (i === si && sg > 0) {
      piece = getSegmentGraphemesFromCache(i, segments, graphemeCache).slice(sg).join("");
    } else {
      piece = segments[i] ?? "";
    }
    pushRichPiece(out, piece, kind, analyzer);
  }

  if (eg > 0) {
    if (endsWithDiscretionaryHyphen) {
      pushRichPiece(out, "-", "text", analyzer);
    }
    const gStart = si === ei ? sg : 0;
    const graphemes = getSegmentGraphemesFromCache(ei, segments, graphemeCache);
    const piece = graphemes.slice(gStart, eg).join("");
    const endKind = kinds[ei] ?? "text";
    pushRichPiece(out, piece, endKind, analyzer);
  } else if (endsWithDiscretionaryHyphen) {
    pushRichPiece(out, "-", "text", analyzer);
  }

  return out;
}

function layoutLinesToRichLines(
  prepared: PreparedTextWithSegments,
  lines: LayoutLine[],
  analyzer: VocabAnalyzer
): RichLine[] {
  const graphemeCache = new Map<number, string[]>();
  return lines.map((line) => ({
    text: line.text,
    width: line.width,
    segments: collectRichSegmentsForLayoutLine(prepared, line, analyzer, graphemeCache),
  }));
}

const DEFAULT_FONT = "16px Inter";
const DEFAULT_LINE_HEIGHT = 24;

/**
 * useRichLayout — CEFR-aware Pretext 行布局 hook
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
      // #region agent log
      fetch('http://127.0.0.1:7741/ingest/66ae8bbb-d4f3-40a4-b6d9-17b56f3fcb44',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'1b6cad'},body:JSON.stringify({sessionId:'1b6cad',location:'useRichLayout.ts:compute-start',message:'compute started - width changed',data:{textLen:textToMeasure.length,width,prevLinesCount:lines.length},timestamp:Date.now(),runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion

      if (!textToMeasure.trim()) {
        setLines([]);
        setIsReady(true);
        setError(null);
        return;
      }

      try {
        // FIX: Don't set isReady(false) immediately. Instead:
        // 1. Compute new layout first (keeping old content visible)
        // 2. Only update state when new layout is ready
        // This prevents the skeleton flicker during resize
        const prepared = prepareWithSegments(textToMeasure, font);
        preparedRef.current = prepared;
        const analyzer = await getOrCreateAnalyzer();
        const result = layoutWithLines(prepared, width, lineHeight);
        const richLines = layoutLinesToRichLines(prepared, result.lines, analyzer);

        // #region agent log
        const segTotal = richLines.reduce((n, l) => n + l.segments.length, 0);
        fetch('http://127.0.0.1:7741/ingest/66ae8bbb-d4f3-40a4-b6d9-17b56f3fcb44',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'1b6cad'},body:JSON.stringify({sessionId:'1b6cad',location:'useRichLayout.ts:compute-done',message:'new layout computed - now updating state',data:{textLen:textToMeasure.length,width,newLinesCount:richLines.length,newSegsTotal:segTotal},timestamp:Date.now(),runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion

        // Only now update state - old content was still visible during computation
        setLines(richLines);
        setIsReady(true);
        setError(null);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // #region agent log
        fetch('http://127.0.0.1:7741/ingest/66ae8bbb-d4f3-40a4-b6d9-17b56f3fcb44',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'1b6cad'},body:JSON.stringify({sessionId:'1b6cad',location:'useRichLayout.ts:compute-error',message:'compute error',data:{error:msg},timestamp:Date.now(),runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
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
