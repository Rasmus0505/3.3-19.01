import { useEffect, useRef } from "react";
import { BookOpenText, Play, RotateCcw } from "lucide-react";
import { Badge, Button } from "../../shared/ui";

export default function ExplanationSidebarContent({
  sentence,
  explanation,
  audioUrl,
  onReplay,
  onStartPractice,
}) {
  const audioRef = useRef(null);

  useEffect(() => {
    if (audioUrl && audioRef.current) {
      audioRef.current.src = audioUrl;
      audioRef.current.play().catch(() => {
        // autoplay 被浏览器阻止时保持静默
      });
    }
  }, [audioUrl]);

  return (
    <div className="immersive-explanation-panel">
      <audio ref={audioRef} className="hidden" />

      <div className="immersive-explanation-panel__header">
        <div>
          <p className="immersive-explanation-panel__eyebrow">讲解区</p>
          <h3 className="immersive-explanation-panel__title">听力讲解</h3>
        </div>
        <div className="immersive-explanation-panel__header-meta">
          {audioUrl ? <Badge variant="secondary">含讲解音频</Badge> : <Badge variant="outline">文本讲解</Badge>}
        </div>
      </div>

      {sentence?.text_en ? <p className="immersive-explanation-panel__sentence">{sentence.text_en}</p> : null}

      {explanation ? (
        <div className="immersive-explanation-panel__body">
          {explanation.simplified_sentence ? (
            <section className="immersive-explanation-panel__section">
              <div className="immersive-explanation-panel__section-label">
                <BookOpenText className="size-4" />
                简化句
              </div>
              <div className="immersive-explanation-panel__surface">
                <p>{explanation.simplified_sentence}</p>
              </div>
            </section>
          ) : null}

          {explanation.key_explanations?.length > 0 ? (
            <section className="immersive-explanation-panel__section">
              <div className="immersive-explanation-panel__section-label">关键词解释</div>
              <div className="immersive-explanation-panel__list">
                {explanation.key_explanations.map((item, index) => (
                  <div key={`${item.original_word}-${index}`} className="immersive-explanation-panel__list-item">
                    <div className="immersive-explanation-panel__list-head">
                      <Badge variant="outline">{item.original_word}</Badge>
                      <span>{item.explanation}</span>
                    </div>
                    {item.simple_example ? (
                      <p className="immersive-explanation-panel__example">例: {item.simple_example}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {explanation.listen_tips ? (
            <section className="immersive-explanation-panel__section">
              <div className="immersive-explanation-panel__section-label">听力技巧</div>
              <div className="immersive-explanation-panel__surface">
                <p>{explanation.listen_tips}</p>
              </div>
            </section>
          ) : null}
        </div>
      ) : (
        <div className="immersive-explanation-panel__empty">
          当前句暂无讲解内容，这里保持为辅助理解区。
        </div>
      )}

      <div className="immersive-explanation-panel__footer">
        <Button variant="outline" size="sm" className="flex-1" onClick={onReplay}>
          <RotateCcw className="size-4" />
          重播讲解
        </Button>
        <Button size="sm" className="flex-1" onClick={onStartPractice}>
          <Play className="size-4" />
          开始练习
        </Button>
      </div>
    </div>
  );
}
