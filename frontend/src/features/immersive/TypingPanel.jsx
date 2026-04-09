import React, { forwardRef } from "react";
import { ChevronDown, ChevronUp, Volume2 } from "lucide-react";
import { toast } from "sonner";

import AudioRecorder from "../../shared/components/AudioRecorder";
import { Badge, Button } from "../../shared/ui";
import { cn } from "../../lib/utils";
import { computeCefrClassName } from "./CefrBadge";
import { getShortcutLabel } from "./learningSettings";

function formatSoeAssessErrorMessage(data, httpStatus = 0) {
  if (!data || typeof data !== "object") {
    return httpStatus ? `评测失败（HTTP ${httpStatus}）` : "评测失败";
  }
  const detail = data.detail;
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0];
    if (first && typeof first === "object") {
      if (typeof first.msg === "string" && first.msg.trim()) return first.msg.trim();
      if (typeof first.message === "string" && first.message.trim()) return first.message.trim();
    }
  }
  const msg = typeof data.message === "string" && data.message.trim() ? data.message.trim() : "";
  const code = typeof data.error_code === "string" && data.error_code.trim() ? data.error_code.trim() : "";
  const detailStr = typeof detail === "string" && detail.trim() ? detail.trim() : "";

  let out = msg;
  if (code && !out.includes(code)) {
    out = out ? `[${code}] ${out}` : `[${code}]`;
  }
  if (detailStr && !out.includes(detailStr)) {
    out = out ? `${out} - ${detailStr}` : detailStr;
  }
  return out || "评测失败";
}

const TypingPanel = forwardRef(function TypingPanel(
  {
    // Status bar props
    sentenceCount,
    currentSentenceIndex,
    sentenceJumpInputValue,
    setSentenceJumpEditing,
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
    // Word slots props
    expectedTokens,
    wordStatuses,
    wordInputs,
    wordRowLines,
    wordRowFrameRef,
    currentSentenceCefrMap,
    cefrAnalyzerRef,
    cefrLevel,
    buildLetterSlots,
    wordRevealComparableIndices,
    // Previous sentence props
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
    // Other props
    mediaError,
    waitingForInitialPlayback,
    phase,
    learningSettings,
    // SOE props
    soeLoading,
    soeResult,
    setSoeResult,
    apiClient,
    accessToken,
    currentLessonId,
    // Refs
    typingPanelRef,
    // Additional refs
    audioRecorderRef,
    parseResponse,
    wordbookSentenceCefrMap,
    translationZh,
    lookupCefrLevelFromMap,
  },
  ref
) {
  return (
    <div ref={ref} className="immersive-typing">
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
  );
});

export default TypingPanel;
