/**
 * usePretext.ts — Pretext 基础测量 hook
 * ==========================================
 * 封装 @chenglou/pretext 的 prepare/layout API，提供 React 友好的接口。
 *
 * 核心概念：
 * - prepare(text, font): 一次性文本预处理（分词 + 测量），返回 opaque handle
 * - layout(prepared, maxWidth, lineHeight): 热路径，纯算术计算，多次调用无性能损耗
 *
 * 注意：相同 text + font 的结果会被 Pretext 内部缓存，
 * resize 时只需重新调用 layout()，无需重新 prepare()
 */
import { useCallback, useRef } from "react";
import { layout, prepare, type PreparedText } from "@chenglou/pretext";

export interface PretextPrepareResult {
  handle: PreparedText;
  text: string;
  font: string;
}

export interface PretextLayoutResult {
  height: number;
  lineCount: number;
}

/**
 * usePretext — Pretext 测量 hook
 *
 * @param defaultText - 初始文本
 * @param defaultFont - CSS font shorthand，默认 '16px Inter'
 * @param defaultMaxWidth - 默认最大宽度（px）
 * @param defaultLineHeight - 默认行高（px）
 */
export function usePretext(
  defaultText = "",
  defaultFont = "16px Inter",
  defaultMaxWidth = 600,
  defaultLineHeight = 24
) {
  const preparedRef = useRef<PreparedText | null>(null);
  const metaRef = useRef<{ text: string; font: string }>({ text: "", font: "" });

  const prepareText = useCallback(
    (text: string, font: string = defaultFont) => {
      preparedRef.current = prepare(text, font);
      metaRef.current = { text, font };
      return preparedRef.current;
    },
    [defaultFont]
  );

  const calculateLayout = useCallback(
    (
      prepared: PreparedText | null,
      maxWidth: number = defaultMaxWidth,
      lineHeight: number = defaultLineHeight
    ): PretextLayoutResult => {
      if (!prepared) {
        return { height: 0, lineCount: 0 };
      }
      return layout(prepared, maxWidth, lineHeight);
    },
    [defaultMaxWidth, defaultLineHeight]
  );

  /**
   * 一次性完成 prepare + layout（便捷封装）
   */
  const measure = useCallback(
    (
      text: string,
      font: string = defaultFont,
      maxWidth: number = defaultMaxWidth,
      lineHeight: number = defaultLineHeight
    ): PretextLayoutResult => {
      const prepared = prepareText(text, font);
      return calculateLayout(prepared, maxWidth, lineHeight);
    },
    [defaultFont, defaultMaxWidth, defaultLineHeight, prepareText, calculateLayout]
  );

  /**
   * 仅重新 layout（text/font 不变，仅 width 变化时使用，避免重复 prepare）
   */
  const relayout = useCallback(
    (maxWidth: number, lineHeight: number = defaultLineHeight): PretextLayoutResult => {
      return calculateLayout(preparedRef.current, maxWidth, lineHeight);
    },
    [defaultLineHeight, calculateLayout]
  );

  return {
    prepareText,
    calculateLayout,
    measure,
    relayout,
    prepared: preparedRef,
    meta: metaRef,
  };
}
