import React, { forwardRef } from "react";
import { Loader2, Volume2 } from "lucide-react";
import { toast } from "sonner";

import AudioRecorder from "../../shared/components/AudioRecorder";
import { Badge, Button } from "../../shared/ui";
import { cn } from "../../lib/utils";
import { computeCefrClassName } from "./CefrBadge";
import { getShortcutLabel } from "./learningSettings";
import SOEResultCard from "./SOEResultCard";

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

function textToUnderscores(text = "") {
  return String(text)
    .split("")
    .map((char) => (char === " " ? " " : "_"))
    .join("");
}

function renderWordSlots({
  expectedTokens,
  wordStatuses,
  wordInputs,
  wordRevealComparableIndices,
  wordRowLines,
  buildLetterSlots,
  currentSentenceCefrMap,
  cefrAnalyzerRef,
  cefrLevel,
  lookupCefrLevelFromMap,
}) {
  const renderToken = (token, index) => {
    const status = wordStatuses[index] || "pending";
    const slots = buildLetterSlots(token, wordInputs[index] || "", wordRevealComparableIndices[index] || []);

    return (
      <div
        key={`${token}-${index}`}
        className={cn(
          `immersive-word-slot immersive-word-slot--${status} immersive-word-slot--underline`,
          computeCefrClassName(
            lookupCefrLevelFromMap(currentSentenceCefrMap, token, cefrAnalyzerRef.current),
            cefrLevel,
          ),
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
  };

  if (wordRowLines?.length) {
    return wordRowLines.map((lineIndices, rowIndex) => (
      <div
        key={rowIndex}
        className={cn(
          "immersive-word-row",
          rowIndex === 0 ? "immersive-word-row--multi-line-first" : "immersive-word-row--multi-line-left",
        )}
      >
        {lineIndices.map((index) => renderToken(expectedTokens[index], index))}
      </div>
    ));
  }

  return <div className="immersive-word-row immersive-word-row--centered">{expectedTokens.map(renderToken)}</div>;
}

const TypingPanel = forwardRef(function TypingPanel(
  {
    sentenceCount,
    currentSentenceIndex,
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
    wordRevealComparableIndices,
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
    previousSentence,
    requestPreviousSentencePlayback,
    mediaError,
    waitingForInitialPlayback,
    phase,
    learningSettings,
    soeLoading,
    soeResult,
    setSoeResult,
    setSoeLoading,
    apiClient,
    accessToken,
    currentLessonId,
    audioRecorderRef,
    parseResponse,
    wordbookSentenceCefrMap,
    translationZh,
    lookupCefrLevelFromMap,
    currentSentence,
    nextSentence,
    sentenceTypingDone,
    typingInputRef,
    currentWordInput,
    typingEnabled,
    handleKeyDown,
    focusTypingInput,
    isTouchDevice,
    shouldKeepControlFocus,
  },
  ref,
) {
  const previousSentenceZh = previousSentence?.text_zh || translationZh || "";
  const hiddenInputClassName = isTouchDevice
    ? "immersive-hidden-input immersive-hidden-input--touch"
    : "immersive-hidden-input";

  return (
    <div ref={ref} className="immersive-typing immersive-typing--dock">
      <div className="immersive-typing__header">
        <div className="immersive-typing__header-copy">
          <p className="immersive-typing__eyebrow">Typing Dock</p>
          <h2 className="immersive-typing__title">第 {currentSentenceIndex + 1} / {sentenceCount} 句</h2>
          <p className="immersive-typing__subtitle">
            当前句只保留一个任务焦点，复盘和预览都压到右侧信息轨。
          </p>
        </div>
        <div className="immersive-typing__status">
          {isPlaying ? <Badge variant="secondary">播放中</Badge> : null}
          {isPlaybackPaused ? <Badge variant="outline">已暂停</Badge> : null}
          {sentenceTypingDone ? <Badge variant="secondary">本句完成</Badge> : <Badge variant="outline">拼写中</Badge>}
        </div>
      </div>

      {mediaError ? <p className="immersive-typing__notice immersive-typing__notice--error">{mediaError}</p> : null}
      {waitingForInitialPlayback ? (
        <p className="immersive-typing__notice">输入已完成，等待本句播放结束。</p>
      ) : null}

      <div className="immersive-dock-grid">
        <section className="immersive-dock-focus">
          <section className="immersive-sentence-card immersive-sentence-card--current">
            <div className="immersive-sentence-card__header">
              <div className="immersive-sentence-card__meta">
                <span className="immersive-sentence-card__index">当前任务</span>
              </div>
              <Badge variant={sentenceTypingDone ? "secondary" : "outline"}>
                {sentenceTypingDone ? "已完成" : "输入中"}
              </Badge>
            </div>
            <div className="immersive-sentence-card__lead">
              {sentenceTypingDone
                ? currentSentence?.text_en || "本句已完成"
                : "听清这一句，然后直接在这里把它拼出来。"}
            </div>
            <div ref={wordRowFrameRef} className="immersive-word-row-frame immersive-word-row-frame--spotlight">
              {renderWordSlots({
                expectedTokens,
                wordStatuses,
                wordInputs,
                wordRevealComparableIndices,
                wordRowLines,
                buildLetterSlots,
                currentSentenceCefrMap,
                cefrAnalyzerRef,
                cefrLevel,
                lookupCefrLevelFromMap,
              })}
            </div>
            {sentenceTypingDone && currentSentence?.text_zh ? (
              <p className="immersive-sentence-card__translation immersive-sentence-card__translation--current">
                {currentSentence.text_zh}
              </p>
            ) : (
              <p className="immersive-sentence-card__helper">
                完成当前句后，会自动显示整句和讲解抽屉内容。
              </p>
            )}
          </section>
        </section>

        <aside className="immersive-dock-sidebar">
          {showPreviousSentenceBlock ? (
            <section className="immersive-sentence-card immersive-sentence-card--previous">
              <div className="immersive-sentence-card__header">
                <div className="immersive-sentence-card__meta">
                  <span className="immersive-sentence-card__marker" aria-hidden="true" />
                  <span className="immersive-sentence-card__index">上一句 / 复盘</span>
                </div>
                {canRenderInteractiveWordbook ? (
                  <div className="immersive-sentence-card__actions">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="shrink-0"
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
                ) : previousSentence ? (
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

              {canRenderInteractiveWordbook ? (
                <>
                  <div className="immersive-sentence-card__token-row">
                    {wordbookSentence ? (
                      <AudioRecorder
                        compact
                        triggerRef={audioRecorderRef}
                        onRecordingComplete={async (audioBlob) => {
                          if (!apiClient || !wordbookSentence) return;
                          if (!audioBlob || audioBlob.size === 0) {
                            toast.error("未采集到录音，请稍长按麦克风后再松开。");
                            return;
                          }
                          setSoeLoading(true);
                          try {
                            const resp = await apiClient(
                              "/api/soe/assess",
                              {
                                method: "POST",
                                body: (() => {
                                  const fd = new FormData();
                                  fd.append("audio_file", audioBlob, "recording.webm");
                                  fd.append("ref_text", wordbookSentence.text_en);
                                  fd.append("sentence_id", String(wordbookSentence.idx));
                                  if (currentLessonId) fd.append("lesson_id", currentLessonId);
                                  return fd;
                                })(),
                              },
                              accessToken,
                            );
                            const data = await parseResponse(resp);
                            if (!resp.ok || data?.ok === false) {
                              setSoeResult({ ok: false, message: formatSoeAssessErrorMessage(data, resp.status) });
                            } else {
                              setSoeResult(data);
                            }
                          } catch (err) {
                            const errMsg = err instanceof Error ? err.message : String(err);
                            const short = errMsg.length > 80 ? `${errMsg.slice(0, 80)}...` : errMsg;
                            toast.error(short || "评测失败，请稍后重试");
                          } finally {
                            setSoeLoading(false);
                          }
                        }}
                      />
                    ) : null}
                    <div className="immersive-sentence-card__token-wrap">
                      {wordbookSentenceTokens.map((token, index) => {
                        const tokenSelected = wordbookSelectedTokenIndexes.includes(index);
                        return (
                          <button
                            key={`previous-wordbook-token-${token}-${index}`}
                            type="button"
                            data-wordbook-token-index={index}
                            aria-pressed={tokenSelected}
                            className={cn(
                              "immersive-wordbook-token",
                              tokenSelected ? "immersive-wordbook-token--selected" : "",
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
                  </div>
                  <p className="immersive-sentence-card__translation">{wordbookSentenceZh}</p>
                  {wordbookSuccessMessage ? (
                    <p className="immersive-sentence-card__feedback">{wordbookSuccessMessage}</p>
                  ) : null}
                </>
              ) : (
                <>
                  <div className="immersive-sentence-card__text">{previousSentence?.text_en || ""}</div>
                  <p className="immersive-sentence-card__translation">{previousSentenceZh}</p>
                  {soeTargetSentence ? (
                    <div className="immersive-sentence-card__footer">
                      <AudioRecorder
                        compact
                        triggerRef={audioRecorderRef}
                        onRecordingComplete={async (audioBlob) => {
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
                            const resp = await apiClient(
                              "/api/soe/assess",
                              {
                                method: "POST",
                                body: (() => {
                                  const fd = new FormData();
                                  fd.append("audio_file", audioBlob, "recording.webm");
                                  fd.append("ref_text", sentence.text_en);
                                  fd.append("sentence_id", String(sentence.idx));
                                  if (currentLessonId) fd.append("lesson_id", currentLessonId);
                                  return fd;
                                })(),
                              },
                              accessToken,
                            );
                            const data = await parseResponse(resp);
                            if (!resp.ok || data?.ok === false) {
                              setSoeResult({ ok: false, message: formatSoeAssessErrorMessage(data, resp.status) });
                            } else {
                              setSoeResult(data);
                            }
                          } catch (err) {
                            const errMsg = err instanceof Error ? err.message : String(err);
                            const short = errMsg.length > 80 ? `${errMsg.slice(0, 80)}...` : errMsg;
                            toast.error(short || "评测失败，请稍后重试");
                          } finally {
                            setSoeLoading(false);
                          }
                        }}
                      />
                    </div>
                  ) : null}
                </>
              )}
            </section>
          ) : null}

          {nextSentence ? (
            <section className="immersive-sentence-card immersive-sentence-card--next" aria-label="下一句预览">
              <div className="immersive-sentence-card__meta">
                <span className="immersive-sentence-card__index">下一句 Preview</span>
              </div>
              <div className="immersive-sentence-card__text immersive-sentence-card__text--next">
                {textToUnderscores(nextSentence.text_en)}
              </div>
            </section>
          ) : null}

          <section className="immersive-typing__shortcut-card">
            <p className="immersive-typing__shortcut-title">快捷键</p>
            <p className="immersive-keyboard-hint text-xs text-muted-foreground">
              {getShortcutLabel(learningSettings.shortcuts.reveal_letter)} 字母 ·
              {" "}{getShortcutLabel(learningSettings.shortcuts.reveal_word)} 单词 ·
              {" "}{getShortcutLabel(learningSettings.shortcuts.previous_sentence)} 上一句 ·
              {" "}{getShortcutLabel(learningSettings.shortcuts.next_sentence)} 下一句 ·
              {" "}{getShortcutLabel(learningSettings.shortcuts.replay_sentence)} 重播 ·
              {" "}{getShortcutLabel(learningSettings.shortcuts.toggle_pause_playback)} 播放 ·
              {" "}{getShortcutLabel(learningSettings.shortcuts.record_score)} 评分
            </p>
          </section>
        </aside>
      </div>

      {phase === "lesson_completed" ? <p className="text-sm text-primary">课程已完成，恭喜你！</p> : null}

      <input
        ref={typingInputRef}
        className={hiddenInputClassName}
        value={currentWordInput}
        onChange={() => {}}
        onKeyDown={handleKeyDown}
        onBlur={(event) => {
          if (typingEnabled) {
            setTimeout(() => {
              const nextFocusTarget = event.relatedTarget ?? document.activeElement;
              if (shouldKeepControlFocus?.(nextFocusTarget)) return;
              focusTypingInput?.(isTouchDevice);
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
        <div className="immersive-typing__loading-badge">
          <Loader2 className="size-4 animate-spin" />
          评测中...
        </div>
      ) : null}
    </div>
  );
});

export default TypingPanel;
