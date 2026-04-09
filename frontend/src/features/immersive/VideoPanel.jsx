import React, { forwardRef } from "react";
import { ArrowLeft, ChevronDown, ChevronUp, Loader2, Volume2 } from "lucide-react";
import { toast } from "sonner";

import AudioRecorder from "../../shared/components/AudioRecorder";
import SOEResultCard from "./SOEResultCard";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "../../shared/ui";
import { cn } from "../../lib/utils";
import { computeCefrClassName } from "./CefrBadge";
import { getShortcutLabel } from "./learningSettings";

const VideoPanel = forwardRef(function VideoPanel(
  {
    // Card props
    immersiveActive,
    hasExitHandler,
    exitImmersive,
    currentSentenceIndex,
    sentenceCount,
    // Media props
    mediaMode,
    mediaBlobUrl,
    needsBinding,
    mediaReady,
    setMediaReady,
    mediaElementRef,
    clipAudioRef,
    allowNativeVideoFullscreen,
    handleMainMediaError,
    onMainMediaTimeUpdate,
    // Overlay props
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
    // Refs
    immersiveContainerRef,
    immersivePageShellClassName,
    handleImmersivePageClick,
    // Additional props from typing panel (for inline typing when immersiveActive)
    immersiveMediaRef,
    wordRevealComparableIndices,
    sentenceJumpInputValue,
    setSentenceJumpEditing,
    sentenceJumpValue,
    setSentenceJumpValue,
    handleSentenceJumpKeyDown,
    handleSentenceJumpBlur,
    requestNavigateSentence,
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
    expectedTokens,
    wordStatuses,
    wordInputs,
    wordRowLines,
    wordRowFrameRef,
    currentSentenceCefrMap,
    cefrAnalyzerRef,
    cefrLevel,
    buildLetterSlots,
    showPreviousSentenceBlock,
    canRenderInteractiveWordbook,
    wordbookSentence,
    wordbookSentenceTokens,
    wordbookSelectedTokenIndexes,
    wordbookBusy,
    wordbookSuccessAnimationIndexes,
    handleWordbookTokenPointerDown,
    requestInteractiveWordbookSentencePlayback,
    wordbookSentencePlaybackLabel,
    collectWordbookEntry,
    selectedWordbookTokens,
    selectedWordbookStart,
    selectedWordbookEnd,
    selectedWordbookText,
    wordbookSuccessMessage,
    wordbookSentenceZh,
    soeTargetSentence,
    translationEn,
    previousSentence,
    requestPreviousSentencePlayback,
    mediaError,
    waitingForInitialPlayback,
    phase,
    learningSettings,
    soeLoading,
    soeResult,
    setSoeResult,
    apiClient,
    accessToken,
    currentLessonId,
    typingPanelRef,
    typingInputRef,
    typingInputClassName,
    currentWordInput,
    typingEnabled,
    handleKeyDown,
    focusTypingInput,
    isTouchDevice,
    shouldKeepControlFocus,
    audioRecorderRef,
    parseResponse,
    wordbookSentenceCefrMap,
    translationZh,
    bindingInputRef,
    handleBindLocalFile,
    updateTranslationMaskMetrics,
    lookupCefrLevelFromMap,
  },
  ref
) {
  return (
    <div ref={ref} className={immersivePageShellClassName}>
      <Card
        className={`immersive-page ${immersiveActive ? "immersive-page--immersive" : ""}`}
        onClick={handleImmersivePageClick}
      >
        <CardHeader className="immersive-card-header">
          <div className="immersive-header">
            <div className="immersive-header-left">
              {immersiveActive && hasExitHandler ? (
                <Button variant="outline" size="sm" onClick={() => void exitImmersive("button")}>
                  <ArrowLeft className="size-4" />
                  退出
                </Button>
              ) : null}
            </div>
            <CardDescription className="immersive-header-progress">
              视频
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="immersive-card-content space-y-4">
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
                  <p className="immersive-hint">将按句自动播放并在下方拼写。</p>
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
                  <p className="immersive-hint">媒体不可用，已改为逐句音频播放。</p>
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

          {/* 控制按钮行 - 视频下方 */}
          <div className="immersive-video-controls">
            <div className="immersive-session-controls" aria-label="沉浸学习控制">
              <button
                type="button"
                className="immersive-session-action"
                disabled={currentSentenceIndex <= 0}
                onClick={() => requestNavigateSentence({ delta: -1, source: "status_prev" })}
                aria-label="上一句"
              >
                ‹ 上一句
              </button>
              <button
                type="button"
                className="immersive-session-action"
                disabled={currentSentenceIndex >= sentenceCount - 1}
                onClick={() => requestNavigateSentence({ delta: 1, source: "status_next" })}
                aria-label="下一句"
              >
                下一句 ›
              </button>
              <button
                type="button"
                className={`immersive-session-toggle ${singleSentenceLoopEnabled ? "immersive-session-toggle--active" : ""}`}
                aria-pressed={singleSentenceLoopEnabled}
                onClick={handleToggleSingleSentenceLoop}
                title="重复播放当前句子，加强听力训练"
              >
                精听
              </button>
              <div className="h-6 w-px bg-border mx-1 shrink-0" aria-hidden="true" />
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
            {isPlaying ? <Badge variant="secondary">正在播放本句</Badge> : null}
            {isPlaybackPaused ? <Badge variant="outline">已暂停</Badge> : null}
          </div>

          <input
            ref={bindingInputRef}
            type="file"
            accept="video/*,audio/*"
            className="hidden"
            onChange={(event) => {
              const nextFile = event.target.files?.[0] ?? null;
              if (nextFile) {
                void handleBindLocalFile(nextFile);
              }
              event.target.value = "";
            }}
          />

          <input
            ref={typingInputRef}
            className={typingInputClassName}
            value={currentWordInput}
            onChange={() => {}}
            onKeyDown={handleKeyDown}
            onBlur={(event) => {
              if (typingEnabled) {
                setTimeout(() => {
                  const nextFocusTarget = event.relatedTarget ?? document.activeElement;
                  if (shouldKeepControlFocus(nextFocusTarget)) return;
                  focusTypingInput(isTouchDevice);
                }, 0);
              }
            }}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            inputMode="text"
            spellCheck={false}
            readOnly={!typingEnabled}
          />

          {soeResult ? (
            <SOEResultCard result={soeResult} onClose={() => setSoeResult(null)} />
          ) : null}

          {soeLoading ? (
            <div style={{
              position: "fixed",
              bottom: "24px",
              right: "24px",
              backgroundColor: "#1f2937",
              color: "#fff",
              padding: "12px 16px",
              borderRadius: "8px",
              fontSize: "14px",
              zIndex: 9998,
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}>
              <Loader2 className="size-4 animate-spin" />
              评测中...
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
});

export default VideoPanel;
