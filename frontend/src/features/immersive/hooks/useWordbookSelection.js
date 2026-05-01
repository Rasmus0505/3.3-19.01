import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  buildWordbookTokenRange,
  toggleWordbookTokenIndex,
} from "../immersivePageHelpers";
import { toErrorText } from "../../../shared/api/client";

const WORDBOOK_PUNCTUATION_RE = /^[.!?,;:—–\-"'“”‘’（）()[\]【】《》]+$/;

export function isWordbookSelectableToken(token) {
  const text = String(token || "").trim();
  return Boolean(text) && !WORDBOOK_PUNCTUATION_RE.test(text);
}

export function resolveWordbookSelectionClick({
  selectedIndexes = [],
  tokenIndex,
  anchorIndex = null,
  shiftKey = false,
  additiveKey = false,
  sourceKey = "",
  activeSourceKey = "",
} = {}) {
  if (!Number.isInteger(tokenIndex)) {
    return { selectedIndexes: Array.isArray(selectedIndexes) ? selectedIndexes : [], anchorIndex };
  }

  const sameSource = sourceKey && sourceKey === activeSourceKey;
  const currentSelection = sameSource && Array.isArray(selectedIndexes) ? selectedIndexes.filter(Number.isInteger) : [];
  const safeAnchor = sameSource && Number.isInteger(anchorIndex) ? anchorIndex : null;

  if (shiftKey && Number.isInteger(safeAnchor)) {
    return {
      selectedIndexes: buildWordbookTokenRange(safeAnchor, tokenIndex),
      anchorIndex: safeAnchor,
    };
  }

  if (additiveKey) {
    return {
      selectedIndexes: toggleWordbookTokenIndex(currentSelection, tokenIndex),
      anchorIndex: tokenIndex,
    };
  }

  if (currentSelection.length === 1 && currentSelection[0] === tokenIndex) {
    return { selectedIndexes: [], anchorIndex: null };
  }

  return { selectedIndexes: [tokenIndex], anchorIndex: tokenIndex };
}

export function useWordbookSelection({
  lessonId,
  accessToken,
  apiClient,
  parseResponse,
  onWordbookChanged,
  wordbookSentenceTokens = [],
  selectionScopeKey = "",
  canRenderInteractiveWordbook,
}) {
  const [wordbookBusy, setWordbookBusy] = useState(false);
  const [wordbookTranslationBusy, setWordbookTranslationBusy] = useState(false);
  const [wordbookSelectedTokenIndexes, setWordbookSelectedTokenIndexes] = useState([]);
  const [wordbookSelectionSourceKey, setWordbookSelectionSourceKey] = useState("");
  const [wordbookSelectionSentence, setWordbookSelectionSentence] = useState(null);
  const [wordbookSelectionTokens, setWordbookSelectionTokens] = useState([]);
  const [wordbookSuccessAnimationIndexes, setWordbookSuccessAnimationIndexes] = useState([]);
  const [wordbookSuccessSourceKey, setWordbookSuccessSourceKey] = useState("");
  const [wordbookSuccessMessage, setWordbookSuccessMessage] = useState(null);
  const [wordbookTranslationText, setWordbookTranslationText] = useState("");

  const wordbookSuccessTimerRef = useRef(null);
  const wordbookSelectionAnchorRef = useRef({ sourceKey: "", tokenIndex: null });
  const wordbookDragRef = useRef({ active: false, sourceKey: "", anchorIndex: null });
  const wordbookActionRef = useRef(false);

  const clearWordbookSelection = useCallback(() => {
    wordbookSelectionAnchorRef.current = { sourceKey: "", tokenIndex: null };
    wordbookDragRef.current = { active: false, sourceKey: "", anchorIndex: null };
    setWordbookSelectionSourceKey("");
    setWordbookSelectionSentence(null);
    setWordbookSelectionTokens([]);
    setWordbookSelectedTokenIndexes([]);
    setWordbookTranslationText("");
  }, []);

  const isSelectableTokenIndex = useCallback(
    (tokenIndex, tokens = wordbookSentenceTokens) => {
      if (!Number.isInteger(tokenIndex)) return false;
      return isWordbookSelectableToken(tokens[tokenIndex]);
    },
    [wordbookSentenceTokens],
  );

  const setSelectionContext = useCallback(({ sourceKey, sentence, tokens }) => {
    setWordbookSelectionSourceKey(sourceKey || "");
    setWordbookSelectionSentence(sentence || null);
    setWordbookSelectionTokens(Array.isArray(tokens) ? tokens : []);
    setWordbookTranslationText("");
  }, []);

  const selectWordbookTokenRange = useCallback(
    (startTokenIndex, endTokenIndex, tokens = wordbookSentenceTokens) => {
      if (!isSelectableTokenIndex(startTokenIndex, tokens) || !isSelectableTokenIndex(endTokenIndex, tokens)) {
        return [];
      }
      const nextRange = buildWordbookTokenRange(startTokenIndex, endTokenIndex).filter((index) =>
        isSelectableTokenIndex(index, tokens),
      );
      setWordbookSelectedTokenIndexes(nextRange);
      return nextRange;
    },
    [isSelectableTokenIndex, wordbookSentenceTokens],
  );

  const handleWordbookTokenClick = useCallback(
    (tokenIndex, eventOrContext = null, maybeContext = null) => {
      if (!canRenderInteractiveWordbook || wordbookBusy) return;
      const event = eventOrContext && typeof eventOrContext === "object" && "shiftKey" in eventOrContext ? eventOrContext : null;
      const context = event ? maybeContext : eventOrContext;
      const sourceKey = String(context?.sourceKey || "");
      const sentence = context?.sentence || null;
      const tokens = Array.isArray(context?.tokens) ? context.tokens : wordbookSentenceTokens;
      if (!sourceKey || !isSelectableTokenIndex(tokenIndex, tokens)) return;

      const anchorSnapshot = wordbookSelectionAnchorRef.current;
      const result = resolveWordbookSelectionClick({
        selectedIndexes: wordbookSelectedTokenIndexes,
        tokenIndex,
        anchorIndex: anchorSnapshot.sourceKey === sourceKey ? anchorSnapshot.tokenIndex : null,
        shiftKey: Boolean(event?.shiftKey),
        additiveKey: Boolean(event?.ctrlKey || event?.metaKey),
        sourceKey,
        activeSourceKey: wordbookSelectionSourceKey,
      });
      const selectableIndexes = result.selectedIndexes.filter((index) => isSelectableTokenIndex(index, tokens));
      if (!selectableIndexes.length) {
        clearWordbookSelection();
        return;
      }

      setSelectionContext({ sourceKey, sentence, tokens });
      wordbookSelectionAnchorRef.current = {
        sourceKey,
        tokenIndex: Number.isInteger(result.anchorIndex) ? result.anchorIndex : tokenIndex,
      };
      setWordbookSelectedTokenIndexes(selectableIndexes);
    },
    [
      canRenderInteractiveWordbook,
      clearWordbookSelection,
      isSelectableTokenIndex,
      setSelectionContext,
      wordbookBusy,
      wordbookSelectedTokenIndexes,
      wordbookSelectionSourceKey,
      wordbookSentenceTokens,
    ],
  );

  const handleWordbookTokenPointerDown = useCallback(
    (event, context) => {
      if (!event || !context) return;
      if (typeof event.button === "number" && event.button !== 0) return;
      if (wordbookBusy) return;
      const sourceKey = String(context.sourceKey || "");
      const tokenIndex = Number(context.tokenIndex);
      const tokens = Array.isArray(context.tokens) ? context.tokens : wordbookSentenceTokens;
      if (!sourceKey || !isSelectableTokenIndex(tokenIndex, tokens)) return;
      event.preventDefault();
      event.stopPropagation();
      wordbookActionRef.current = true;
      handleWordbookTokenClick(tokenIndex, event, context);
      wordbookDragRef.current = {
        active: !event.ctrlKey && !event.metaKey,
        sourceKey,
        anchorIndex: tokenIndex,
      };
    },
    [handleWordbookTokenClick, isSelectableTokenIndex, wordbookBusy, wordbookSentenceTokens],
  );

  const handleWordbookTokenPointerEnter = useCallback(
    (event, context) => {
      const drag = wordbookDragRef.current;
      if (!drag.active || !context) return;
      const sourceKey = String(context.sourceKey || "");
      if (!sourceKey || sourceKey !== drag.sourceKey) return;
      const tokenIndex = Number(context.tokenIndex);
      const tokens = Array.isArray(context.tokens) ? context.tokens : wordbookSentenceTokens;
      if (!isSelectableTokenIndex(tokenIndex, tokens)) return;
      event?.preventDefault?.();
      event?.stopPropagation?.();
      setSelectionContext({ sourceKey, sentence: context.sentence || null, tokens });
      selectWordbookTokenRange(drag.anchorIndex, tokenIndex, tokens);
    },
    [isSelectableTokenIndex, selectWordbookTokenRange, setSelectionContext, wordbookSentenceTokens],
  );

  const handleWordbookTokenPointerUp = useCallback(() => {
    wordbookDragRef.current = { active: false, sourceKey: "", anchorIndex: null };
    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        wordbookActionRef.current = false;
      }, 0);
    } else {
      wordbookActionRef.current = false;
    }
  }, []);

  const selectedWordbookTokens = useMemo(
    () =>
      wordbookSelectedTokenIndexes
        .map((tokenIndex) => wordbookSelectionTokens[tokenIndex])
        .filter((token) => typeof token === "string" && token.trim().length > 0),
    [wordbookSelectedTokenIndexes, wordbookSelectionTokens],
  );
  const selectedWordbookText = selectedWordbookTokens.join(" ");
  const selectedWordbookStart = wordbookSelectedTokenIndexes.length ? wordbookSelectedTokenIndexes[0] : -1;
  const selectedWordbookEnd = wordbookSelectedTokenIndexes.length
    ? wordbookSelectedTokenIndexes[wordbookSelectedTokenIndexes.length - 1]
    : -1;

  const collectWordbookEntry = useCallback(
    async ({
      sentence = wordbookSelectionSentence,
      entryType = selectedWordbookTokens.length >= 2 ? "phrase" : "word",
      entryText = selectedWordbookText,
      startTokenIndex = selectedWordbookStart,
      endTokenIndex = selectedWordbookEnd,
      selectedTokenIndexes = wordbookSelectedTokenIndexes,
    } = {}) => {
      if (!lessonId || !sentence || !accessToken || !entryText || !selectedTokenIndexes.length) return;
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
              selected_token_indexes: selectedTokenIndexes,
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
        const sourceKey = wordbookSelectionSourceKey;
        setWordbookSuccessMessage(message);
        setWordbookSuccessSourceKey(sourceKey);
        setWordbookSuccessAnimationIndexes(indexes);
        window.setTimeout(() => {
          setWordbookSuccessAnimationIndexes([]);
          setWordbookSuccessSourceKey("");
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
      selectedWordbookEnd,
      selectedWordbookStart,
      selectedWordbookText,
      selectedWordbookTokens.length,
      wordbookSelectionSentence,
      wordbookSelectionSourceKey,
      wordbookSelectedTokenIndexes,
    ],
  );

  const translateWordbookSelection = useCallback(
    async (text = selectedWordbookText) => {
      const safeText = String(text || "").trim();
      if (!safeText || !accessToken) return;
      wordbookActionRef.current = true;
      setWordbookTranslationBusy(true);
      setWordbookTranslationText("");
      try {
        const resp = await apiClient(
          "/api/wordbook/translate",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: safeText }),
          },
          accessToken,
        );
        const data = await parseResponse(resp);
        if (!resp.ok) {
          toast.error(toErrorText(data, "翻译失败"));
          return;
        }
        setWordbookTranslationText(String(data.translation || ""));
      } catch (error) {
        toast.error(`网络错误: ${String(error)}`);
      } finally {
        setWordbookTranslationBusy(false);
        window.setTimeout(() => {
          wordbookActionRef.current = false;
        }, 0);
      }
    },
    [accessToken, apiClient, parseResponse, selectedWordbookText],
  );

  useEffect(() => {
    clearWordbookSelection();
  }, [clearWordbookSelection, selectionScopeKey]);

  useEffect(() => {
    if (canRenderInteractiveWordbook) return;
    clearWordbookSelection();
  }, [canRenderInteractiveWordbook, clearWordbookSelection]);

  useEffect(() => () => {
    if (wordbookSuccessTimerRef.current) {
      window.clearTimeout(wordbookSuccessTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    window.addEventListener("pointerup", handleWordbookTokenPointerUp);
    window.addEventListener("pointercancel", handleWordbookTokenPointerUp);
    return () => {
      window.removeEventListener("pointerup", handleWordbookTokenPointerUp);
      window.removeEventListener("pointercancel", handleWordbookTokenPointerUp);
    };
  }, [handleWordbookTokenPointerUp]);

  return {
    wordbookBusy,
    wordbookTranslationBusy,
    wordbookSelectedTokenIndexes,
    wordbookSelectionSourceKey,
    wordbookSelectionSentence,
    wordbookSelectionTokens,
    selectedWordbookTokens,
    selectedWordbookStart,
    selectedWordbookEnd,
    selectedWordbookText,
    wordbookSuccessAnimationIndexes,
    wordbookSuccessSourceKey,
    wordbookSuccessMessage,
    wordbookTranslationText,
    wordbookActionRef,
    clearWordbookSelection,
    setWordbookSelectedTokenIndexes,
    handleWordbookTokenClick,
    handleWordbookTokenPointerDown,
    handleWordbookTokenPointerEnter,
    handleWordbookTokenPointerUp,
    collectWordbookEntry,
    translateWordbookSelection,
  };
}
