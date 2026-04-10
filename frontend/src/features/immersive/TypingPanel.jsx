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

      <section className="immersive-sentence-card immersive-sentence-card--current">
        <div className="immersive-sentence-card__header">
          <div className="immersive-sentence-card__meta">
            <span className="immersive-sentence-card__index">Current sentence</span>
          </div>
          <Badge variant={sentenceTypingDone ? "secondary" : "outline"}>
            {sentenceTypingDone ? "Completed" : "Typing"}
          </Badge>
        </div>
        <div className="immersive-sentence-card__lead">
          {sentenceTypingDone
            ? currentSentence?.text_en || "This sentence is complete."
            : "Listen carefully and type the full sentence here."}
        </div>
        <div className="immersive-sentence-card__dock-badges">
          <span className="immersive-sentence-card__dock-badge">Sentence-level dictation</span>
          <span className="immersive-sentence-card__dock-badge">Video-first learning</span>
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
        <p className="immersive-sentence-card__helper">
          {sentenceTypingDone
            ? "Good. Use the right-side support to review difficult expressions before moving on."
            : "The video stays primary. This dock is only for spelling the current sentence."}
        </p>
      </section>

      <section className="immersive-typing__shortcut-card">
        <p className="immersive-typing__shortcut-title">Shortcuts</p>
        <p className="immersive-keyboard-hint text-xs text-muted-foreground">
          {getShortcutLabel(learningSettings.shortcuts.reveal_letter)} letter ·
          {" "}{getShortcutLabel(learningSettings.shortcuts.reveal_word)} word ·
          {" "}{getShortcutLabel(learningSettings.shortcuts.previous_sentence)} previous ·
          {" "}{getShortcutLabel(learningSettings.shortcuts.next_sentence)} next ·
          {" "}{getShortcutLabel(learningSettings.shortcuts.replay_sentence)} replay ·
          {" "}{getShortcutLabel(learningSettings.shortcuts.toggle_pause_playback)} play
        </p>
      </section>

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
