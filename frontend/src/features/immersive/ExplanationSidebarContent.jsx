import { BookOpenText, Lightbulb, Pause, Play, RotateCcw, X } from "lucide-react";
import { Button } from "../../shared/ui";

export default function ExplanationSidebarContent({
  sentence,
  explanation,
  audioUrl,
  audioRef,
  isAudioPlaying,
  isAudioPaused,
  onPlayAudio,
  onPauseAudio,
  onResumeAudio,
  onReplayAudio,
  onStartPractice,
  onClose,
}) {
  return (
    <div className="immersive-explanation-panel">
      <audio ref={audioRef} className="hidden" />

      <div className="immersive-explanation-panel__header">
        <div className="immersive-explanation-panel__header-copy">
          <p className="immersive-explanation-panel__eyebrow">讲解 Drawer</p>
          <h2 className="immersive-explanation-panel__title">把本句拆开理解</h2>
        </div>
        {onClose ? (
          <button
            type="button"
            className="immersive-explanation-panel__close"
            aria-label="关闭讲解面板"
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>

      {sentence?.text_en ? (
        <div className="immersive-explanation-panel__sentence-block">
          <span className="immersive-explanation-panel__sentence-label">本句原文</span>
          <p className="immersive-explanation-panel__sentence">{sentence.text_en}</p>
          {sentence?.text_zh ? (
            <p className="immersive-explanation-panel__sentence-translation">{sentence.text_zh}</p>
          ) : null}
        </div>
      ) : null}

      {audioUrl ? (
        <div className="immersive-explanation-panel__controls">
          {isAudioPlaying ? (
            <Button variant="outline" size="sm" className="flex-1" onClick={onPauseAudio}>
              <Pause className="size-4" />
              暂停讲解
            </Button>
          ) : isAudioPaused ? (
            <Button size="sm" className="flex-1" onClick={onResumeAudio}>
              <Play className="size-4" />
              继续讲解
            </Button>
          ) : (
            <Button size="sm" className="flex-1" onClick={onPlayAudio}>
              <Play className="size-4" />
              播放讲解
            </Button>
          )}
          <Button variant="ghost" size="sm" className="flex-1" onClick={onReplayAudio}>
            <RotateCcw className="size-4" />
            重播
          </Button>
        </div>
      ) : null}

      {explanation ? (
        <div className="immersive-explanation-panel__body">
          {explanation.simplified_sentence ? (
            <section className="immersive-explanation-panel__surface immersive-explanation-panel__surface--summary">
              <div className="immersive-explanation-panel__surface-icon">
                <BookOpenText className="size-4" />
              </div>
              <div>
                <span className="immersive-explanation-panel__surface-label">一句话解释</span>
                <p>{explanation.simplified_sentence}</p>
              </div>
            </section>
          ) : null}

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

          {explanation.listen_tips ? (
            <section className="immersive-explanation-panel__surface immersive-explanation-panel__surface--tip">
              <div className="immersive-explanation-panel__surface-icon">
                <Lightbulb className="size-4" />
              </div>
              <div>
                <span className="immersive-explanation-panel__surface-label">听力提示</span>
                <p>{explanation.listen_tips}</p>
              </div>
            </section>
          ) : null}
        </div>
      ) : (
        <div className="immersive-explanation-panel__empty">
          当前句的讲解会在你完成输入或主动播放后出现在这里。
        </div>
      )}

      <div className="immersive-explanation-panel__footer">
        <Button size="sm" className="flex-1" onClick={onStartPractice}>
          <Play className="size-4" />
          回到底部拼写
        </Button>
      </div>
    </div>
  );
}
