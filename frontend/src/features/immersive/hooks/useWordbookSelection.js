import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  buildWordbookTokenRange,
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
  const wordbookSelectionAnchorRef = useRef(null);
  const wordbookActionRef = useRef(false);

  const clearWordbookSelection = useCallback(() => {
    wordbookSelectionAnchorRef.current = null;
    setWordbookSelectedTokenIndexes([]);
  }, []);

  const isSelectableTokenIndex = useCallback(
    (tokenIndex) => {
      if (!Number.isInteger(tokenIndex)) return false;
      const token = wordbookSentenceTokens[tokenIndex];
      const text = (token || "").trim();
      return Boolean(text) && !WORDBOOK_PUNCTUATION_RE.test(text);
    },
    [wordbookSentenceTokens],
  );

  const selectWordbookTokenRange = useCallback(
    (startTokenIndex, endTokenIndex) => {
      if (!isSelectableTokenIndex(startTokenIndex) || !isSelectableTokenIndex(endTokenIndex)) {
        return;
      }
      const nextRange = buildWordbookTokenRange(startTokenIndex, endTokenIndex);
      setWordbookSelectedTokenIndexes(nextRange);
      return nextRange;
    },
    [isSelectableTokenIndex],
  );

  const handleWordbookTokenClick = useCallback(
    (tokenIndex) => {
      if (!canRenderInteractiveWordbook || wordbookBusy) return;
      if (!isSelectableTokenIndex(tokenIndex)) return;

      const currentAnchor = wordbookSelectionAnchorRef.current;
      const currentSelection = wordbookSelectedTokenIndexes;

      if (!Number.isInteger(currentAnchor) || currentSelection.length === 0) {
        wordbookSelectionAnchorRef.current = tokenIndex;
        setWordbookSelectedTokenIndexes([tokenIndex]);
        return;
      }

      if (currentSelection.length === 1 && currentSelection[0] === tokenIndex) {
        wordbookSelectionAnchorRef.current = null;
        setWordbookSelectedTokenIndexes([]);
        return;
      }

      if (currentSelection.length > 1 && currentSelection.includes(tokenIndex)) {
        wordbookSelectionAnchorRef.current = tokenIndex;
        setWordbookSelectedTokenIndexes([tokenIndex]);
        return;
      }

      selectWordbookTokenRange(currentAnchor, tokenIndex);
      wordbookSelectionAnchorRef.current = null;
    },
    [
      canRenderInteractiveWordbook,
      isSelectableTokenIndex,
      selectWordbookTokenRange,
      wordbookBusy,
      wordbookSelectedTokenIndexes,
    ],
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

  useEffect(() => {
    clearWordbookSelection();
  }, [clearWordbookSelection, wordbookSentenceSourceKey]);

  useEffect(() => {
    if (canRenderInteractiveWordbook) return;
    clearWordbookSelection();
  }, [canRenderInteractiveWordbook, clearWordbookSelection]);

  useEffect(() => () => {
    if (wordbookSuccessTimerRef.current) {
      window.clearTimeout(wordbookSuccessTimerRef.current);
    }
  }, []);

  return {
    wordbookBusy,
    wordbookSelectedTokenIndexes,
    wordbookSuccessAnimationIndexes,
    wordbookSuccessMessage,
    wordbookActionRef,
    clearWordbookSelection,
    setWordbookSelectedTokenIndexes,
    handleWordbookTokenClick,
    collectWordbookEntry,
  };
}
