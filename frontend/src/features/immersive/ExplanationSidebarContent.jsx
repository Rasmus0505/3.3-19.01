import { BookOpenText, Lightbulb, BookOpen } from "lucide-react";

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
  wordStatuses,
  expectedTokens,
  sentenceTypingDone,
  showKeywordHints,
}) {
  // State 3: Typing done — show full explanation (without original sentence text)
  if (sentenceTypingDone && explanation) {
    return (
      <div className="immersive-explanation-panel">
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
