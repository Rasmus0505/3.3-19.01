import { BookOpenText, Lightbulb } from "lucide-react";

export default function ExplanationSidebarContent({
  sentence,
  explanation,
}) {
  return (
    <div className="immersive-explanation-panel">
      <div className="immersive-explanation-panel__header">
        <div className="immersive-explanation-panel__header-copy">
          <p className="immersive-explanation-panel__eyebrow">Key Expressions</p>
          <h2 className="immersive-explanation-panel__title">English-only support</h2>
        </div>
      </div>

      {sentence?.text_en ? (
        <div className="immersive-explanation-panel__sentence-block">
          <span className="immersive-explanation-panel__sentence-label">Current sentence</span>
          <p className="immersive-explanation-panel__sentence">{sentence.text_en}</p>
        </div>
      ) : null}

      {explanation ? (
        <div className="immersive-explanation-panel__body">
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
          ) : explanation.simplified_sentence ? (
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
      ) : (
        <div className="immersive-explanation-panel__empty">
          Expressions above your current level will appear here in simpler English.
        </div>
      )}
    </div>
  );
}
