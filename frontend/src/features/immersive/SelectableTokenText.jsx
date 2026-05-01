import { cn } from "../../lib/utils";
import { isWordbookSelectableToken } from "./hooks/useWordbookSelection";

export default function SelectableTokenText({
  tokens = [],
  sentence = null,
  sourceKey = "",
  selectionSourceKey = "",
  selectedIndexes = [],
  successSourceKey = "",
  successIndexes = [],
  disabled = false,
  className = "",
  tokenClassName = "",
  getTokenClassName,
  onTokenPointerDown,
  onTokenPointerEnter,
}) {
  const selectedSet = sourceKey && sourceKey === selectionSourceKey ? new Set(selectedIndexes) : new Set();
  const successSet = sourceKey && sourceKey === successSourceKey ? new Set(successIndexes) : new Set();

  return (
    <div className={cn("immersive-selectable-token-text", className)}>
      {tokens.map((token, tokenIndex) => {
        const trimmedToken = String(token || "").trim();
        const selectable = isWordbookSelectableToken(trimmedToken);
        const tokenContext = {
          sourceKey,
          sentence,
          tokens,
          tokenIndex,
        };
        return (
          <button
            key={`${trimmedToken || "token"}-${tokenIndex}`}
            type="button"
            data-wordbook-token-index={tokenIndex}
            className={cn(
              "immersive-wordbook-token",
              tokenClassName,
              typeof getTokenClassName === "function" ? getTokenClassName(token, tokenIndex) : "",
              selectedSet.has(tokenIndex) ? "immersive-wordbook-token--selected" : "",
              successSet.has(tokenIndex) ? "wordbook-token--success" : "",
            )}
            disabled={disabled || !selectable}
            onPointerDown={(event) => onTokenPointerDown?.(event, tokenContext)}
            onPointerEnter={(event) => onTokenPointerEnter?.(event, tokenContext)}
          >
            {trimmedToken || token}
          </button>
        );
      })}
    </div>
  );
}
