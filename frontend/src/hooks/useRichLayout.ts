/**
 * useRichLayout.ts — Pretext 布局 hook
 * ====================================
 * 只负责把文本切成可渲染的行与片段，不再承担词典等级判断。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  layoutWithLines,
  prepareWithSegments,
  type LayoutLine,
  type PreparedTextWithSegments,
} from "@chenglou/pretext";

export interface RichSegment {
  text: string;
  levelBand: string | null;
  word: string;
}

export interface RichLine {
  text: string;
  width: number;
  segments: RichSegment[];
}

/** @deprecated layout-only hook no longer loads any analyzer. */
export async function getOrCreateAnalyzer(): Promise<null> {
  return null;
}

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
  let graphemes = cache.get(segmentIndex);
  if (graphemes) return graphemes;
  const raw = segments[segmentIndex] ?? "";
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  graphemes = [];
  for (const piece of segmenter.segment(raw)) {
    graphemes.push(piece.segment);
  }
  cache.set(segmentIndex, graphemes);
  return graphemes;
}

function pushRichPiece(out: RichSegment[], piece: string, kind: string): void {
  if (!piece) return;
  if (kind === "space" || kind === "preserved-space") {
    out.push({ text: piece, levelBand: null, word: "" });
    return;
  }
  if (kind === "zero-width-break" || kind === "tab" || kind === "glue") {
    out.push({ text: piece, levelBand: null, word: "" });
    return;
  }
  if (kind === "soft-hyphen" || kind === "hard-break") {
    return;
  }
  const normalized = piece.toLowerCase().replace(/[^a-zA-Z']/g, "");
  out.push({ text: piece, levelBand: null, word: normalized });
}

function collectRichSegmentsForLayoutLine(
  prepared: PreparedTextWithSegments,
  line: LayoutLine,
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
    pushRichPiece(out, piece, kind);
  }

  if (eg > 0) {
    if (endsWithDiscretionaryHyphen) {
      pushRichPiece(out, "-", "text");
    }
    const gStart = si === ei ? sg : 0;
    const graphemes = getSegmentGraphemesFromCache(ei, segments, graphemeCache);
    const piece = graphemes.slice(gStart, eg).join("");
    const endKind = kinds[ei] ?? "text";
    pushRichPiece(out, piece, endKind);
  } else if (endsWithDiscretionaryHyphen) {
    pushRichPiece(out, "-", "text");
  }

  return out;
}

function layoutLinesToRichLines(
  prepared: PreparedTextWithSegments,
  lines: LayoutLine[],
): RichLine[] {
  const graphemeCache = new Map<number, string[]>();
  return lines.map((line) => ({
    text: line.text,
    width: line.width,
    segments: collectRichSegmentsForLayoutLine(prepared, line, graphemeCache),
  }));
}

const DEFAULT_FONT = "16px Inter";
const DEFAULT_LINE_HEIGHT = 24;

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
        const prepared = prepareWithSegments(textToMeasure, font);
        preparedRef.current = prepared;
        const result = layoutWithLines(prepared, width, lineHeight);
        const richLines = layoutLinesToRichLines(prepared, result.lines);

        setLines(richLines);
        setIsReady(true);
        setError(null);
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


