import React from "react";
import {
  ChevronDown,
  ChevronUp,
  Maximize2,
  Minimize2,
} from "lucide-react";

export default function SessionControls({
  currentSentenceIndex,
  sentenceCount,
  requestNavigateSentence,
  requestReplayCurrentSentence,
  requestTogglePausePlayback,
  fullscreenStudyMode,
  onToggleFullscreenStudyMode,
  singleSentenceLoopEnabled,
  handleToggleSingleSentenceLoop,
  playbackRateInputValue,
  handlePlaybackRateInputChange,
  handlePlaybackRateInputBlur,
  handlePlaybackRateInputKeyDown,
  adjustPlaybackRateByStep,
  handleResetPlaybackRate,
  playbackRatePinned,
  handleTogglePlaybackRatePinned,
  isPlaying,
  isPlaybackPaused,
}) {
  return (
    <div className="immersive-stage__toolbar-pill" aria-label="沉浸学习控制">
      <button
        type="button"
        className="immersive-session-action"
        disabled={currentSentenceIndex <= 0}
        onClick={() => requestNavigateSentence({ delta: -1, source: "stage_prev" })}
        aria-label="上一句"
      >
        ‹ 上一句
      </button>
      <button
        type="button"
        className="immersive-session-action"
        onClick={() => requestTogglePausePlayback("stage_toggle")}
      >
        {isPlaying ? "暂停" : isPlaybackPaused ? "继续" : "播放"}
      </button>
      <button
        type="button"
        className="immersive-session-action"
        onClick={() => requestReplayCurrentSentence("stage_replay")}
      >
        重播
      </button>
      <button
        type="button"
        className="immersive-session-action"
        disabled={currentSentenceIndex >= sentenceCount - 1}
        onClick={() => requestNavigateSentence({ delta: 1, source: "stage_next" })}
        aria-label="下一句"
      >
        下一句 ›
      </button>
      <div className="immersive-stage__toolbar-divider" aria-hidden="true" />
      <button
        type="button"
        className={`immersive-session-toggle ${singleSentenceLoopEnabled ? "immersive-session-toggle--active" : ""}`}
        aria-pressed={singleSentenceLoopEnabled}
        onClick={handleToggleSingleSentenceLoop}
        title="重复播放当前句子，加强听力训练"
      >
        精听
      </button>
      <button
        type="button"
        className={`immersive-session-toggle ${fullscreenStudyMode ? "immersive-session-toggle--active" : ""}`}
        aria-pressed={fullscreenStudyMode}
        onClick={onToggleFullscreenStudyMode}
        title={fullscreenStudyMode ? "退出全屏学习模式" : "进入全屏学习模式"}
      >
        {fullscreenStudyMode ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        {fullscreenStudyMode ? "退出全屏" : "全屏学习"}
      </button>
      <label className="immersive-session-rate-field">
        <span className="immersive-session-rate-label">倍速</span>
        <span className="immersive-session-rate-input-wrap">
          <input
            type="text"
            inputMode="decimal"
            className="immersive-session-rate-input [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            style={{ MozAppearance: "textfield" }}
            value={playbackRateInputValue}
            onChange={handlePlaybackRateInputChange}
            onBlur={handlePlaybackRateInputBlur}
            onKeyDown={handlePlaybackRateInputKeyDown}
            aria-label="播放倍速"
          />
          <span className="immersive-session-rate-stepper">
            <button
              type="button"
              className="immersive-session-rate-stepper-button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => adjustPlaybackRateByStep(1)}
              aria-label="倍速增加 0.25"
            >
              <ChevronUp className="immersive-session-rate-stepper-icon" />
            </button>
            <button
              type="button"
              className="immersive-session-rate-stepper-button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => adjustPlaybackRateByStep(-1)}
              aria-label="倍速减少 0.25"
            >
              <ChevronDown className="immersive-session-rate-stepper-icon" />
            </button>
          </span>
        </span>
        <span className="immersive-session-rate-suffix">x</span>
      </label>
      <button
        type="button"
        className="immersive-session-action"
        onClick={handleResetPlaybackRate}
        title="恢复默认倍速 1.0x"
      >
        重置
      </button>
      <button
        type="button"
        className={`immersive-session-toggle ${playbackRatePinned ? "immersive-session-toggle--active" : ""}`}
        aria-pressed={playbackRatePinned}
        onClick={handleTogglePlaybackRatePinned}
        title={playbackRatePinned ? "取消固定倍速" : "切换句子时保持倍速不变"}
      >
        固定
      </button>
    </div>
  );
}
