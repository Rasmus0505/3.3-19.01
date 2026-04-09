import { BookOpenText, Pause, Play, RotateCcw } from "lucide-react";
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
}) {
  return (
    <div className="immersive-explanation-panel">
      <audio ref={audioRef} className="hidden" />

      {sentence?.text_en ? <p className="immersive-explanation-panel__sentence">{sentence.text_en}</p> : null}

      {audioUrl ? (
        <div className="immersive-explanation-panel__controls">
          {isAudioPlaying ? (
            <Button variant="outline" size="sm" className="flex-1" onClick={onPauseAudio}>
              <Pause className="size-4" />
              暂停
            </Button>
          ) : isAudioPaused ? (
            <Button size="sm" className="flex-1" onClick={onResumeAudio}>
              <Play className="size-4" />
              继续
            </Button>
          ) : (
            <Button size="sm" className="flex-1" onClick={onPlayAudio}>
              <Play className="size-4" />
              播放
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
              <p>{explanation.simplified_sentence}</p>
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
              <p>{explanation.listen_tips}</p>
            </section>
          ) : null}
        </div>
      ) : (
        <div className="immersive-explanation-panel__empty">暂无讲解</div>
      )}

      <div className="immersive-explanation-panel__footer">
        <Button size="sm" className="flex-1" onClick={onStartPractice}>
          <Play className="size-4" />
          进入拼写
        </Button>
      </div>
    </div>
  );
}
