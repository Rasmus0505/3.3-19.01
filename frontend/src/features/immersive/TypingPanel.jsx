import React, { forwardRef } from "react";
import { GraduationCap, Loader2, Plus, Volume2 } from "lucide-react";
import { toast } from "sonner";

import AudioRecorder from "../../shared/components/AudioRecorder";
import { Button } from "../../shared/ui";
import { cn } from "../../lib/utils";
import { computeDifficultyClassName } from "./DifficultyBadge";
import SelectableTokenText from "./SelectableTokenText";
import SOEResultCard from "./SOEResultCard";
import WordbookSelectionToolbar from "./WordbookSelectionToolbar";

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
  currentSentenceBandMap,
  difficultyAnalyzerRef,
  collinsLevel,
  lookupBandFromMap,
  sentenceTypingDone,
  currentSentence,
  currentSentenceSourceKey,
  wordbookSelectionSourceKey,
  wordbookSuccessSourceKey,
  wordbookSelectedTokenIndexes,
  wordbookSuccessAnimationIndexes,
  handleWordbookTokenPointerDown,
  handleWordbookTokenPointerEnter,
  canRenderInteractiveWordbook,
  autoDisplayIndices,
  onAddToAutoDisplay,
}) {
  const renderToken = (token, index) => {
    const status = wordStatuses[index] || "pending";
    const isAutoDisplayed = autoDisplayIndices?.has(index);
    // 句子已完成时，只保留 correct 状态的单词，隐藏其余（pending/active）
    if (sentenceTypingDone && status !== "correct") return null;
    const slots = buildLetterSlots(token, wordInputs[index] || "", wordRevealComparableIndices[index] || []);

    return (
      <div
        key={`${token}-${index}`}
        className={cn(
          `immersive-word-slot immersive-word-slot--${status} immersive-word-slot--underline`,
          isAutoDisplayed ? "immersive-word-slot--auto" : "",
          computeDifficultyClassName(
            lookupBandFromMap(currentSentenceBandMap, token, difficultyAnalyzerRef.current),
            collinsLevel,
          ),
          canRenderInteractiveWordbook ? "immersive-word-slot--selectable" : "",
          currentSentenceSourceKey === wordbookSelectionSourceKey && wordbookSelectedTokenIndexes?.includes(index)
            ? "immersive-word-slot--selected"
            : "",
          currentSentenceSourceKey === wordbookSuccessSourceKey && wordbookSuccessAnimationIndexes?.includes(index)
            ? "wordbook-token--success"
            : "",
        )}
        data-wordbook-token-index={index}
        role={canRenderInteractiveWordbook ? "button" : undefined}
        tabIndex={canRenderInteractiveWordbook ? 0 : undefined}
        onPointerDown={
          canRenderInteractiveWordbook
            ? (event) =>
                handleWordbookTokenPointerDown?.(event, {
                  sourceKey: currentSentenceSourceKey,
                  sentence: currentSentence,
                  tokens: expectedTokens,
                  tokenIndex: index,
                })
            : undefined
        }
        onPointerEnter={
          canRenderInteractiveWordbook
            ? (event) =>
                handleWordbookTokenPointerEnter?.(event, {
                  sourceKey: currentSentenceSourceKey,
                  sentence: currentSentence,
                  tokens: expectedTokens,
                  tokenIndex: index,
                })
            : undefined
        }
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
        {/* 非自动显示、非 wordbook 选择模式、句子未完成时显示添加按钮 */}
        {!isAutoDisplayed && !canRenderInteractiveWordbook && !sentenceTypingDone && onAddToAutoDisplay && (
          <button
            type="button"
            className="immersive-word-slot__add-btn"
            title="加入自动显示"
            onClick={(event) => {
              event.stopPropagation();
              onAddToAutoDisplay(token);
            }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <Plus className="size-3" />
          </button>
        )}
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

  return <div className="immersive-word-row immersive-word-row--multi-line-left">{expectedTokens.map(renderToken)}</div>;
}

const TypingPanel = forwardRef(function TypingPanel(
  {
    sentenceCount,
    currentSentenceIndex,
    isPlaying,
    isPlaybackPaused,
    expectedTokens,
    autoDisplayIndices,
    wordStatuses,
    wordInputs,
    wordRowLines,
    wordRowFrameRef,
    currentSentenceBandMap,
    difficultyAnalyzerRef,
    collinsLevel,
    buildLetterSlots,
    wordRevealComparableIndices,
    showPreviousSentenceBlock,
    canRenderInteractiveWordbook,
    wordbookSentence,
    wordbookSentenceTokens,
    wordbookReferenceSourceKey,
    currentSentenceSourceKey,
    wordbookSelectionSourceKey,
    wordbookSelectedTokenIndexes,
    wordbookSuccessAnimationIndexes,
    wordbookSuccessSourceKey,
    wordbookBusy,
    wordbookTranslationBusy,
    wordbookTranslationText,
    selectedWordbookText,
    handleWordbookTokenPointerDown,
    handleWordbookTokenPointerEnter,
    collectWordbookEntry,
    translateWordbookSelection,
    clearWordbookSelection,
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
    wordbookSentenceBandMap,
    translationZh,
    lookupBandFromMap,
    currentSentence,
    nextSentence,
    sentenceTypingDone,
    fullscreenStudyMode,
    fullscreenSentenceHeading,
    fullscreenSentenceEn,
    fullscreenSentenceZh,
    typingInputRef,
    currentWordInput,
    typingEnabled,
    handleKeyDown,
    focusTypingInput,
    isTouchDevice,
    shouldKeepControlFocus,
    onStartPostLesson,
    onAddToAutoDisplay,
    sessionControlsContent,
  },
  ref,
) {
  const hiddenInputClassName = isTouchDevice
    ? "immersive-hidden-input immersive-hidden-input--touch"
    : "immersive-hidden-input";
  const typingPanelClassName = cn(
    "immersive-typing immersive-typing--dock",
    fullscreenStudyMode ? "immersive-typing--fullscreen-dock" : "",
  );

  return (
    <div ref={ref} className={typingPanelClassName}>
      {mediaError ? <p className="immersive-typing__notice immersive-typing__notice--error">{mediaError}</p> : null}

      <div ref={wordRowFrameRef} className="immersive-word-row-frame">
        {renderWordSlots({
          expectedTokens,
          wordStatuses,
          wordInputs,
          wordRevealComparableIndices,
          wordRowLines,
          buildLetterSlots,
          currentSentenceBandMap,
          difficultyAnalyzerRef,
          collinsLevel,
          lookupBandFromMap,
          sentenceTypingDone,
          currentSentence,
          currentSentenceSourceKey,
          wordbookSelectionSourceKey,
          wordbookSuccessSourceKey,
          wordbookSelectedTokenIndexes,
          wordbookSuccessAnimationIndexes,
          handleWordbookTokenPointerDown,
          handleWordbookTokenPointerEnter,
          canRenderInteractiveWordbook,
          autoDisplayIndices,
          onAddToAutoDisplay,
        })}
      </div>

      <WordbookSelectionToolbar
        selectedText={selectedWordbookText}
        translationText={wordbookTranslationText}
        busy={wordbookBusy}
        translationBusy={wordbookTranslationBusy}
        onTranslate={() => translateWordbookSelection?.()}
        onCollect={() => collectWordbookEntry?.()}
        onClear={clearWordbookSelection}
      />

      {fullscreenStudyMode ? (
        <div className="immersive-typing__dock-row">
          <section className="immersive-typing__fullscreen-context" aria-label="全屏学习字幕参考">
            <div className="immersive-typing__fullscreen-context-head">
              <span className="immersive-typing__fullscreen-context-kicker">Subtitle reference</span>
              <span className="immersive-typing__fullscreen-context-badge">{fullscreenSentenceHeading || "上一句"}</span>
            </div>
            {canRenderInteractiveWordbook && wordbookReferenceSourceKey && Array.isArray(wordbookSentenceTokens) && wordbookSentenceTokens.length ? (
              <SelectableTokenText
                tokens={wordbookSentenceTokens}
                sentence={wordbookSentence}
                sourceKey={wordbookReferenceSourceKey}
                selectionSourceKey={wordbookSelectionSourceKey}
                selectedIndexes={wordbookSelectedTokenIndexes}
                successSourceKey={wordbookSuccessSourceKey}
                successIndexes={wordbookSuccessAnimationIndexes}
                disabled={wordbookBusy}
                className="immersive-typing__fullscreen-token-row"
                getTokenClassName={(token) =>
                  computeDifficultyClassName(
                    lookupBandFromMap(wordbookSentenceBandMap, token, difficultyAnalyzerRef.current),
                    collinsLevel,
                  )
                }
                onTokenPointerDown={handleWordbookTokenPointerDown}
                onTokenPointerEnter={handleWordbookTokenPointerEnter}
              />
            ) : (
              <p className="immersive-typing__fullscreen-context-en">
                {fullscreenSentenceEn || "(暂无英文字幕)"}
              </p>
            )}
            <p className="immersive-typing__fullscreen-context-zh">
              {fullscreenSentenceZh || "(暂无中文翻译)"}
            </p>
          </section>
          {sessionControlsContent ? (
            <div className="immersive-typing__dock-controls">
              {sessionControlsContent}
            </div>
          ) : null}
        </div>
      ) : null}

      {phase === "lesson_completed" ? (
        <div className="flex flex-col items-center gap-2 py-2">
          <p className="text-sm text-primary">课程已完成，恭喜你！</p>
          {onStartPostLesson && (
            <Button size="sm" className="gap-2" onClick={onStartPostLesson}>
              <GraduationCap className="w-4 h-4" />
              开始课后学习
            </Button>
          )}
        </div>
      ) : null}

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


