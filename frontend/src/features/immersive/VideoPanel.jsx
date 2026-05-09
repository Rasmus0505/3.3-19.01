import React, { forwardRef } from "react";
import {
  ArrowLeft,
  Loader2,
} from "lucide-react";

import {
  Badge,
  Button,
  Card,
  CardContent,
} from "../../shared/ui";
import SessionControls from "./SessionControls";

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
    mediaElementKey,
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
    sentenceTypingDone,
    requestNavigateSentence,
    requestReplayCurrentSentence,
    requestTogglePausePlayback,
    fullscreenStudyMode,
    onToggleFullscreenStudyMode,
    singleSentenceLoopEnabled,
    handleToggleSingleSentenceLoop,
    playbackRateInputValue,
    playbackRateInputRef,
    handlePlaybackRateInputChange,
    handlePlaybackRateInputBlur,
    handlePlaybackRateInputKeyDown,
    adjustPlaybackRateByStep,
    handleResetPlaybackRate,
    playbackRatePinned,
    handleTogglePlaybackRatePinned,
    isPlaying,
    isPlaybackPaused,
    learningTimerLabel,
    learningTimerStatusLabel,
    learningTimerPaused,
    learningTimerBusy,
    onPauseLearningTimer,
    onResumeLearningTimer,
    showSessionControls = true,
  },
  ref,
) {
  return (
    <div ref={ref} className={immersivePageShellClassName}>
      <Card
        className={`immersive-page ${immersiveActive ? "immersive-page--immersive" : ""}`}
        onClick={handleImmersivePageClick}
      >
        <CardContent className="immersive-card-content">
          <div className="immersive-stage">
            <div className="immersive-stage__topbar immersive-stage__topbar--compact">
              <div className="immersive-stage__topbar-main">
                {immersiveActive && hasExitHandler ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      void exitImmersive("button");
                    }}
                  >
                    <ArrowLeft className="size-4" />
                    退出
                  </Button>
                ) : null}
                <h1 className="immersive-stage__title">{lessonTitle || "课程视频"}</h1>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Badge variant="outline" className="rounded-full px-3 py-1 text-xs">
                  {learningTimerStatusLabel || "学习中"}
                </Badge>
                <Badge className="rounded-full bg-slate-950 px-3 py-1 text-xs text-white hover:bg-slate-950">
                  {learningTimerLabel || "00:00"}
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={learningTimerBusy}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (learningTimerPaused) {
                      void onResumeLearningTimer?.();
                    } else {
                      void onPauseLearningTimer?.();
                    }
                  }}
                >
                  {learningTimerPaused ? "继续计时" : "暂停计时"}
                </Button>
              </div>
            </div>

            <div className="immersive-stage__media-shell">
              <div ref={immersiveMediaRef} className="immersive-media">
                {!needsBinding && mediaMode === "video" ? (
                  <video
                    key={mediaElementKey}
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
                      key={mediaElementKey}
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
                  <SessionControls
                    currentSentenceIndex={currentSentenceIndex}
                    sentenceCount={sentenceCount}
                    requestNavigateSentence={requestNavigateSentence}
                    requestReplayCurrentSentence={requestReplayCurrentSentence}
                    requestTogglePausePlayback={requestTogglePausePlayback}
                    fullscreenStudyMode={fullscreenStudyMode}
                    onToggleFullscreenStudyMode={onToggleFullscreenStudyMode}
                    singleSentenceLoopEnabled={singleSentenceLoopEnabled}
                    handleToggleSingleSentenceLoop={handleToggleSingleSentenceLoop}
                    playbackRateInputValue={playbackRateInputValue}
                    playbackRateInputRef={playbackRateInputRef}
                    handlePlaybackRateInputChange={handlePlaybackRateInputChange}
                    handlePlaybackRateInputBlur={handlePlaybackRateInputBlur}
                    handlePlaybackRateInputKeyDown={handlePlaybackRateInputKeyDown}
                    adjustPlaybackRateByStep={adjustPlaybackRateByStep}
                    handleResetPlaybackRate={handleResetPlaybackRate}
                    playbackRatePinned={playbackRatePinned}
                    handleTogglePlaybackRatePinned={handleTogglePlaybackRatePinned}
                    isPlaying={isPlaying}
                    isPlaybackPaused={isPlaybackPaused}
                  />
                </div>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
});

export default VideoPanel;


