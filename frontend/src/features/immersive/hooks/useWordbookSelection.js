import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  WORDBOOK_LONG_PRESS_MS,
  buildWordbookTokenRange,
  toggleWordbookTokenIndex,
} from "../immersivePageHelpers";
import { toErrorText } from "../../../shared/api/client";

const WORDBOOK_PUNCTUATION_RE = /^[.!?,;:—–\-"'“”‘’（）()[\]【】《》]+$/;

export function useWordbookSelection({
  lessonId,
  accessToken,
  apiClient,
  parseResponse,
  onWordbookChanged,
  wordbookSentenceTokens,
  wordbookSentenceSourceKey,
  canRenderInteractiveWordbook,
}) {
  const [wordbookBusy, setWordbookBusy] = useState(false);
  const [wordbookSelectedTokenIndexes, setWordbookSelectedTokenIndexes] = useState([]);
  const [wordbookSuccessAnimationIndexes, setWordbookSuccessAnimationIndexes] = useState([]);
  const [wordbookSuccessMessage, setWordbookSuccessMessage] = useState(null);

  const wordbookSuccessTimerRef = useRef(null);
  const wordbookPointerGestureRef = useRef({
    pointerId: null,
    pressTokenIndex: null,
    anchorTokenIndex: null,
    currentTokenIndex: null,
    longPressActive: false,
    longPressTimerId: null,
  });
  const wordbookActionRef = useRef(false);

  const clearWordbookSelection = useCallback(() => {
    setWordbookSelectedTokenIndexes([]);
  }, []);

  const clearWordbookGestureTimer = useCallback(() => {
    if (typeof window === "undefined") return;
    const gesture = wordbookPointerGestureRef.current;
    if (gesture.longPressTimerId !== null) {
      window.clearTimeout(gesture.longPressTimerId);
      gesture.longPressTimerId = null;
    }
  }, []);

  const resetWordbookPointerGesture = useCallback(() => {
    clearWordbookGestureTimer();
    const gesture = wordbookPointerGestureRef.current;
    gesture.pointerId = null;
    gesture.pressTokenIndex = null;
    gesture.anchorTokenIndex = null;
    gesture.currentTokenIndex = null;
    gesture.longPressActive = false;
  }, [clearWordbookGestureTimer]);

  const toggleWordbookTokenSelection = useCallback(
    (tokenIndex) => {
      if (!Number.isInteger(tokenIndex)) return;
      const token = wordbookSentenceTokens[tokenIndex];
      const text = (token || "").trim();
      if (!text || WORDBOOK_PUNCTUATION_RE.test(text)) return;
      setWordbookSelectedTokenIndexes((current) =>
        toggleWordbookTokenIndex(current, tokenIndex),
      );
    },
    [wordbookSentenceTokens],
  );

  const selectWordbookTokenRange = useCallback(
    (startTokenIndex, endTokenIndex) => {
      const startToken = wordbookSentenceTokens[startTokenIndex];
      const endToken = wordbookSentenceTokens[endTokenIndex];
      const startText = (startToken || "").trim();
      const endText = (endToken || "").trim();
      if (
        (!startText || WORDBOOK_PUNCTUATION_RE.test(startText)) &&
        (!endText || WORDBOOK_PUNCTUATION_RE.test(endText))
      ) {
        return;
      }
      const nextRange = buildWordbookTokenRange(startTokenIndex, endTokenIndex);
      setWordbookSelectedTokenIndexes(nextRange);
      return nextRange;
    },
    [wordbookSentenceTokens],
  );

  const collectWordbookEntry = useCallback(
    async ({ sentence, entryType, entryText, startTokenIndex, endTokenIndex }) => {
      if (!lessonId || !sentence || !accessToken) return;
      wordbookActionRef.current = true;
      setWordbookBusy(true);
      try {
        const resp = await apiClient(
          "/api/wordbook/collect",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              lesson_id: lessonId,
              sentence_index: sentence.idx,
              entry_text: entryText,
              entry_type: entryType,
              start_token_index: startTokenIndex,
              end_token_index: endTokenIndex,
            }),
          },
          accessToken,
        );
        const data = await parseResponse(resp);
        if (!resp.ok) {
          toast.error(toErrorText(data, "加入生词本失败"));
          return;
        }
        const message = data.message || (data.created ? "已加入生词本" : "已更新到最新语境");
        if (wordbookSuccessTimerRef.current) {
          window.clearTimeout(wordbookSuccessTimerRef.current);
        }
        const indexes = wordbookSelectedTokenIndexes.slice();
        setWordbookSuccessMessage(message);
        setWordbookSuccessAnimationIndexes(indexes);
        window.setTimeout(() => {
          setWordbookSuccessAnimationIndexes([]);
        }, 400);
        wordbookSuccessTimerRef.current = window.setTimeout(() => {
          setWordbookSuccessMessage(null);
          wordbookSuccessTimerRef.current = null;
        }, 1500);
        clearWordbookSelection();
        onWordbookChanged?.();
      } catch (error) {
        toast.error(`网络错误: ${String(error)}`);
      } finally {
        setWordbookBusy(false);
        window.setTimeout(() => {
          wordbookActionRef.current = false;
        }, 0);
      }
    },
    [
      accessToken,
      apiClient,
      clearWordbookSelection,
      lessonId,
      onWordbookChanged,
      parseResponse,
      wordbookSelectedTokenIndexes,
    ],
  );

  const handleWordbookTokenPointerDown = useCallback(
    (event, tokenIndex) => {
      if (!canRenderInteractiveWordbook || wordbookBusy) return;
      if (typeof event.button === "number" && event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const pointerId = event.pointerId;
      const gesture = wordbookPointerGestureRef.current;
      if (gesture.pointerId !== null && gesture.pointerId !== pointerId) {
        return;
      }
      clearWordbookGestureTimer();
      gesture.pointerId = pointerId;
      gesture.pressTokenIndex = tokenIndex;
      gesture.anchorTokenIndex = tokenIndex;
      gesture.currentTokenIndex = tokenIndex;
      gesture.longPressActive = false;
      gesture.longPressTimerId = window.setTimeout(() => {
        const nextGesture = wordbookPointerGestureRef.current;
        if (
          nextGesture.pointerId !== pointerId ||
          nextGesture.pressTokenIndex !== tokenIndex
        ) {
          return;
        }
        nextGesture.longPressActive = true;
        nextGesture.anchorTokenIndex = tokenIndex;
        nextGesture.currentTokenIndex = tokenIndex;
        selectWordbookTokenRange(tokenIndex, tokenIndex);
      }, WORDBOOK_LONG_PRESS_MS);
    },
    [
      canRenderInteractiveWordbook,
      clearWordbookGestureTimer,
      selectWordbookTokenRange,
      wordbookBusy,
    ],
  );

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return undefined;

    const handlePointerMove = (event) => {
      const gesture = wordbookPointerGestureRef.current;
      if (
        gesture.pointerId === null ||
        gesture.pointerId !== event.pointerId ||
        !gesture.longPressActive
      ) {
        return;
      }
      const tokenElement = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest?.("[data-wordbook-token-index]");
      if (!tokenElement) return;
      const nextTokenIndex = Number(tokenElement.getAttribute("data-wordbook-token-index"));
      if (!Number.isInteger(nextTokenIndex)) return;
      const anchorTokenIndex = gesture.anchorTokenIndex;
      if (!Number.isInteger(anchorTokenIndex)) return;
      if (gesture.currentTokenIndex === nextTokenIndex) return;
      gesture.currentTokenIndex = nextTokenIndex;
      selectWordbookTokenRange(anchorTokenIndex, nextTokenIndex);
    };

    const handlePointerUp = (event) => {
      const gesture = wordbookPointerGestureRef.current;
      if (gesture.pointerId === null || gesture.pointerId !== event.pointerId) return;
      const pressTokenIndex = gesture.pressTokenIndex;
      const longPressActive = gesture.longPressActive;
      resetWordbookPointerGesture();
      if (!Number.isInteger(pressTokenIndex)) return;
      if (!longPressActive) {
        toggleWordbookTokenSelection(pressTokenIndex);
      }
    };

    const handlePointerCancel = (event) => {
      const gesture = wordbookPointerGestureRef.current;
      if (gesture.pointerId === null || gesture.pointerId !== event.pointerId) return;
      resetWordbookPointerGesture();
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
      resetWordbookPointerGesture();
    };
  }, [
    resetWordbookPointerGesture,
    selectWordbookTokenRange,
    toggleWordbookTokenSelection,
  ]);

  useEffect(() => {
    clearWordbookSelection();
    resetWordbookPointerGesture();
  }, [clearWordbookSelection, resetWordbookPointerGesture, wordbookSentenceSourceKey]);

  useEffect(() => {
    if (canRenderInteractiveWordbook) return;
    clearWordbookSelection();
    resetWordbookPointerGesture();
  }, [
    canRenderInteractiveWordbook,
    clearWordbookSelection,
    resetWordbookPointerGesture,
  ]);

  useEffect(
    () => () => {
      clearWordbookGestureTimer();
      if (wordbookSuccessTimerRef.current) {
        window.clearTimeout(wordbookSuccessTimerRef.current);
      }
    },
    [clearWordbookGestureTimer],
  );

  return {
    wordbookBusy,
    wordbookSelectedTokenIndexes,
    wordbookSuccessAnimationIndexes,
    wordbookSuccessMessage,
    wordbookActionRef,
    clearWordbookSelection,
    setWordbookSelectedTokenIndexes,
    handleWordbookTokenPointerDown,
    collectWordbookEntry,
  };
}
