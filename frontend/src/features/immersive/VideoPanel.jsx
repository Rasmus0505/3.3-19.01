import React, { forwardRef } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Loader2,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";

import {
  Badge,
  Button,
  Card,
  CardContent,
} from "../../shared/ui";

function buildNextSentencePreview(nextSentence) {
  if (!nextSentence?.text_en) return "完成当前句后解锁下一句";

  return nextSentence.text_en
    .split("")
    .map((char) => (char === " " ? " " : "·"))
    .join("");
}

const VideoPanel = forwardRef(function VideoPanel(
  {
    immersiveActive,
    hasExitHandler,
    exitImmersive,
    lessonTitle,
    currentSentenceIndex,
    sentenceCount,
    mediaMode,
    mediaBlobUrl,
    needsBinding,
    setMediaReady,
    mediaElementRef,
    clipAudioRef,
    allowNativeVideoFullscreen,
    handleMainMediaError,
    onMainMediaTimeUpdate,
    showMediaLoadingOverlay,
    showEntryHintOverlay,
    entryHintItems,
    translationMaskVisible,
    translationMaskStyle,
    translationMaskClassName,
    translationMaskChromeVisible,
    handleTranslationMaskPointerDown,
    handleTranslationMaskPointerEnter,
    handleTranslationMaskPointerLeave,
    TRANSLATION_MASK_RESIZE_HANDLES,
    immersivePageShellClassName,
    handleImmersivePageClick,
    immersiveMediaRef,
    updateTranslationMaskMetrics,
    currentSentence,
    previousSentence,
    nextSentence,
    sentenceTypingDone,
    explanationAvailable,
    explanationOpen,
    onToggleExplanation,
    requestNavigateSentence,
    requestReplayCurrentSentence,
    requestTogglePausePlayback,
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
    showSessionControls = true,
  },
  ref,
) {
  const mediaTypeLabel = mediaMode === "video" ? "视频模式" : mediaMode === "audio" ? "音频模式" : "逐句音频";
  const currentSentenceText = currentSentence?.text_en || "";
  const currentSentenceTranslation = currentSentence?.text_zh || "";
  const focusHeadline = sentenceTypingDone
    ? currentSentenceText || "本句已完成"
    : "专注听这一句，然后在底部 Dock 里拼出来";
  const focusSupport = sentenceTypingDone
    ? currentSentenceTranslation || "可以继续回放、查看讲解，或直接进入下一句。"
    : "完成当前句后，会自动解锁整句展示和讲解内容。";

  return (
    <div ref={ref} className={immersivePageShellClassName}>
      <Card
        className={`immersive-page ${immersiveActive ? "immersive-page--immersive" : ""}`}
        onClick={handleImmersivePageClick}
      >
        <CardContent className="immersive-card-content">
          <div className="immersive-stage">
            <div className="immersive-stage__topbar">
              <div className="immersive-stage__topbar-main">
                {immersiveActive && hasExitHandler ? (
                  <Button variant="outline" size="sm" onClick={() => void exitImmersive("button")}>
                    <ArrowLeft className="size-4" />
                    退出
                  </Button>
                ) : null}
                <div className="immersive-stage__copy">
                  <p className="immersive-stage__eyebrow">Annie Immersive</p>
                  <h1 className="immersive-stage__title">{lessonTitle || "课程视频"}</h1>
                </div>
              </div>
              <div className="immersive-stage__meta">
                <Badge variant="secondary">第 {currentSentenceIndex + 1} / {sentenceCount} 句</Badge>
                <Badge variant="outline">{mediaTypeLabel}</Badge>
                <Badge variant={sentenceTypingDone ? "secondary" : "outline"}>
                  {sentenceTypingDone ? "本句完成" : isPlaying ? "正在播放" : isPlaybackPaused ? "已暂停" : "等待输入"}
                </Badge>
                <button
                  type="button"
                  className={`immersive-stage__drawer-toggle ${explanationOpen ? "immersive-stage__drawer-toggle--active" : ""}`}
                  onClick={onToggleExplanation}
                  aria-pressed={explanationOpen}
                >
                  {explanationOpen ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}
                  {explanationAvailable ? "讲解抽屉" : "讲解待解锁"}
                </button>
              </div>
            </div>

            <div className="immersive-stage__media-shell">
              <div ref={immersiveMediaRef} className="immersive-media">
                {!needsBinding && mediaMode === "video" ? (
                  <video
                    ref={mediaElementRef}
                    className={allowNativeVideoFullscreen ? "immersive-media-video immersive-media-video--allow-native-fullscreen" : "immersive-media-video"}
                    src={mediaBlobUrl || undefined}
                    preload="metadata"
                    onLoadedMetadata={() => setMediaReady(true)}
                    onLoadedData={() => {
                      updateTranslationMaskMetrics();
                      if (typeof window !== "undefined") {
                        window.requestAnimationFrame(() => updateTranslationMaskMetrics());
                      }
                    }}
                    onCanPlay={() => setMediaReady(true)}
                    onError={handleMainMediaError}
                    onTimeUpdate={onMainMediaTimeUpdate}
                    controls
                    controlsList={allowNativeVideoFullscreen ? undefined : "nofullscreen"}
                    playsInline
                    webkit-playsinline="true"
                  />
                ) : null}

                {!needsBinding && mediaMode === "audio" ? (
                  <div className="w-full px-6">
                    <div className="immersive-media-audio-placeholder">
                      <p>音频素材模式</p>
                      <p className="immersive-hint">主舞台保留节奏感，拼写任务放到底部 Dock 完成。</p>
                    </div>
                    <audio
                      ref={mediaElementRef}
                      src={mediaBlobUrl || undefined}
                      preload="metadata"
                      onLoadedMetadata={() => setMediaReady(true)}
                      onCanPlay={() => setMediaReady(true)}
                      onError={handleMainMediaError}
                      onTimeUpdate={onMainMediaTimeUpdate}
                      controls
                      controlsList="nofullscreen"
                    />
                  </div>
                ) : null}

                {!needsBinding && mediaMode === "clip" ? (
                  <div className="w-full px-6">
                    <div className="immersive-media-audio-placeholder">
                      <p>音频降级模式</p>
                      <p className="immersive-hint">媒体不可用，已切换到逐句播放与底部拼写任务。</p>
                    </div>
                    <audio ref={clipAudioRef} controls />
                  </div>
                ) : null}

                {showMediaLoadingOverlay ? (
                  <div className="immersive-overlay">
                    <Button variant="secondary" disabled>
                      <Loader2 className="size-4 animate-spin" />
                      媒体加载中
                    </Button>
                  </div>
                ) : null}

                {showEntryHintOverlay ? (
                  <div className="immersive-entry-hint" aria-live="polite">
                    <div className="immersive-entry-hint__panel">
                      <div className="immersive-entry-hint__chips">
                        {entryHintItems.map((item) => (
                          <span key={item.id} className="immersive-entry-hint__chip">
                            <span className="immersive-entry-hint__shortcut">{item.shortcutLabel}</span>
                            <span>{item.actionLabel}</span>
                          </span>
                        ))}
                      </div>
                      <p className="immersive-entry-hint__settings-note">快捷键可在首页修改</p>
                    </div>
                  </div>
                ) : null}

                {translationMaskVisible && translationMaskStyle ? (
                  <div className="immersive-media-mask-layer">
                    <div
                      className={translationMaskClassName}
                      style={translationMaskStyle}
                      data-translation-mask="true"
                      onPointerDown={(event) => handleTranslationMaskPointerDown(event, "move")}
                      onPointerEnter={handleTranslationMaskPointerEnter}
                      onPointerLeave={handleTranslationMaskPointerLeave}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <div className="immersive-translation-mask__glass" />
                      <div className="immersive-translation-mask__label">字幕遮挡板</div>
                      {TRANSLATION_MASK_RESIZE_HANDLES.map((handle) => (
                        <button
                          key={handle.key}
                          type="button"
                          aria-label={handle.ariaLabel}
                          aria-hidden={!translationMaskChromeVisible}
                          className={handle.className}
                          tabIndex={translationMaskChromeVisible ? 0 : -1}
                          onPointerDown={(event) => handleTranslationMaskPointerDown(event, handle.mode)}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              {showSessionControls ? (
                <div className="immersive-stage__toolbar">
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
                </div>
              ) : null}
            </div>

            <div className="immersive-stage__narrative">
              <div className="immersive-stage__focus">
                <span className="immersive-stage__focus-label">当前任务</span>
                <h2 className="immersive-stage__focus-headline">{focusHeadline}</h2>
                <p className="immersive-stage__focus-support">{focusSupport}</p>
              </div>
              <div className="immersive-stage__preview-grid">
                <button
                  type="button"
                  className="immersive-stage__preview-card"
                  disabled={currentSentenceIndex <= 0}
                  onClick={() => requestNavigateSentence({ delta: -1, source: "preview_prev" })}
                >
                  <span className="immersive-stage__preview-label">上一句</span>
                  <span className="immersive-stage__preview-text">
                    {previousSentence?.text_en || "还没有上一句"}
                  </span>
                </button>
                <button
                  type="button"
                  className="immersive-stage__preview-card immersive-stage__preview-card--ghost"
                  disabled={currentSentenceIndex >= sentenceCount - 1}
                  onClick={() => requestNavigateSentence({ delta: 1, source: "preview_next" })}
                >
                  <span className="immersive-stage__preview-label">下一句</span>
                  <span className="immersive-stage__preview-text">{buildNextSentencePreview(nextSentence)}</span>
                </button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
});

export default VideoPanel;
