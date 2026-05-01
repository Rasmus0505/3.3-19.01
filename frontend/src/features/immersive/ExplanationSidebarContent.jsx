import { BookOpenText, Lightbulb, BookOpen, Volume2 } from "lucide-react";

import { Button } from "../../shared/ui";
import { computeDifficultyClassName } from "./DifficultyBadge";
import SelectableTokenText from "./SelectableTokenText";
import WordbookSelectionToolbar from "./WordbookSelectionToolbar";

/**
 * Mask a word for hint display: show first letter + underscores.
 * e.g. "pronunciation" → "p___"
 */
function maskWord(word) {
  if (!word || word.length <= 1) return word || "_";
  return word[0] + "___";
}

/**
 * Check if a keyword from key_explanations matches any un-completed token.
 * Returns true if the word should be masked (not yet correctly typed).
 */
function shouldMaskKeyword(keyword, expectedTokens, wordStatuses) {
  if (!keyword || !expectedTokens?.length) return false;
  const lowerKeyword = keyword.toLowerCase();
  for (let i = 0; i < expectedTokens.length; i++) {
    if (expectedTokens[i].toLowerCase() === lowerKeyword && wordStatuses?.[i] !== "correct") {
      return true;
    }
  }
  return false;
}

export default function ExplanationSidebarContent({
  sentence,
  explanation,
  previousSentence,
  previousSentenceTranslation,
  wordbookSentenceHeading,
  wordbookSentenceTokens,
  wordbookReferenceSourceKey,
  wordbookSelectionSourceKey,
  wordbookSelectedTokenIndexes,
  wordbookSuccessAnimationIndexes,
  wordbookSuccessSourceKey,
  wordbookSentenceBandMap,
  difficultyAnalyzerRef,
  collinsLevel,
  lookupBandFromMap,
  handleWordbookTokenPointerDown,
  handleWordbookTokenPointerEnter,
  requestInteractiveWordbookSentencePlayback,
  wordbookSentencePlaybackLabel,
  collectWordbookEntry,
  selectedWordbookText,
  wordbookSuccessMessage,
  wordbookTranslationText,
  wordbookSentenceZh,
  wordbookSentence,
  wordbookBusy,
  wordbookTranslationBusy,
  translateWordbookSelection,
  clearWordbookSelection,
  wordStatuses,
  expectedTokens,
  sentenceTypingDone,
  showKeywordHints,
}) {
  const previousSentenceText = previousSentence || "(当前是第一句，暂时没有上一句字幕)";
  const previousSentenceZhText = previousSentenceTranslation || "(暂无上一句翻译)";
  const hasWordbookContext = Array.isArray(wordbookSentenceTokens) && wordbookSentenceTokens.length > 0;

  const tokenRow = hasWordbookContext ? (
    <SelectableTokenText
      tokens={wordbookSentenceTokens}
      sentence={wordbookSentence}
      sourceKey={wordbookReferenceSourceKey}
      selectionSourceKey={wordbookSelectionSourceKey}
      selectedIndexes={wordbookSelectedTokenIndexes}
      successSourceKey={wordbookSuccessSourceKey}
      successIndexes={wordbookSuccessAnimationIndexes}
      disabled={wordbookBusy}
      className="immersive-explanation-panel__context-token-wrap"
      getTokenClassName={(token) =>
        computeDifficultyClassName(
          lookupBandFromMap(wordbookSentenceBandMap, token, difficultyAnalyzerRef.current),
          collinsLevel,
        )
      }
      onTokenPointerDown={handleWordbookTokenPointerDown}
      onTokenPointerEnter={handleWordbookTokenPointerEnter}
    />
  ) : null;

  const previousSentenceBlock = (
    <section className="immersive-explanation-panel__context-card">
      <div className="immersive-explanation-panel__context-head">
        <span className="immersive-explanation-panel__context-kicker">Previous subtitle</span>
        <div className="immersive-explanation-panel__context-actions">
          <span className="immersive-explanation-panel__context-badge">{wordbookSentenceHeading || "上一句"}</span>
          {hasWordbookContext ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="immersive-explanation-panel__context-button"
              onClick={() => requestInteractiveWordbookSentencePlayback?.("wordbook_sentence_context")}
            >
              <Volume2 className="size-4" />
              {wordbookSentencePlaybackLabel}
            </Button>
          ) : null}
        </div>
      </div>
      {tokenRow || (
        <p className="immersive-explanation-panel__context-line immersive-explanation-panel__context-line--en">
          {previousSentenceText}
        </p>
      )}
      <p className="immersive-explanation-panel__context-line immersive-explanation-panel__context-line--zh">
        {wordbookSentenceZh || previousSentenceZhText}
      </p>
      <p className="immersive-explanation-panel__context-tip">
        {selectedWordbookText
          ? `已选：${selectedWordbookText}`
          : wordbookSuccessMessage || "点击选择；Shift 连续选择；Ctrl 或 Command 多选。"}
      </p>
      <WordbookSelectionToolbar
        selectedText={selectedWordbookText}
        translationText={wordbookTranslationText}
        busy={wordbookBusy}
        translationBusy={wordbookTranslationBusy}
        onTranslate={() => translateWordbookSelection?.()}
        onCollect={() => collectWordbookEntry?.()}
        onClear={clearWordbookSelection}
      />
    </section>
  );

  // State 3: Typing done — show full explanation (without original sentence text)
  if (sentenceTypingDone && explanation) {
    return (
      <div className="immersive-explanation-panel">
        {previousSentenceBlock}

        <div className="immersive-explanation-panel__header">
          <div className="immersive-explanation-panel__header-copy">
            <p className="immersive-explanation-panel__eyebrow">Key Expressions</p>
            <h2 className="immersive-explanation-panel__title">关键表达讲解</h2>
          </div>
        </div>

        {explanation.key_explanations?.length > 0 ? (
          <section className="immersive-explanation-panel__list">
            {explanation.key_explanations.map((item, index) => (
              <div key={`${item.original_word}-${index}`} className="immersive-explanation-panel__list-item">
                <div className="immersive-explanation-panel__list-head">
                  <span className="immersive-explanation-panel__term">{item.original_word}</span>
                  <span>{item.explanation}</span>
                </div>
                {item.simple_example ? (
                  <p className="immersive-explanation-panel__example">{item.simple_example}</p>
                ) : null}
              </div>
            ))}
          </section>
        ) : null}

        {explanation.simplified_sentence ? (
          <section className="immersive-explanation-panel__surface immersive-explanation-panel__surface--summary">
            <div className="immersive-explanation-panel__surface-icon">
              <BookOpenText className="size-4" />
            </div>
            <div>
              <span className="immersive-explanation-panel__surface-label">Simpler version</span>
              <p>{explanation.simplified_sentence}</p>
            </div>
          </section>
        ) : null}

        {explanation.listen_tips ? (
          <section className="immersive-explanation-panel__surface immersive-explanation-panel__surface--tip">
            <div className="immersive-explanation-panel__surface-icon">
              <Lightbulb className="size-4" />
            </div>
            <div>
              <span className="immersive-explanation-panel__surface-label">Listening focus</span>
              <p>{explanation.listen_tips}</p>
            </div>
          </section>
        ) : null}
      </div>
    );
  }

  // State 2: Keyword hints triggered (replay >= N times)
  if (showKeywordHints && explanation?.key_explanations?.length > 0) {
    return (
      <div className="immersive-explanation-panel">
        {previousSentenceBlock}

        <div className="immersive-explanation-panel__header">
          <div className="immersive-explanation-panel__header-copy">
            <p className="immersive-explanation-panel__eyebrow">Keyword Hints</p>
            <h2 className="immersive-explanation-panel__title">关键词提示</h2>
          </div>
        </div>

        <section className="immersive-explanation-panel__list">
          {explanation.key_explanations.map((item, index) => {
            const masked = shouldMaskKeyword(item.original_word, expectedTokens, wordStatuses);
            const displayWord = masked ? maskWord(item.original_word) : item.original_word;
            return (
              <div
                key={`hint-${item.original_word}-${index}`}
                className="immersive-explanation-panel__hint-card hint-card-enter"
                style={{ animationDelay: `${index * 80}ms` }}
              >
                <span className="immersive-explanation-panel__hint-term">{displayWord}</span>
                <p className="immersive-explanation-panel__hint-explanation">{item.explanation}</p>
              </div>
            );
          })}
        </section>
      </div>
    );
  }

  // State 1: Typing in progress, no hints — show empty placeholder
  return (
    <div className="immersive-explanation-panel">
      {previousSentenceBlock}

      <div className="immersive-explanation-panel__empty-state">
        <div className="immersive-explanation-panel__empty-state-icon">
          <BookOpen className="size-5" style={{ opacity: 0.4 }} />
        </div>
        <p style={{ fontSize: "0.8rem", lineHeight: 1.6, textAlign: "center" }}>
          完成拼写后查看讲解
        </p>
      </div>
    </div>
  );
}


