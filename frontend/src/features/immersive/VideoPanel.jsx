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
              第 {Math.min(currentSentenceIndex + 1, sentenceCount)} / {sentenceCount} 句
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

          {!immersiveActive ? (
            <div className="rounded-2xl border border-dashed bg-muted/15 px-6 py-8 text-sm text-muted-foreground">
              请先在历史记录页顶部配置学习参数，再从课程卡片进入学习。
            </div>
          ) : (
            <div
              ref={typingPanelRef}
              className="immersive-typing"
            >
              <div className="immersive-typing-status">
                <span className="immersive-status-chip flex items-center gap-1 text-sm">
                  <span className="text-muted-foreground">第</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    className="w-14 rounded border border-input bg-background px-1.5 py-0.5 text-center text-sm focus:outline-none focus:ring-1 focus:ring-ring [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    min={0}
                    max={sentenceCount}
                    value={sentenceJumpInputValue}
                    onFocus={() => {
                      setSentenceJumpEditing(true);
                      if (sentenceJumpValue === "") {
                        setSentenceJumpValue(String(currentSentenceIndex + 1));
                      }
                    }}
                    onChange={(e) => {
                      setSentenceJumpEditing(true);
                      setSentenceJumpValue(e.target.value);
                    }}
                    onKeyDown={handleSentenceJumpKeyDown}
                    onBlur={handleSentenceJumpBlur}
                    aria-label="跳转到指定句子"
                  />
                  <span className="text-muted-foreground">/ {sentenceCount} 句</span>
                </span>
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

              {mediaError ? <p className="text-xs text-destructive">{mediaError}</p> : null}
              {waitingForInitialPlayback ? <p className="text-xs text-muted-foreground">输入已完成，等待本句播放结束。</p> : null}

              <div ref={wordRowFrameRef} className="immersive-word-row-frame">
                {wordRowLines ? (
                  wordRowLines.map((lineIndices, rowIndex) => (
                    <div
                      key={rowIndex}
                      className={cn(
                        "immersive-word-row",
                        rowIndex === 0 ? "immersive-word-row--multi-line-first" : "immersive-word-row--multi-line-left",
                      )}
                    >
                      {lineIndices.map((index) => {
                        const token = expectedTokens[index];
                        const status = wordStatuses[index] || "pending";
                        const slots = buildLetterSlots(token, wordInputs[index] || "", wordRevealComparableIndices[index] || []);
                        return (
                          <div
                            key={`${token}-${index}`}
                            className={cn(
                              `immersive-word-slot immersive-word-slot--${status} immersive-word-slot--underline`,
                              (() => {
                                const lookupResult = lookupCefrLevelFromMap(currentSentenceCefrMap, token, cefrAnalyzerRef.current);
                                const cefrClass = computeCefrClassName(lookupResult, cefrLevel);
                                if (typeof window !== "undefined" && window.__cefrDebug?.enabled) {
                                  console.debug("[CEFR render]", { token, lookupResult, cefrLevel, cefrClass });
                                }
                                return cefrClass;
                              })(),
                            )}
                          >
                            <div className="immersive-letter-row">
                              {slots.map((slot) => (
                                <span
                                  key={slot.key}
                                  className={`immersive-letter-cell immersive-letter-cell--${slot.state} ${
                                    slot.extra ? "immersive-letter-cell--extra" : ""
                                  }`}
                                >
                                  <span className="immersive-letter-char">{slot.char}</span>
                                </span>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))
                ) : (
                  <div className="immersive-word-row immersive-word-row--centered">
                    {expectedTokens.map((token, index) => {
                      const status = wordStatuses[index] || "pending";
                      const slots = buildLetterSlots(token, wordInputs[index] || "", wordRevealComparableIndices[index] || []);
                      return (
                        <div
                          key={`${token}-${index}`}
                          className={cn(
                            `immersive-word-slot immersive-word-slot--${status} immersive-word-slot--underline`,
                            (() => {
                              const lookupResult = lookupCefrLevelFromMap(currentSentenceCefrMap, token, cefrAnalyzerRef.current);
                              const cefrClass = computeCefrClassName(lookupResult, cefrLevel);
                              if (typeof window !== "undefined" && window.__cefrDebug?.enabled) {
                                console.debug("[CEFR render]", { token, lookupResult, cefrLevel, cefrClass });
                              }
                              return cefrClass;
                            })(),
                          )}
                        >
                          <div className="immersive-letter-row">
                            {slots.map((slot) => (
                              <span
                                key={slot.key}
                                className={`immersive-letter-cell immersive-letter-cell--${slot.state} ${
                                  slot.extra ? "immersive-letter-cell--extra" : ""
                                }`}
                              >
                                <span className="immersive-letter-char">{slot.char}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {showPreviousSentenceBlock ? (
                <div className="immersive-previous-sentence">
                  {canRenderInteractiveWordbook ? (
                    <>
                      <div className="immersive-previous-sentence__row">
                        {wordbookSentence ? (
                          <AudioRecorder
                            compact
                            triggerRef={audioRecorderRef}
                            onRecordingComplete={async (audioBlob, durationMs) => {
                              if (!apiClient || !wordbookSentence) return;
                              if (!audioBlob || audioBlob.size === 0) {
                                toast.error("未采集到录音，请稍长按麦克风后再松开。");
                                return;
                              }
                              setSoeLoading(true);
                              try {
                                const resp = await apiClient("/api/soe/assess", {
                                  method: "POST",
                                  body: (() => {
                                    const fd = new FormData();
                                    fd.append("audio_file", audioBlob, "recording.webm");
                                    fd.append("ref_text", wordbookSentence.text_en);
                                    fd.append("sentence_id", String(wordbookSentence.idx));
                                    if (currentLessonId) fd.append("lesson_id", currentLessonId);
                                    return fd;
                                  })(),
                                }, accessToken);
                                const data = await parseResponse(resp);
                                if (!resp.ok || data?.ok === false) {
                                  setSoeResult({ ok: false, message: formatSoeAssessErrorMessage(data, resp.status) });
                                } else {
                                  setSoeResult(data);
                                }
                              } catch (err) {
                                console.error("[SOE] Assessment failed:", err);
                                const errMsg = err instanceof Error ? err.message : String(err);
                                const short = errMsg.length > 80 ? errMsg.slice(0, 80) + "..." : errMsg;
                                toast.error(short || "评测失败，请稍后重试");
                              } finally {
                                setSoeLoading(false);
                              }
                            }}
                          />
                        ) : null}
                        <div className={`min-w-0 flex flex-1 flex-wrap items-center gap-x-1 gap-y-2`}>
                          {wordbookSentenceTokens.map((token, index) => {
                            const tokenSelected = wordbookSelectedTokenIndexes.includes(index);
                            return (
                              <button
                                key={`previous-wordbook-token-${token}-${index}`}
                                type="button"
                                data-wordbook-token-index={index}
                                aria-pressed={tokenSelected}
                                className={cn(
                                  "min-h-0 cursor-pointer rounded-md border px-1.5 py-0.5 text-left text-sm leading-6 transition-colors select-none touch-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 immersive-wordbook-token",
                                  tokenSelected
                                    ? "bg-slate-200 text-foreground shadow-sm border-transparent"
                                    : "bg-slate-100/80 text-foreground hover:bg-slate-200/70 border-transparent",
                                  wordbookBusy ? "opacity-60" : "",
                                  computeCefrClassName(
                                    lookupCefrLevelFromMap(wordbookSentenceCefrMap, token, cefrAnalyzerRef.current),
                                    cefrLevel,
                                  ),
                                  wordbookSuccessAnimationIndexes.includes(index) ? "wordbook-token--success" : "",
                                )}
                                disabled={wordbookBusy}
                                onContextMenu={(event) => {
                                  event.preventDefault();
                                }}
                                onPointerDown={(event) => {
                                  handleWordbookTokenPointerDown(event, index);
                                }}
                              >
                                {token}
                              </button>
                            );
                          })}
                        </div>
                        <button
                          type="button"
                          className="immersive-previous-sentence__speaker"
                          aria-label={wordbookSentencePlaybackLabel}
                          onClick={(event) => {
                            event.stopPropagation();
                            requestInteractiveWordbookSentencePlayback("wordbook_sentence_speaker");
                          }}
                        >
                          <Volume2 className="size-4" />
                        </button>
                      </div>
                      <div className="immersive-previous-sentence__actions">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="shrink-0 text-foreground"
                          disabled={wordbookBusy || selectedWordbookTokens.length === 0}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (!wordbookSentence) return;
                            void collectWordbookEntry({
                              sentence: wordbookSentence,
                              entryType: selectedWordbookTokens.length > 1 ? "phrase" : "word",
                              entryText: selectedWordbookText,
                              startTokenIndex: selectedWordbookStart,
                              endTokenIndex: selectedWordbookEnd,
                            });
                          }}
                        >
                          {wordbookBusy ? "加入中..." : "加入生词本"}
                        </Button>
                        {wordbookSuccessMessage ? (
                          <span className="text-sm text-emerald-600 font-medium animate-in fade-in duration-200">
                            {wordbookSuccessMessage}
                          </span>
                        ) : null}
                      </div>
                      <p className="pl-0">
                        {wordbookSentenceZh}
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="immersive-previous-sentence__row">
                        {soeTargetSentence ? (
                          <AudioRecorder
                            compact
                            triggerRef={audioRecorderRef}
                            onRecordingComplete={async (audioBlob, durationMs) => {
                              if (!apiClient) return;
                              const sentence = soeTargetSentence;
                              if (!sentence?.text_en) {
                                toast.error("当前没有可用于评测的句子文本。");
                                return;
                              }
                              if (!audioBlob || audioBlob.size === 0) {
                                toast.error("未采集到录音，请稍长按麦克风后再松开。");
                                return;
                              }
                              setSoeLoading(true);
                              try {
                                const resp = await apiClient("/api/soe/assess", {
                                  method: "POST",
                                  body: (() => {
                                    const fd = new FormData();
                                    fd.append("audio_file", audioBlob, "recording.webm");
                                    fd.append("ref_text", sentence.text_en);
                                    fd.append("sentence_id", String(sentence.idx));
                                    if (currentLessonId) fd.append("lesson_id", currentLessonId);
                                    return fd;
                                  })(),
                                }, accessToken);
                                const data = await parseResponse(resp);
                                if (!resp.ok || data?.ok === false) {
                                  setSoeResult({ ok: false, message: formatSoeAssessErrorMessage(data, resp.status) });
                                } else {
                                  setSoeResult(data);
                                }
                              } catch (err) {
                                console.error("[SOE] Assessment failed:", err);
                                const errMsg = err instanceof Error ? err.message : String(err);
                                const short = errMsg.length > 80 ? errMsg.slice(0, 80) + "..." : errMsg;
                                toast.error(short || "评测失败，请稍后重试");
                              } finally {
                                setSoeLoading(false);
                              }
                            }}
                          />
                        ) : null}
                        <p className="min-w-0 flex-1">
                          {translationEn}
                        </p>
                        {previousSentence ? (
                          <button
                            type="button"
                            className="immersive-previous-sentence__speaker"
                            aria-label="播放上一句"
                            onClick={(event) => {
                              event.stopPropagation();
                              requestPreviousSentencePlayback("previous_sentence_speaker");
                            }}
                          >
                            <Volume2 className="size-4" />
                          </button>
                        ) : null}
                      </div>
                      <p className="pl-0">
                        {translationZh}
                      </p>
                    </>
                  )}
                </div>
              ) : null}
              <p className="immersive-keyboard-hint text-xs text-muted-foreground">
                快捷键按历史页顶部配置生效：{getShortcutLabel(learningSettings.shortcuts.reveal_letter)} 揭示字母，
                {getShortcutLabel(learningSettings.shortcuts.reveal_word)} 揭示单词，
                {getShortcutLabel(learningSettings.shortcuts.previous_sentence)} 上一句，
                {getShortcutLabel(learningSettings.shortcuts.next_sentence)} 下一句，
                {getShortcutLabel(learningSettings.shortcuts.replay_sentence)} 重播，
                {getShortcutLabel(learningSettings.shortcuts.toggle_pause_playback)} 播放，
                {getShortcutLabel(learningSettings.shortcuts.record_score)} 录音评分。
              </p>
              {phase === "lesson_completed" ? <p className="text-sm text-primary">课程已完成，恭喜你！</p> : null}
            </div>
          )}

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
