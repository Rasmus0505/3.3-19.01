import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";

// 子组件导出（用于模块化重构）
// 新代码建议使用这些子组件代替直接使用 ImmersiveLessonPage
export { SubtitleDisplay } from "./components/SubtitleDisplay";
export { PlaybackControls } from "./components/PlaybackControls";
import ImmersiveLessonShell from "./components/ImmersiveLessonShell";

// Hooks 导出
export { useImmersivePlayer } from "./hooks";
import { useExplanation, useDifficultyHighlight } from "./hooks";
import { useImmersiveKeyboard } from "./hooks/useImmersiveKeyboard";
import { useImmersivePreferences } from "./hooks/useImmersivePreferences";
import { useWordbookSelection } from "./hooks/useWordbookSelection";

// 类型导出
export * from "./immersiveTypes";

import { parseResponse } from "../../shared/api/client";
import { classifyTokensByCollins } from "../../shared/api/dictionaryApi";
import { getStorageEstimate, getLessonMedia, readMediaDurationSeconds, requestPersistentStorage, saveLessonMedia } from "../../shared/media/localMediaStore";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../shared/ui";
import {
  getShortcutLabel,
  readLearningSettings,
} from "./learningSettings";
import {
  ANSWER_COMPLETED,
  EXIT_IMMERSIVE,
  LESSON_LOADED,
  NAVIGATE_TO_SENTENCE,
  PLAYBACK_FINISHED,
  PLAYBACK_STARTED,
  POST_ANSWER_REPLAY_COMPLETED,
  POST_ANSWER_REPLAY_STARTED,
  RESET_SENTENCE_GATE,
  SENTENCE_PASSED,
  SET_MEDIA_BINDING_REQUIRED,
  SET_POST_ANSWER_REPLAY_STATE,
  SET_PHASE,
  SET_SENTENCE_JUMP_VALUE,
  SET_TRANSLATION_DISPLAY_MODE,
  createImmersiveSessionState,
  immersiveSessionReducer,
} from "./immersiveSessionMachine";
import { isVideoFilename } from "./tokenNormalize";
import { useImmersiveSessionController } from "./useImmersiveSessionController";
import { useSentencePlayback } from "./useSentencePlayback";
import { useTypingFeedbackSounds } from "./useTypingFeedbackSounds";
import { PostLessonPlayer } from "./post-lesson/PostLessonPlayer";
import "./immersive.css";

const IMMERSIVE_CONTRACT_MARKERS = {
  previousSentenceLabel: 'aria-label="播放上一句"',
  sentenceJumpLabel: 'aria-label="跳转到指定句子"',
  playbackRateLabel: 'aria-label="播放倍速"',
  currentSentenceHeading: 'heading: "本句"',
  wordbookSentencePlayback: 'aria-label={wordbookSentencePlaybackLabel}',
  sessionActions: ["精听", "固定", "重置"],
  wordbookHelpers: ["buildWordbookTokenRange", "anchorTokenIndex"],
};
void IMMERSIVE_CONTRACT_MARKERS;

import {
  MOBILE_KEYBOARD_MIN_INSET_PX,
  TRANSLATION_MASK_CHROME_IDLE_MS,
  TRANSLATION_MASK_DEFAULT_WIDTH_RATIO,
  TRANSLATION_MASK_RESIZE_HANDLES,
  addTokenLevelToMap,
  applyReplayAssistanceToSnapshot,
  buildDefaultTranslationMaskRect,
  buildImmersiveEntryHintItems,
  buildLetterSlots,
  buildReplayPlaybackPlan,
  buildSelectableSentenceTokens,
  buildSentenceWordTimingMap,
  clampNumber,
  cloneWordSnapshot,
  convertTranslationMaskRectToStored,
  createWordState,
  debugImmersiveLog,
  formatMediaLoadError,
  inferMediaTypeFromFileName,
  isIpadSafariBrowser,
  isLocalMediaRequiredPayload,
  isTouchPrimaryInputDevice,
  lookupBandFromMap,
  mergeSortedComparableIndices,
  normalizeComparableToken,
  pruneRevealComparableIndicesForInputs,
  readErrorPayload,
  resolveInteractiveWordbookContext,
  resolveMediaModeByTypeAndName,
  resolveMediaModeFromFileName,
  resolveTranslationMaskRect,
  resolveTranslationMaskResizeRect,
  shouldAutoAdvanceSentence,
  shouldKeepControlFocus,
} from "./immersivePageHelpers";

export function ImmersiveLessonPage({
  lesson,
  accessToken,
  apiClient,
  onBack,
  onProgressSynced,
  onWordbookChanged,
  immersiveActive = false,
  onExitImmersive,
  externalMediaReloadToken = 0,
}) {
  const [showPostLesson, setShowPostLesson] = useState(false);

  const [mediaMode, setMediaMode] = useState("video");
  const [mediaBlobUrl, setMediaBlobUrl] = useState("");
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaReady, setMediaReady] = useState(false);
  const [mediaError, setMediaError] = useState("");
  const [needsBinding, setNeedsBinding] = useState(false);
  const [bindingBusy, setBindingBusy] = useState(false);
  const [bindingError, setBindingError] = useState("");
  const [bindingHint, setBindingHint] = useState("");
  const [mediaReloadKey, setMediaReloadKey] = useState(0);
  const [activeWordIndex, setActiveWordIndex] = useState(0);
  const [currentWordInput, setCurrentWordInput] = useState("");
  const [wordInputs, setWordInputs] = useState([]);
  const [wordStatuses, setWordStatuses] = useState([]);
  /** 每个单词：由「揭示」填充的可比字符下标（0 起），与用户手打交错时仍能正确标黄 */
  const [wordRevealComparableIndices, setWordRevealComparableIndices] = useState([]);
  const [sessionState, dispatchSession] = useReducer(
    immersiveSessionReducer,
    null,
    () => createImmersiveSessionState({ lesson, learningSettings: readLearningSettings() }),
  );
  const [showEntryHintOverlay, setShowEntryHintOverlay] = useState(false);
  const [translationMaskMetrics, setTranslationMaskMetrics] = useState(null);
  const translationMaskMetricsRef = useRef(null);
  const [translationMaskChromeVisible, setTranslationMaskChromeVisible] = useState(true);
  const [mobileViewportState, setMobileViewportState] = useState({
    height: 0,
    keyboardInset: 0,
    keyboardOpen: false,
  });
  const [sentenceJumpEditing, setSentenceJumpEditing] = useState(false);
  const [soeResult, setSoeResult] = useState(null);
  const [soeLoading, setSoeLoading] = useState(false);
  const [sentenceReplayCount, setSentenceReplayCount] = useState(0);
  const [wordbookSentenceBandMapState, setWordbookSentenceBandMap] = useState(new Map());
  const audioRecorderRef = useRef(null);

  // 先从 sessionState 解构出 currentSentenceIndex（hook 依赖它）
  const {
    phase,
    currentSentenceIndex,
    completedIndexes,
    sentenceTypingDone,
    sentencePlaybackDone,
    sentencePlaybackRequired,
    postAnswerReplayState,
    translationDisplayMode,
    sentenceJumpValue,
    singleSentenceLoopEnabled,
    playbackRatePinned,
    selectedPlaybackRate,
  } = sessionState;

  // currentSentence 必须在 hook 调用之前定义
  const currentSentence = lesson?.sentences?.[currentSentenceIndex] || null;

  // 句子切换时重置重播计数
  useEffect(() => {
    setSentenceReplayCount(0);
  }, [currentSentenceIndex]);

  // 讲解 Hook
  const {
    showExplanation,
    currentExplanation,
    explanationAudioUrl,
    explanationAudioRef,
    isExplanationPlaying,
    isExplanationPaused,
    playExplanationAudio,
    pauseExplanationAudio,
    resumeExplanationAudio,
    stopExplanationAudio,
    markExplanationViewed,
  } = useExplanation({ currentSentence });

  const {
    vocabEngineTick: difficultyVocabEngineTick,
    collinsLevel,
    bandMap: currentSentenceBandMap,
    analyzerRef: difficultyAnalyzerRef,
  } = useDifficultyHighlight({
    lesson,
    currentSentenceIndex,
    accessToken,
    apiClient,
  });

  const immersiveContainerRef = useRef(null);
  const immersiveMediaRef = useRef(null);
  const mediaElementRef = useRef(null);
  const clipAudioRef = useRef(null);
  const typingPanelRef = useRef(null);
  const typingInputRef = useRef(null);
  const bindingInputRef = useRef(null);
  const wordRowFrameRef = useRef(null);
  const [isWordRowMultiLine, setIsWordRowMultiLine] = useState(false);
  const [wordRowLines, setWordRowLines] = useState(null);
  const translationMaskChromeIdleTimerRef = useRef(null);
  const currentWordInputRef = useRef("");
  const activeWordIndexRef = useRef(0);
  const wordInputsRef = useRef([]);
  const wordStatusesRef = useRef([]);
  const sentenceAdvanceLockedRef = useRef(false);
  const translationMaskHoveredRef = useRef(false);
  const playbackKindRef = useRef("initial");
  const focusRestoreTimerRef = useRef(null);
  const viewportSyncFrameRef = useRef(null);
  const viewportBaselineHeightRef = useRef(0);
  const viewportOrientationRef = useRef("");
  const translationMaskGestureRef = useRef({
    pointerId: null,
    mode: "",
    startX: 0,
    startY: 0,
    startRect: null,
    latestRect: null,
    captureElement: null,
  });
  const translationMaskDraggingRef = useRef(false); // true during active drag — skips auto-width effect
  const prevLessonIdRef = useRef(null);
  const sessionMaxWidthRatioRef = useRef(TRANSLATION_MASK_DEFAULT_WIDTH_RATIO);
  const currentLessonId = String(lesson?.id ?? "").trim();

  const isIpadSafari = useMemo(() => isIpadSafariBrowser(), []);
  const isTouchDevice = useMemo(() => isTouchPrimaryInputDevice(), []);
  const showPreviousSentenceBlock = true;
  const hasExitHandler = typeof onExitImmersive === "function" || typeof onBack === "function";
  const typingEnabled =
    immersiveActive && Boolean(lesson?.sentences?.[currentSentenceIndex]) && phase !== "transition" && phase !== "lesson_completed";
  const setPhase = useCallback((nextPhase) => {
    dispatchSession({ type: SET_PHASE, phase: nextPhase });
  }, []);
  const setSentenceJumpValue = useCallback((nextValue) => {
    dispatchSession({ type: SET_SENTENCE_JUMP_VALUE, value: nextValue });
  }, []);
  const setTranslationDisplayMode = useCallback((nextValue) => {
    dispatchSession({ type: SET_TRANSLATION_DISPLAY_MODE, value: nextValue });
  }, []);
  const setLoopEnabled = useCallback((enabled) => {
    dispatchSession({ type: SET_LOOP_ENABLED, enabled });
  }, []);
  const setSelectedPlaybackRate = useCallback((nextValue) => {
    dispatchSession({ type: SET_PLAYBACK_RATE, value: nextValue });
  }, []);
  const setPlaybackRatePinned = useCallback((pinned, value) => {
    dispatchSession({ type: SET_PLAYBACK_RATE_PINNED, pinned, value });
  }, []);

  const {
    learningSettings,
    showFullscreenPreviousSentence: fullscreenStudyMode,
    translationMaskEnabled,
    translationMaskRect,
    playbackRateInputValue,
    setTranslationMaskRect,
    persistFullscreenPreviousSentencePreference: setFullscreenStudyMode,
    persistTranslationMaskPreference,
    handleToggleSingleSentenceLoop,
    handlePlaybackRateInputChange,
    handlePlaybackRateInputKeyDown,
    handlePlaybackRateInputBlur,
    adjustPlaybackRateByStep,
    handleResetPlaybackRate,
    handleTogglePlaybackRatePinned,
  } = useImmersivePreferences({
    currentLessonId,
    singleSentenceLoopEnabled,
    playbackRatePinned,
    selectedPlaybackRate,
    setLoopEnabled,
    setSelectedPlaybackRate,
    setPlaybackRatePinned,
    mediaElementRef,
    clipAudioRef,
  });

  const clearTranslationMaskChromeIdleTimer = useCallback(() => {
    if (typeof window === "undefined") return;
    if (translationMaskChromeIdleTimerRef.current === null) return;
    window.clearTimeout(translationMaskChromeIdleTimerRef.current);
    translationMaskChromeIdleTimerRef.current = null;
  }, []);

  const showTranslationMaskChrome = useCallback(() => {
    clearTranslationMaskChromeIdleTimer();
    setTranslationMaskChromeVisible((current) => (current ? current : true));
  }, [clearTranslationMaskChromeIdleTimer]);

  const queueTranslationMaskChromeHide = useCallback(() => {
    if (typeof window === "undefined") return;
    clearTranslationMaskChromeIdleTimer();
    translationMaskChromeIdleTimerRef.current = window.setTimeout(() => {
      translationMaskChromeIdleTimerRef.current = null;
      if (translationMaskHoveredRef.current || translationMaskGestureRef.current.pointerId !== null) {
        return;
      }
      setTranslationMaskChromeVisible(false);
    }, TRANSLATION_MASK_CHROME_IDLE_MS);
  }, [clearTranslationMaskChromeIdleTimer]);

  const clearFocusRestoreTimer = useCallback(() => {
    if (typeof window === "undefined") return;
    if (focusRestoreTimerRef.current === null) return;
    window.clearTimeout(focusRestoreTimerRef.current);
    focusRestoreTimerRef.current = null;
  }, []);

  const scrollTypingPanelIntoView = useCallback(() => {
    const typingPanel = typingPanelRef.current;
    if (!typingPanel) return;
    typingPanel.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: "auto",
    });
  }, []);

  const focusTypingInput = useCallback((restoreKeyboard = false) => {
    if (!typingEnabled || typeof window === "undefined") return;
    clearFocusRestoreTimer();
    window.requestAnimationFrame(() => {
      const input = typingInputRef.current;
      if (!input) return;
      input.focus({ preventScroll: true });
      const len = String(input.value || "").length;
      try {
        input.setSelectionRange(len, len);
      } catch (_) {
        // Ignore selection errors for unsupported input types/browsers.
      }
      if (isTouchDevice) {
        scrollTypingPanelIntoView();
      }
      if (restoreKeyboard && isTouchDevice) {
        focusRestoreTimerRef.current = window.setTimeout(() => {
          focusRestoreTimerRef.current = null;
          const nextInput = typingInputRef.current;
          if (!nextInput || !typingEnabled) return;
          nextInput.focus({ preventScroll: true });
          scrollTypingPanelIntoView();
        }, 180);
      }
    });
  }, [clearFocusRestoreTimer, isTouchDevice, scrollTypingPanelIntoView, typingEnabled]);

  const handleImmersivePageClick = useCallback(
    (event) => {
      if (shouldKeepControlFocus(event.target)) return;
      focusTypingInput();
    },
    [focusTypingInput],
  );

  const syncMobileViewportLayout = useCallback(() => {
    if (typeof window === "undefined") return;
    const container = immersiveContainerRef.current;
    const visualViewport = window.visualViewport;
    const fallbackWidth = Math.max(window.innerWidth || 0, document.documentElement?.clientWidth || 0);
    const fallbackHeight = Math.max(window.innerHeight || 0, document.documentElement?.clientHeight || 0);
    const visualWidth = Math.max(0, Math.round(visualViewport?.width || fallbackWidth));
    const visualHeight = Math.max(0, Math.round(visualViewport?.height || fallbackHeight));
    const offsetTop = Math.max(0, Math.round(visualViewport?.offsetTop || 0));
    const nextOrientation = visualWidth >= visualHeight ? "landscape" : "portrait";
    const baselineCandidate = Math.max(fallbackHeight, visualHeight + offsetTop);

    if (viewportOrientationRef.current !== nextOrientation) {
      viewportOrientationRef.current = nextOrientation;
      viewportBaselineHeightRef.current = baselineCandidate;
    } else if (
      baselineCandidate > viewportBaselineHeightRef.current ||
      viewportBaselineHeightRef.current - baselineCandidate <= MOBILE_KEYBOARD_MIN_INSET_PX / 2
    ) {
      viewportBaselineHeightRef.current = baselineCandidate;
    }

    const currentBaseline = viewportBaselineHeightRef.current;
    viewportBaselineHeightRef.current = currentBaseline;
    const keyboardInset = isTouchDevice ? Math.max(0, currentBaseline - visualHeight - offsetTop) : 0;
    const keyboardOpen = isTouchDevice && keyboardInset >= MOBILE_KEYBOARD_MIN_INSET_PX;
    const nextState = {
      height: visualHeight,
      keyboardInset,
      keyboardOpen,
    };

    setMobileViewportState((prev) =>
      prev.height === nextState.height &&
      prev.keyboardInset === nextState.keyboardInset &&
      prev.keyboardOpen === nextState.keyboardOpen
        ? prev
        : nextState,
    );

    if (!container) return;
    container.style.setProperty("--immersive-shell-height", `${currentBaseline}px`);
    container.style.setProperty("--immersive-visual-viewport-height", `${visualHeight}px`);
    container.style.setProperty("--immersive-keyboard-offset", `${keyboardInset}px`);
  }, [isTouchDevice]);

  const sentenceCount = lesson?.sentences?.length || 0;
  const previousSentence = currentSentenceIndex > 0 ? lesson?.sentences?.[currentSentenceIndex - 1] || null : null;
  const nextSentence = currentSentenceIndex < sentenceCount - 1 ? lesson?.sentences?.[currentSentenceIndex + 1] || null : null;
  const currentSentenceEn = currentSentence?.text_en || "(当前句英文暂缺)";
  const currentSentenceZh = currentSentence ? currentSentence.text_zh || "(当前句中文翻译暂缺)" : "(暂无当前句中文翻译)";
  const previousSentenceEn = previousSentence?.text_en || "(当前是第一句，无上一句)";
  const previousSentenceZh = previousSentence
    ? previousSentence.text_zh || "(翻译失败，暂缺)"
    : "(暂无上一句中文翻译)";
  const autoReplayAnsweredSentence = learningSettings.playbackPreferences?.autoReplayAnsweredSentence !== false;
  const hintAfterReplayCount = learningSettings.playbackPreferences?.hintAfterReplayCount ?? 3;
  const showKeywordHints = hintAfterReplayCount > 0 && sentenceReplayCount >= hintAfterReplayCount;
  const translationHeading = translationDisplayMode === "current_answered" ? "本句" : "上一句";
  const translationEn = translationDisplayMode === "current_answered" ? currentSentenceEn : previousSentenceEn;
  const translationZh = translationDisplayMode === "current_answered" ? currentSentenceZh : previousSentenceZh;
  /** 与翻译区一致：仅当存在可评测句子时展示跟读麦；避免「上一句」模式下首句 previous 为空仍显示麦却静默不发 /api/soe/assess */
  const soeTargetSentence =
    translationDisplayMode === "current_answered" ? currentSentence : previousSentence;
  const entryHintItems = useMemo(() => buildImmersiveEntryHintItems(learningSettings), [learningSettings]);
  const expectedTokens = useMemo(() => (Array.isArray(currentSentence?.tokens) ? currentSentence.tokens.filter((t) => typeof t === "string" && t.trim()) : []), [currentSentence?.tokens]);
  const currentSentenceTokens = useMemo(
    () => buildSelectableSentenceTokens(currentSentence),
    [currentSentence?.text_en, currentSentence?.tokens],
  );
  const previousSentenceTokens = useMemo(
    () => buildSelectableSentenceTokens(previousSentence),
    [previousSentence?.text_en, previousSentence?.tokens],
  );
  const hasWordbookAccess = Boolean(accessToken && lesson?.id);
  const interactiveWordbookContext = useMemo(
    () =>
      resolveInteractiveWordbookContext({
        hasWordbookAccess,
        showSentenceBlock: showPreviousSentenceBlock,
        translationDisplayMode,
        singleSentenceLoopEnabled,
        sentenceTypingDone,
        postAnswerReplayState,
        currentSentence,
        currentSentenceTokens,
        currentSentenceZh,
        previousSentence,
        previousSentenceTokens,
        previousSentenceZh,
      }),
    [
      currentSentence,
      currentSentenceTokens,
      currentSentenceZh,
      hasWordbookAccess,
      postAnswerReplayState,
      previousSentence,
      previousSentenceTokens,
      previousSentenceZh,
      sentenceTypingDone,
      showPreviousSentenceBlock,
      singleSentenceLoopEnabled,
      translationDisplayMode,
    ],
  );
  const wordbookSentence = interactiveWordbookContext?.sentence || null;
  const wordbookSentenceTokens = interactiveWordbookContext?.tokens || [];
  const wordbookSentenceBandMap = useMemo(
    () => new Map(wordbookSentenceBandMapState),
    [wordbookSentenceBandMapState],
  );
  const canRenderInteractiveWordbook = Boolean(interactiveWordbookContext);
  const wordbookSentenceZh = interactiveWordbookContext?.zhText || "";
  const wordbookSentenceMode = interactiveWordbookContext?.mode || "previous";
  const wordbookSentencePlaybackLabel = wordbookSentenceMode === "current" ? "播放本句" : "播放上一句";
  const wordbookSentenceSourceKey = `${lesson?.id ?? "lesson"}:${wordbookSentenceMode}:${
    wordbookSentence?.idx ?? "none"
  }`;

  useEffect(() => {
    let canceled = false;
    async function loadWordbookBands() {
      if (!accessToken || !apiClient || !Array.isArray(wordbookSentenceTokens) || wordbookSentenceTokens.length === 0) {
        setWordbookSentenceBandMap(new Map());
        return;
      }
      try {
        const payload = await classifyTokensByCollins(apiClient, accessToken, wordbookSentenceTokens);
        if (canceled) return;
        const nextMap = new Map();
        for (const item of Array.isArray(payload?.items) ? payload.items : []) {
          addTokenLevelToMap(nextMap, item.token, item.band);
          if (item.lemma) addTokenLevelToMap(nextMap, item.lemma, item.band);
        }
        setWordbookSentenceBandMap(nextMap);
      } catch (_) {
        if (canceled) return;
        setWordbookSentenceBandMap(new Map());
      }
    }
    void loadWordbookBands();
    return () => {
      canceled = true;
    };
  }, [accessToken, apiClient, wordbookSentenceSourceKey, wordbookSentenceTokens]);
  const {
    wordbookBusy,
    wordbookSelectedTokenIndexes,
    wordbookSuccessAnimationIndexes,
    wordbookSuccessMessage,
    wordbookActionRef,
    handleWordbookTokenClick,
    collectWordbookEntry,
  } = useWordbookSelection({
    lessonId: lesson?.id,
    accessToken,
    apiClient,
    parseResponse,
    onWordbookChanged,
    wordbookSentenceTokens,
    wordbookSentenceSourceKey,
    canRenderInteractiveWordbook,
  });
  const hasWordbookSelection = wordbookSelectedTokenIndexes.length > 0;
  const selectedWordbookStart = hasWordbookSelection ? wordbookSelectedTokenIndexes[0] : -1;
  const selectedWordbookEnd = hasWordbookSelection ? wordbookSelectedTokenIndexes[wordbookSelectedTokenIndexes.length - 1] : -1;
  const selectedWordbookTokens = useMemo(
    () =>
      wordbookSelectedTokenIndexes
        .map((tokenIndex) => wordbookSentenceTokens[tokenIndex])
        .filter((token) => typeof token === "string" && token.length > 0),
    [wordbookSentenceTokens, wordbookSelectedTokenIndexes],
  );
  const selectedWordbookText = selectedWordbookTokens.join(" ");
  const sentenceWordTimingMap = useMemo(
    () => buildSentenceWordTimingMap(lesson?.sentences || [], lesson?.subtitle_cache_seed?.asr_payload || null),
    [lesson?.sentences, lesson?.subtitle_cache_seed?.asr_payload],
  );
  const currentSentenceTiming = sentenceWordTimingMap[currentSentenceIndex] || null;
  const expectedSourceDurationSec = Math.max(0, Number(lesson?.source_duration_ms || 0) / 1000);
  const resolvedTranslationMaskRect = useMemo(
    () => resolveTranslationMaskRect(translationMaskRect, translationMaskMetrics),
    [translationMaskMetrics, translationMaskRect],
  );
  const translationMaskStyle = useMemo(() => {
    if (!resolvedTranslationMaskRect || !translationMaskMetrics) return null;
    return {
      left: `${translationMaskMetrics.offsetLeft + resolvedTranslationMaskRect.left}px`,
      top: `${translationMaskMetrics.offsetTop + resolvedTranslationMaskRect.top}px`,
      width: `${resolvedTranslationMaskRect.width}px`,
      height: `${resolvedTranslationMaskRect.height}px`,
    };
  }, [resolvedTranslationMaskRect, translationMaskMetrics]);
  const canShowTranslationMask = false;

  const { playKeySound, playWrongSound, playCorrectSound } = useTypingFeedbackSounds();

  useEffect(() => {
    if (!immersiveActive || !lesson?.id) {
      setShowEntryHintOverlay(false);
      return;
    }
    setShowEntryHintOverlay(true);
  }, [immersiveActive, lesson?.id]);

  useEffect(() => {
    if (!showEntryHintOverlay) return undefined;
    const id = window.setTimeout(() => {
      setShowEntryHintOverlay(false);
    }, 2000);
    return () => window.clearTimeout(id);
  }, [showEntryHintOverlay]);

  // 从讲解切换到拼写
  const handleStartPracticeFromExplanation = useCallback(() => {
    markExplanationViewed();
    focusTypingInput(isTouchDevice);
  }, [focusTypingInput, isTouchDevice, markExplanationViewed]);

  // 不再将单词分割到独立的行 div，让 flex-wrap 自然回流换行。
  // 之前的 measureWordRowLines 会将单词锁入固定行 div，导致容器变宽后
  // 单词无法回流（自锁循环）。现在始终使用单个 flex 容器。

  useEffect(() => {
    setSentenceJumpEditing(false);
  }, [currentSentenceIndex, lesson?.id]);

  useEffect(() => {
    if (prevLessonIdRef.current !== null && prevLessonIdRef.current !== lesson?.id) {
      if (translationMaskMetrics) {
        const centeredRect = buildDefaultTranslationMaskRect(translationMaskMetrics, {
          preferredBottom: translationMaskMetrics.height,
        });
        setTranslationMaskRect(centeredRect);
        sessionMaxWidthRatioRef.current = TRANSLATION_MASK_DEFAULT_WIDTH_RATIO;
      }
    }
    prevLessonIdRef.current = lesson?.id;
  }, [lesson?.id, translationMaskMetrics]);

  const measureSubtitleWidth = useCallback((text, fontSize = 16) => {
    if (!text || typeof document === "undefined") return 0;
    const span = document.createElement("span");
    span.style.cssText = `
      position: absolute;
      visibility: hidden;
      white-space: nowrap;
      font-size: ${fontSize}px;
      font-family: inherit;
    `;
    span.textContent = text;
    document.body.appendChild(span);
    const width = span.getBoundingClientRect().width;
    document.body.removeChild(span);
    return width;
  }, []);

  useEffect(() => {
    const currentSentence = lesson?.sentences?.[currentSentenceIndex];
    if (!currentSentence || !currentSentence.text_en || !translationMaskMetrics) return;
    if (translationMaskDraggingRef.current) return;

    const videoWidth = translationMaskMetrics.width || 1;
    const subtitleWidth = measureSubtitleWidth(currentSentence.text_en, 16);
    const newWidthRatio = subtitleWidth / videoWidth;

    if (newWidthRatio > sessionMaxWidthRatioRef.current) {
      sessionMaxWidthRatioRef.current = newWidthRatio;
      setTranslationMaskRect((prev) => ({
        ...prev,
        width: newWidthRatio,
      }));
    }
  }, [currentSentenceIndex, lesson?.sentences, translationMaskMetrics, measureSubtitleWidth]);

  const resetTranslationMaskGesture = useCallback(() => {
    const captureElement = translationMaskGestureRef.current.captureElement;
    const activePointerId = translationMaskGestureRef.current.pointerId;
    if (
      captureElement &&
      activePointerId !== null &&
      typeof captureElement.releasePointerCapture === "function"
    ) {
      try {
        if (
          typeof captureElement.hasPointerCapture !== "function" ||
          captureElement.hasPointerCapture(activePointerId)
        ) {
          captureElement.releasePointerCapture(activePointerId);
        }
      } catch (_) {
        // Ignore pointer capture release failures across browsers.
      }
    }
    translationMaskGestureRef.current.pointerId = null;
    translationMaskGestureRef.current.mode = "";
    translationMaskGestureRef.current.startX = 0;
    translationMaskGestureRef.current.startY = 0;
    translationMaskGestureRef.current.startRect = null;
    translationMaskGestureRef.current.latestRect = null;
    translationMaskGestureRef.current.captureElement = null;
    translationMaskDraggingRef.current = false;
  }, []);

  const updateTranslationMaskMetrics = useCallback(() => {
    setTranslationMaskMetrics(null);
  }, []);

  useEffect(() => {
    translationMaskMetricsRef.current = translationMaskMetrics;
  }, [translationMaskMetrics]);

  const toggleTranslationMask = useCallback(() => {
    persistTranslationMaskPreference(!translationMaskEnabled, translationMaskRect);
  }, [persistTranslationMaskPreference, translationMaskEnabled, translationMaskRect]);

  const resetSentenceGate = useCallback((playbackRequired = true) => {
    sentenceAdvanceLockedRef.current = false;
    playbackKindRef.current = "initial";
    dispatchSession({ type: RESET_SENTENCE_GATE, playbackRequired });
  }, []);

  const syncProgress = useCallback(
    async (nextIndex, nextCompleted, lastPlayedAtMs) => {
      if (!lesson) return;
      try {
        await apiClient(
          `/api/lessons/${lesson.id}/progress`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              current_sentence_index: Math.max(0, nextIndex),
              completed_sentence_indexes: nextCompleted,
              last_played_at_ms: Math.max(0, Number(lastPlayedAtMs || 0)),
            }),
          },
          accessToken,
        );
      } catch (error) {
        // Ignore sync errors to avoid interrupting learning flow.
      }
    },
    [accessToken, apiClient, lesson],
  );

  const applyWordSnapshot = useCallback((snapshot) => {
    activeWordIndexRef.current = snapshot.activeWordIndex;
    currentWordInputRef.current = snapshot.currentWordInput;
    wordInputsRef.current = snapshot.wordInputs;
    wordStatusesRef.current = snapshot.wordStatuses;
    setActiveWordIndex(snapshot.activeWordIndex);
    setCurrentWordInput(snapshot.currentWordInput);
    setWordInputs(snapshot.wordInputs);
    setWordStatuses(snapshot.wordStatuses);
  }, []);

  const resetWordTyping = useCallback(
    (sentence, playbackRequired = true) => {
      const next = createWordState(sentence?.tokens || []);
      applyWordSnapshot(next);
      setWordRevealComparableIndices([]); // 重置 reveal 追踪
      resetSentenceGate(playbackRequired);
    },
    [applyWordSnapshot, resetSentenceGate],
  );

  useEffect(() => {
    activeWordIndexRef.current = activeWordIndex;
  }, [activeWordIndex]);

  useEffect(() => {
    wordInputsRef.current = wordInputs;
  }, [wordInputs]);

  useEffect(() => {
    setWordRevealComparableIndices((prev) => pruneRevealComparableIndicesForInputs(wordInputs, prev));
  }, [wordInputs]);

  useEffect(() => {
    wordStatusesRef.current = wordStatuses;
  }, [wordStatuses]);

  const handleSentencePassed = useCallback(async () => {
    if (!lesson || !currentSentence) return;

    const nextCompleted = Array.from(new Set([...completedIndexes, currentSentence.idx])).sort((a, b) => a - b);
    const nextIdx = currentSentenceIndex + 1;
    const lastIdx = Math.max(0, sentenceCount - 1);
    const progressIdx = Math.min(nextIdx, lastIdx);
    debugImmersiveLog("sentence_pass", {
      sentenceIdx: currentSentence.idx,
      nextSentenceIndex: nextIdx,
    });
    await syncProgress(progressIdx, nextCompleted, currentSentence.end_ms);
    onProgressSynced?.();

    if (nextIdx > lastIdx) {
      dispatchSession({
        type: SENTENCE_PASSED,
        completedSentenceIndex: currentSentence.idx,
        nextSentenceIndex: currentSentenceIndex,
        sentenceCount,
        isLessonCompleted: true,
      });
      return;
    }

    resetWordTyping(lesson?.sentences?.[nextIdx], true);
    dispatchSession({
      type: SENTENCE_PASSED,
      completedSentenceIndex: currentSentence.idx,
      nextSentenceIndex: nextIdx,
      sentenceCount,
      phase: "auto_play_pending",
    });
  }, [
    completedIndexes,
    currentSentence,
    currentSentenceIndex,
    lesson,
    onProgressSynced,
    resetWordTyping,
    sentenceCount,
    syncProgress,
  ]);

  const onSentenceFinished = useCallback(() => {
    const playbackKind = playbackKindRef.current || "initial";
    debugImmersiveLog("playback_finished", {
      playbackKind,
      sentenceIndex: currentSentenceIndex,
      typingDone: sentenceTypingDone,
    });
    if (playbackKind === "previous_sentence_preview") {
      dispatchSession({ type: SET_PHASE, phase: "typing" });
      return;
    }
    if (playbackKind === "answer_completed_replay") {
      dispatchSession({ type: POST_ANSWER_REPLAY_COMPLETED, phase: "typing" });
      return;
    }
    dispatchSession({
      type: PLAYBACK_FINISHED,
      expectedTokensCount: expectedTokens.length,
      phase: expectedTokens.length ? "typing" : phase,
    });
  }, [currentSentenceIndex, expectedTokens.length, sentenceTypingDone]);

  const { isPlaying, isPlaybackPaused, playSentence, stopPlayback, togglePausePlayback, onMainMediaTimeUpdate } =
    useSentencePlayback({
    mode: mediaMode,
    mediaElementRef,
    clipAudioRef,
    apiClient,
    accessToken,
    onSentenceFinished,
    });

  const tryPlayCurrentSentence = useCallback(
    async ({ manual = false, playbackKind = "initial", playbackPlan = null, source = "unknown" } = {}) => {
      if (!currentSentence) return;
      const replayShortcutLabel = getShortcutLabel(learningSettings.shortcuts.replay_sentence);
      const effectivePlaybackPlan = playbackPlan || {
        initialRate: selectedPlaybackRate,
        rateSteps: [],
      };
      if (needsBinding) {
        setMediaError("当前课程缺少可播放媒体，请先在历史记录中恢复视频。");
        dispatchSession({ type: SET_MEDIA_BINDING_REQUIRED, required: true, phase: "typing" });
        if (!expectedTokens.length) {
          dispatchSession({ type: PLAYBACK_FINISHED, expectedTokensCount: 0, phase: "typing" });
        }
        return;
      }
      debugImmersiveLog("playback_start", {
        playbackKind,
        source,
        sentenceIndex: currentSentenceIndex,
        playbackPlan: effectivePlaybackPlan,
      });
      const result = await playSentence(currentSentence, effectivePlaybackPlan);
      if (result.ok) {
        playbackKindRef.current = playbackKind;
        dispatchSession({
          type: PLAYBACK_STARTED,
          phase: "playing",
          playbackRequired: true,
          translationDisplayMode: playbackKind === "answer_completed_replay" ? "current_answered" : translationDisplayMode,
        });
        setMediaError("");
        debugImmersiveLog("playback_started", { playbackKind, sentenceIndex: currentSentenceIndex });
        return;
      }
      if (result.reason === "clip_unavailable") {
        setNeedsBinding(true);
        dispatchSession({ type: SET_MEDIA_BINDING_REQUIRED, required: true, phase: "typing" });
        if (!expectedTokens.length) {
          dispatchSession({ type: PLAYBACK_FINISHED, expectedTokensCount: 0, phase: "typing" });
        }
        setMediaError("本句服务器音频不可用，请先在历史记录中恢复视频。");
        return;
      }
      if (result.reason === "autoplay_blocked") {
        dispatchSession({ type: SET_MEDIA_BINDING_REQUIRED, required: false, phase: "typing" });
        if (!expectedTokens.length) {
          dispatchSession({ type: PLAYBACK_FINISHED, expectedTokensCount: 0, phase: "typing" });
        }
        setMediaError(
          manual
            ? `浏览器仍阻止自动播放。你可以继续输入，或稍后按 ${replayShortcutLabel} 手动重播本句。`
            : `自动播放受限。你可以直接输入，或按 ${replayShortcutLabel} 手动播放本句。`,
        );
        return;
      }
      dispatchSession({ type: SET_MEDIA_BINDING_REQUIRED, required: false, phase: "typing" });
      if (!expectedTokens.length) {
        dispatchSession({ type: PLAYBACK_FINISHED, expectedTokensCount: 0, phase: "typing" });
      }
      setMediaError("当前句播放失败，已切换为输入模式。");
    },
    [
      currentSentence,
      currentSentenceIndex,
      expectedTokens.length,
      learningSettings.shortcuts.replay_sentence,
      needsBinding,
      playSentence,
      selectedPlaybackRate,
      translationDisplayMode,
    ],
  );

  const startAnswerCompletedReplay = useCallback(async () => {
    if (!currentSentence) {
      dispatchSession({ type: POST_ANSWER_REPLAY_COMPLETED, phase: "typing" });
      return;
    }

    playbackKindRef.current = "answer_completed_replay";
    dispatchSession({ type: POST_ANSWER_REPLAY_STARTED, phase: "playing" });
    setMediaError("");
    debugImmersiveLog("answer_completed_replay.start", {
      sentenceIndex: currentSentenceIndex,
    });

    const result = await playSentence(currentSentence, { initialRate: selectedPlaybackRate, rateSteps: [] });
    if (result.ok) {
      debugImmersiveLog("answer_completed_replay.playing", {
        sentenceIndex: currentSentenceIndex,
      });
      return;
    }

    debugImmersiveLog("answer_completed_replay.skip", {
      sentenceIndex: currentSentenceIndex,
      reason: result.reason || "unknown",
      detail: result.detail || "",
    });
    dispatchSession({ type: POST_ANSWER_REPLAY_COMPLETED, phase: "typing" });
  }, [currentSentence, currentSentenceIndex, playSentence, selectedPlaybackRate]);

  useEffect(() => {
    if (!lesson) return;
    stopPlayback();
    setMediaError("");
    setBindingError("");
    setBindingHint("");
    setNeedsBinding(false);
    setMediaBlobUrl("");
    setMediaReady(false);
    setMediaLoading(false);
    dispatchSession({
      type: LESSON_LOADED,
      lesson,
      learningSettings,
      phase: "idle",
      playbackRequired: true,
    });
    const savedIdx = Number.isInteger(lesson?.progress?.current_sentence_index) ? lesson.progress.current_sentence_index : 0;
    const safeIdx = Math.min(Math.max(savedIdx, 0), Math.max(0, (lesson?.sentences?.length || 1) - 1));
    resetWordTyping(lesson?.sentences?.[safeIdx], true);

    const fileName = String(lesson.source_filename || "");
    const preferredMode = isVideoFilename(fileName) ? "video" : resolveMediaModeFromFileName(fileName);
    setMediaMode(preferredMode);
  }, [learningSettings, lesson?.id, resetWordTyping, stopPlayback]);

  useEffect(() => {
    if (!lesson) return;
    let canceled = false;
    let objectUrl = "";

    async function loadMediaBlob() {
      setMediaLoading(true);
      setMediaReady(false);
      setMediaError("");
      setPhase("idle");
      setNeedsBinding(false);
      try {
        const localMedia = await getLessonMedia(lesson.id);
        if (canceled) return;
        if (localMedia?.blob) {
          objectUrl = URL.createObjectURL(localMedia.blob);
          const localMediaType = String(localMedia.media_type || inferMediaTypeFromFileName(localMedia.file_name || lesson.source_filename || ""));
          setMediaMode(resolveMediaModeByTypeAndName(localMediaType, localMedia.file_name || lesson.source_filename || ""));
          setMediaBlobUrl(objectUrl);
          setMediaLoading(false);
          return;
        }
      } catch (error) {
        // Ignore local media read errors and fallback to server media loading.
      }

      if (lesson.media_storage !== "server") {
        if (canceled) return;
        setMediaBlobUrl("");
        setNeedsBinding(true);
        dispatchSession({ type: SET_MEDIA_BINDING_REQUIRED, required: true, phase: "typing" });
        setBindingHint("");
        setMediaError("当前课程媒体仅保存在浏览器本地，请先在历史记录中恢复视频。");
        setMediaLoading(false);
        return;
      }

      try {
        const resp = await apiClient(`/api/lessons/${lesson.id}/media`, {}, accessToken);
        if (!resp.ok || canceled) {
          if (canceled) return;
          const payload = await readErrorPayload(resp);
          if (canceled) return;
          setMediaBlobUrl("");
          if (isLocalMediaRequiredPayload(resp, payload) || Number(resp.status) === 404) {
            setNeedsBinding(true);
            dispatchSession({ type: SET_MEDIA_BINDING_REQUIRED, required: true, phase: "typing" });
            setMediaError("服务器媒体不可用，请先在历史记录中恢复视频。");
          } else {
            setNeedsBinding(true);
            dispatchSession({ type: SET_MEDIA_BINDING_REQUIRED, required: true, phase: "typing" });
            setMediaError(`${formatMediaLoadError(resp, payload)} 请先在历史记录中恢复视频。`);
          }
          return;
        }

        const rawContentType = String(resp.headers.get("content-type") || "").toLowerCase();
        let blob = await resp.blob();
        const fallbackType = inferMediaTypeFromFileName(lesson?.source_filename || "");
        const needsTypeOverride =
          (!rawContentType || rawContentType.startsWith("application/octet-stream")) && Boolean(fallbackType);
        if (needsTypeOverride) {
          blob = new Blob([blob], { type: fallbackType });
        }
        objectUrl = URL.createObjectURL(blob);
        if (canceled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        setMediaMode(resolveMediaModeByTypeAndName(blob.type || rawContentType, lesson?.source_filename || ""));
        setMediaBlobUrl(objectUrl);
        setBindingHint("");
        setMediaLoading(false);
      } catch (error) {
        if (canceled) return;
        const detail = String(error || "").trim();
        setMediaBlobUrl("");
        setNeedsBinding(true);
        dispatchSession({ type: SET_MEDIA_BINDING_REQUIRED, required: true, phase: "typing" });
        setMediaError(detail ? `媒体加载异常（${detail}），请先在历史记录中恢复视频。` : "媒体加载异常，请先在历史记录中恢复视频。");
      } finally {
        if (!canceled) {
          setMediaLoading(false);
        }
      }
    }

    loadMediaBlob();

    return () => {
      canceled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [accessToken, apiClient, externalMediaReloadToken, lesson?.id, lesson?.media_storage, lesson?.source_filename, mediaReloadKey]);

  useEffect(() => {
    if (!immersiveActive) return;
    if (needsBinding) return;
    if (mediaMode === "clip") return;
    if (!mediaReady) return;
    if (!mediaBlobUrl) return;
    dispatchSession({ type: SET_PHASE, phase: "auto_play_pending" });
  }, [immersiveActive, mediaBlobUrl, mediaMode, mediaReady, needsBinding]);

  useEffect(() => {
    if (!immersiveActive) return;
    if (!currentSentence) return;
    if (needsBinding) return;
    if (phase !== "auto_play_pending") return;
    if (mediaMode !== "clip" && !mediaReady) return;
    tryPlayCurrentSentence({ playbackKind: "initial", source: "auto_play_pending" });
  }, [currentSentence, immersiveActive, mediaMode, mediaReady, needsBinding, phase, tryPlayCurrentSentence]);

  useEffect(() => {
    if (!immersiveActive) return;
    if (!autoReplayAnsweredSentence) return;
    if (!sentenceTypingDone) return;
    dispatchSession({ type: ANSWER_COMPLETED, translationDisplayMode: "current_answered" });
    if (postAnswerReplayState === "idle") {
      dispatchSession({ type: SET_POST_ANSWER_REPLAY_STATE, value: "waiting_initial_finish" });
    }
  }, [autoReplayAnsweredSentence, immersiveActive, postAnswerReplayState, sentenceTypingDone]);

  useEffect(() => {
    updateTranslationMaskMetrics();
    if (typeof window === "undefined") return undefined;
    const resizeObserver =
      typeof window.ResizeObserver === "function"
        ? new window.ResizeObserver(() => {
            updateTranslationMaskMetrics();
          })
        : null;
    if (resizeObserver && immersiveMediaRef.current) {
      resizeObserver.observe(immersiveMediaRef.current);
    }
    if (resizeObserver && mediaElementRef.current) {
      resizeObserver.observe(mediaElementRef.current);
    }
    if (resizeObserver && typingPanelRef.current) {
      resizeObserver.observe(typingPanelRef.current);
    }
    window.addEventListener("resize", updateTranslationMaskMetrics);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateTranslationMaskMetrics);
    };
  }, [mediaMode, mediaReady, mediaReloadKey, updateTranslationMaskMetrics]);

  useEffect(() => {
    resetTranslationMaskGesture();
  }, [resetTranslationMaskGesture]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const orientationMedia = window.matchMedia("(orientation: landscape)");
    let timeoutId = null;
    let frameId = null;
    const syncOrientationLayout = () => {
      if (!immersiveActive) return;
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        updateTranslationMaskMetrics();
      });
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      timeoutId = window.setTimeout(() => {
        timeoutId = null;
        updateTranslationMaskMetrics();
      }, 100);
    };

    if (typeof orientationMedia.addEventListener === "function") {
      orientationMedia.addEventListener("change", syncOrientationLayout);
    } else if (typeof orientationMedia.addListener === "function") {
      orientationMedia.addListener(syncOrientationLayout);
    }
    window.addEventListener("orientationchange", syncOrientationLayout);

    return () => {
      if (typeof orientationMedia.removeEventListener === "function") {
        orientationMedia.removeEventListener("change", syncOrientationLayout);
      } else if (typeof orientationMedia.removeListener === "function") {
        orientationMedia.removeListener(syncOrientationLayout);
      }
      window.removeEventListener("orientationchange", syncOrientationLayout);
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [immersiveActive, updateTranslationMaskMetrics]);

  useEffect(() => {
    if (!canShowTranslationMask) {
      resetTranslationMaskGesture();
    }
  }, [canShowTranslationMask, resetTranslationMaskGesture]);

  useEffect(() => {
    if (translationMaskEnabled && canShowTranslationMask) {
      showTranslationMaskChrome();
      return;
    }
    translationMaskHoveredRef.current = false;
    clearTranslationMaskChromeIdleTimer();
    setTranslationMaskChromeVisible(true);
  }, [canShowTranslationMask, clearTranslationMaskChromeIdleTimer, showTranslationMaskChrome, translationMaskEnabled]);

  useEffect(() => {
    if (!immersiveActive) return;
    if (!autoReplayAnsweredSentence) return;
    if (!sentenceTypingDone) return;
    if (postAnswerReplayState !== "waiting_initial_finish") return;
    if (sentencePlaybackRequired && !sentencePlaybackDone) return;
    void startAnswerCompletedReplay();
  }, [
    autoReplayAnsweredSentence,
    immersiveActive,
    postAnswerReplayState,
    sentencePlaybackDone,
    sentencePlaybackRequired,
    sentenceTypingDone,
    startAnswerCompletedReplay,
  ]);

  useEffect(() => {
    if (!typingEnabled) return;
    focusTypingInput(isTouchDevice);
  }, [activeWordIndex, currentSentenceIndex, focusTypingInput, isTouchDevice, typingEnabled]);

  useEffect(() => {
    if (!typingEnabled || !immersiveActive) return undefined;
    if (typeof window === "undefined") return undefined;

    const onPointerDownCapture = (event) => {
      if (wordbookActionRef.current) return;
      if (shouldKeepControlFocus(event.target)) return;
      setTimeout(() => {
        focusTypingInput(isTouchDevice);
      }, 0);
    };

    window.addEventListener("pointerdown", onPointerDownCapture, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDownCapture, true);
    };
  }, [focusTypingInput, immersiveActive, isTouchDevice, typingEnabled]);

  useEffect(() => {
    if (!immersiveActive || typeof window === "undefined") return undefined;

    const scheduleViewportSync = () => {
      if (viewportSyncFrameRef.current !== null) {
        window.cancelAnimationFrame(viewportSyncFrameRef.current);
      }
      viewportSyncFrameRef.current = window.requestAnimationFrame(() => {
        viewportSyncFrameRef.current = null;
        syncMobileViewportLayout();
      });
    };

    scheduleViewportSync();
    const visualViewport = window.visualViewport;
    visualViewport?.addEventListener("resize", scheduleViewportSync);
    visualViewport?.addEventListener("scroll", scheduleViewportSync);
    window.addEventListener("resize", scheduleViewportSync);
    window.addEventListener("orientationchange", scheduleViewportSync);

    return () => {
      visualViewport?.removeEventListener("resize", scheduleViewportSync);
      visualViewport?.removeEventListener("scroll", scheduleViewportSync);
      window.removeEventListener("resize", scheduleViewportSync);
      window.removeEventListener("orientationchange", scheduleViewportSync);
      if (viewportSyncFrameRef.current !== null) {
        window.cancelAnimationFrame(viewportSyncFrameRef.current);
        viewportSyncFrameRef.current = null;
      }
      const container = immersiveContainerRef.current;
      if (container) {
        container.style.removeProperty("--immersive-shell-height");
        container.style.removeProperty("--immersive-visual-viewport-height");
        container.style.removeProperty("--immersive-keyboard-offset");
      }
      viewportBaselineHeightRef.current = 0;
      viewportOrientationRef.current = "";
    };
  }, [immersiveActive, syncMobileViewportLayout]);

  useEffect(() => {
    if (!typingEnabled || !isTouchDevice || !mobileViewportState.keyboardOpen) return;
    focusTypingInput(true);
  }, [focusTypingInput, isTouchDevice, mobileViewportState.keyboardOpen, typingEnabled]);

  useEffect(() => {
    if (!isTouchDevice || !mobileViewportState.keyboardOpen) return;
    scrollTypingPanelIntoView();
  }, [isTouchDevice, mobileViewportState.keyboardOpen, scrollTypingPanelIntoView]);

  useEffect(() => {
    if (!immersiveActive) return;
    if (
      !shouldAutoAdvanceSentence({
        immersiveActive,
        sentenceTypingDone,
        postAnswerReplayState,
        sentenceAdvanceLocked: sentenceAdvanceLockedRef.current,
        autoReplayAnsweredSentence,
        singleSentenceLoopEnabled,
        sentencePlaybackRequired,
        sentencePlaybackDone,
      })
    ) {
      return;
    }
    sentenceAdvanceLockedRef.current = true;
    dispatchSession({ type: SET_PHASE, phase: "transition" });
    setTimeout(() => {
      void handleSentencePassed();
    }, 120);
  }, [
    autoReplayAnsweredSentence,
    handleSentencePassed,
    immersiveActive,
    postAnswerReplayState,
    sentencePlaybackDone,
    sentencePlaybackRequired,
    sentenceTypingDone,
    singleSentenceLoopEnabled,
    shouldAutoAdvanceSentence,
  ]);

  useEffect(() => {
    if (immersiveActive) return;
    if (fullscreenStudyMode) {
      setFullscreenStudyMode(false);
    }
    stopPlayback();
    dispatchSession({ type: EXIT_IMMERSIVE });
  }, [fullscreenStudyMode, immersiveActive, setFullscreenStudyMode, stopPlayback]);

  const handleMainMediaError = useCallback(() => {
    const hasClipFallback = lesson?.media_storage === "server" && Array.isArray(lesson?.sentences) && lesson.sentences.some((item) => item?.audio_url);
    if (hasClipFallback) {
      setMediaMode("clip");
      setMediaError("当前浏览器不支持该媒体格式，已自动切换为句级音频模式。");
      setPhase(immersiveActive ? "auto_play_pending" : "idle");
      return;
    }
    setMediaBlobUrl("");
    setNeedsBinding(true);
    setMediaError("当前媒体格式无法播放，请先在历史记录中恢复视频。");
    dispatchSession({ type: SET_MEDIA_BINDING_REQUIRED, required: true, phase: "typing" });
  }, [immersiveActive, lesson?.media_storage, lesson?.sentences]);

  const handleBindLocalFile = useCallback(
    async (nextFile) => {
      if (!lesson?.id || !nextFile) return;
      setBindingBusy(true);
      setBindingError("");
      setBindingHint("");
      try {
        const localDurationSec = await readMediaDurationSeconds(nextFile, nextFile.name || lesson.source_filename || "");
        if (expectedSourceDurationSec > 0) {
          const delta = Math.abs(localDurationSec - expectedSourceDurationSec);
          if (delta > 0.5) {
            setBindingError(
              `绑定失败：文件时长差 ${delta.toFixed(3)} 秒，超过 0.5 秒阈值（本地 ${localDurationSec.toFixed(3)} 秒，课程 ${expectedSourceDurationSec.toFixed(3)} 秒）。`,
            );
            return;
          }
        }

        await requestPersistentStorage();
        await saveLessonMedia(lesson.id, nextFile);
        setNeedsBinding(false);
        setMediaError("");
        setBindingHint("本地媒体已绑定，正在加载。");
        setMediaReloadKey((value) => value + 1);
      } catch (error) {
        let message = `绑定失败：${String(error)}`;
        try {
          const estimate = await getStorageEstimate();
          if (estimate && Number.isFinite(estimate.quota) && Number.isFinite(estimate.usage) && estimate.quota > 0) {
            const usageRatio = (estimate.usage / estimate.quota) * 100;
            message = `${message}（存储占用约 ${usageRatio.toFixed(1)}%）`;
          }
        } catch (_) {
          // ignore estimate errors
        }
        setBindingError(message);
      } finally {
        setBindingBusy(false);
      }
    },
    [expectedSourceDurationSec, lesson?.id, lesson?.source_filename],
  );

  const clearActiveWordInput = useCallback(() => {
    const snapshot = cloneWordSnapshot(activeWordIndexRef.current, currentWordInputRef.current, wordInputsRef.current, wordStatusesRef.current);
    if (snapshot.activeWordIndex < snapshot.wordInputs.length) {
      snapshot.wordInputs[snapshot.activeWordIndex] = "";
      snapshot.wordStatuses[snapshot.activeWordIndex] = "active";
    }
    snapshot.currentWordInput = "";
    applyWordSnapshot(snapshot);
  }, [applyWordSnapshot]);

  const commitCorrectWord = useCallback(
    (typedWord) => {
      playCorrectSound();
      const snapshot = cloneWordSnapshot(activeWordIndexRef.current, currentWordInputRef.current, wordInputsRef.current, wordStatusesRef.current);
      const activeIndex = snapshot.activeWordIndex;
      const canonicalWord = expectedTokens[activeIndex] || typedWord.trim();
      if (activeIndex >= expectedTokens.length) {
        return activeIndex;
      }
      snapshot.wordInputs[activeIndex] = canonicalWord;
      snapshot.wordStatuses[activeIndex] = "correct";
      snapshot.currentWordInput = "";
      const nextActiveIndex = activeIndex + 1;
      if (nextActiveIndex < expectedTokens.length) {
        snapshot.wordStatuses[nextActiveIndex] = "active";
        snapshot.activeWordIndex = nextActiveIndex;
      } else {
        snapshot.activeWordIndex = expectedTokens.length;
        dispatchSession({
          type: ANSWER_COMPLETED,
          translationDisplayMode: "current_answered",
        });
      }
      applyWordSnapshot(snapshot);
      return snapshot.activeWordIndex;
    },
    [applyWordSnapshot, expectedTokens, playCorrectSound],
  );

  const commitWrongWord = useCallback(() => {
    playWrongSound();
    clearActiveWordInput();
  }, [clearActiveWordInput, playWrongSound]);

  const exitImmersive = useCallback(
    async (source = "button") => {
      const handler = typeof onExitImmersive === "function" ? onExitImmersive : onBack;
      if (typeof handler !== "function") return;
      if (fullscreenStudyMode) {
        setFullscreenStudyMode(false);
      }
      handler(source);
    },
    [fullscreenStudyMode, onBack, onExitImmersive, setFullscreenStudyMode],
  );

  const interruptCurrentSentencePlayback = useCallback(
    (source = "interrupt") => {
      stopPlayback();
      dispatchSession({ type: SET_POST_ANSWER_REPLAY_STATE, value: "idle" });
      dispatchSession({ type: SET_PHASE, phase: "typing" });
      debugImmersiveLog("interrupt_current_sentence_playback", {
        source,
        sentenceIndex: currentSentenceIndex,
      });
    },
    [currentSentenceIndex, stopPlayback],
  );

  const jumpToSentence = useCallback(
    async (targetIndex, source = "manual") => {
      if (!lesson || sentenceCount <= 0) return;
      const safeTarget = Math.max(0, Math.min(sentenceCount - 1, Number(targetIndex) || 0));
      if (safeTarget === currentSentenceIndex) return;

      interruptCurrentSentencePlayback(source);
      resetWordTyping(lesson?.sentences?.[safeTarget], true);
      dispatchSession({
        type: NAVIGATE_TO_SENTENCE,
        targetIndex: safeTarget,
        sentenceCount,
        phase: immersiveActive ? "auto_play_pending" : "idle",
      });
      await syncProgress(safeTarget, completedIndexes, lesson?.sentences?.[safeTarget]?.begin_ms || 0);
      onProgressSynced?.();
    },
    [
      completedIndexes,
      currentSentenceIndex,
      immersiveActive,
      interruptCurrentSentencePlayback,
      lesson,
      onProgressSynced,
      resetWordTyping,
      sentenceCount,
      syncProgress,
    ],
  );

  const commitSentenceJumpValue = useCallback(
    (rawValue, source = "input_commit") => {
      const parsedValue = Number(rawValue);
      if (!Number.isFinite(parsedValue) || parsedValue < 0) {
        setSentenceJumpValue(String(currentSentenceIndex + 1));
        setSentenceJumpEditing(false);
        return false;
      }
      const target = Math.max(1, Math.min(sentenceCount, Math.floor(parsedValue)));
      const targetIdx = target - 1;
      if (targetIdx === currentSentenceIndex) {
        setSentenceJumpValue("");
        setSentenceJumpEditing(false);
        return false;
      }
      void jumpToSentence(targetIdx, source);
      setSentenceJumpValue("");
      setSentenceJumpEditing(false);
      return true;
    },
    [currentSentenceIndex, jumpToSentence, sentenceCount],
  );

  const handleSentenceJumpKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commitSentenceJumpValue(e.currentTarget.value, "input_enter");
      } else if (e.key === "Escape") {
        setSentenceJumpValue("");
        setSentenceJumpEditing(false);
      }
    },
    [commitSentenceJumpValue],
  );

  const handleSentenceJumpBlur = useCallback(
    (event) => {
      setSentenceJumpEditing(false);
      if (!String(event.currentTarget.value || "").trim()) {
        setSentenceJumpValue("");
        return;
      }
      commitSentenceJumpValue(event.currentTarget.value, "input_blur");
    },
    [commitSentenceJumpValue],
  );

  const revealCurrentLetter = useCallback(
    (source = "button_reveal_letter") => {
      if (!typingEnabled) return activeWordIndexRef.current;
      // 必须在 assistance 之前取索引：揭示最后一个字母会完成当前词并推进 activeWordIndex，若用之后的索引会把计数记到下一词上
      const wordIndexReceivingReveal = activeWordIndexRef.current;
      const comparableBeforeReveal = normalizeComparableToken(currentWordInputRef.current).length;
      const result = applyReplayAssistanceToSnapshot(
        cloneWordSnapshot(activeWordIndexRef.current, currentWordInputRef.current, wordInputsRef.current, wordStatusesRef.current),
        expectedTokens,
        { revealLetterCount: 1, revealWordCount: 0 },
      );
      applyWordSnapshot(result.snapshot);
      if (wordIndexReceivingReveal < expectedTokens.length) {
        setWordRevealComparableIndices((prev) => {
          const updated = prev.length ? [...prev] : [];
          while (updated.length <= wordIndexReceivingReveal) updated.push([]);
          updated[wordIndexReceivingReveal] = mergeSortedComparableIndices(updated[wordIndexReceivingReveal], [
            comparableBeforeReveal,
          ]);
          return updated;
        });
      }
      if (result.completedSentence) {
        dispatchSession({
          type: ANSWER_COMPLETED,
          translationDisplayMode: "current_answered",
        });
      }
      debugImmersiveLog("reveal_letter", {
        source,
        sentenceIndex: currentSentenceIndex,
        activeWordIndex: result.snapshot.activeWordIndex,
      });
      return result.snapshot.activeWordIndex;
    },
    [applyWordSnapshot, currentSentenceIndex, expectedTokens, typingEnabled],
  );

  const revealCurrentWord = useCallback(
    (source = "button_reveal") => {
      if (!typingEnabled) return activeWordIndexRef.current;
      const activeIdx = activeWordIndexRef.current;
      const expected = expectedTokens[activeIdx] || "";
      if (!expected) return activeWordIndexRef.current;
      const beforeLen = normalizeComparableToken(currentWordInputRef.current).length;
      const totalComparable = normalizeComparableToken(expected).length;
      const additions = Array.from({ length: Math.max(0, totalComparable - beforeLen) }, (_, j) => beforeLen + j);
      setWordRevealComparableIndices((prev) => {
        const updated = prev.length ? [...prev] : [];
        while (updated.length <= activeIdx) updated.push([]);
        updated[activeIdx] = mergeSortedComparableIndices(updated[activeIdx] || [], additions);
        return updated;
      });
      const nextActiveWordIndex = commitCorrectWord(expected);
      debugImmersiveLog("reveal_word", {
        source,
        sentenceIndex: currentSentenceIndex,
        nextActiveWordIndex,
      });
      return nextActiveWordIndex;
    },
    [commitCorrectWord, currentSentenceIndex, expectedTokens, typingEnabled],
  );

  const replayCurrentSentence = useCallback(
    (source = "manual_replay") => {
      if (!currentSentence || mediaLoading || phase === "transition" || needsBinding) return;
      setSentenceReplayCount((prev) => prev + 1);
      const playbackPlan = buildReplayPlaybackPlan(
        currentSentence,
        currentSentenceTiming,
        activeWordIndexRef.current,
        selectedPlaybackRate,
      );
      debugImmersiveLog("manual_replay", {
        source,
        sentenceIndex: currentSentenceIndex,
        initialRate: playbackPlan.initialRate,
        rateSteps: playbackPlan.rateSteps,
        speedMode: playbackPlan.speedMode,
        fallbackReason: playbackPlan.fallbackReason,
        preciseBoundary: playbackPlan.preciseBoundary,
        tailBoundaryMs: playbackPlan.tailBoundaryMs,
        tailWindowMs: playbackPlan.tailWindowMs,
      });
      void tryPlayCurrentSentence({
        manual: true,
        playbackKind: "manual_replay",
        playbackPlan,
        source,
      });
    },
    [
      currentSentence,
      currentSentenceIndex,
      currentSentenceTiming,
      mediaLoading,
      needsBinding,
      phase,
      selectedPlaybackRate,
      tryPlayCurrentSentence,
    ],
  );

  // ExplanationSidebarContent handlers (defined after replayCurrentSentence to avoid TDZ)
  const handlePlayExplanation = useCallback(() => {
    if (!explanationAudioUrl) return;
    void playExplanationAudio(explanationAudioUrl);
    markExplanationViewed();
  }, [explanationAudioUrl, markExplanationViewed, playExplanationAudio]);

  const handlePauseExplanation = useCallback(() => {
    pauseExplanationAudio();
  }, [pauseExplanationAudio]);

  const handleResumeExplanation = useCallback(() => {
    void resumeExplanationAudio();
    markExplanationViewed();
  }, [markExplanationViewed, resumeExplanationAudio]);

  const handleReplayExplanation = useCallback(() => {
    if (!explanationAudioUrl) return;
    void playExplanationAudio(explanationAudioUrl);
    markExplanationViewed();
  }, [explanationAudioUrl, markExplanationViewed, playExplanationAudio]);

  const handleStartPractice = useCallback(() => {
    handleStartPracticeFromExplanation();
  }, [handleStartPracticeFromExplanation]);

  const handleTogglePausePlayback = useCallback(
    (source = "button_toggle_pause") => {
      if (!currentSentence || needsBinding) return;
      const replayShortcutLabel = getShortcutLabel(learningSettings.shortcuts.replay_sentence);
      void (async () => {
        const result = await togglePausePlayback();
        if (!result.ok) {
          if (result.reason === "autoplay_blocked") {
            setMediaError(`恢复播放失败。你可以改按 ${replayShortcutLabel} 重新播放本句。`);
          }
          return;
        }
        setMediaError("");
        dispatchSession({ type: SET_PHASE, phase: result.state === "paused" ? "typing" : "playing" });
        debugImmersiveLog("toggle_pause_playback", {
          source,
          sentenceIndex: currentSentenceIndex,
          state: result.state,
        });
      })();
    },
    [currentSentence, currentSentenceIndex, learningSettings.shortcuts.replay_sentence, needsBinding, togglePausePlayback],
  );

  useEffect(() => {
    stopExplanationAudio({ resetPosition: true });
  }, [currentSentenceIndex, stopExplanationAudio]);

  const speakPreviousSentenceTTS = (text, rate = 1.0) => {
    if (!window.speechSynthesis) return false;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "en-US";
    utter.rate = rate;
    window.speechSynthesis.speak(utter);
    return true;
  };

  const requestPlayPreviousSentence = useCallback(
    (source = "previous_sentence_speaker") => {
      if (!previousSentence) return;
      interruptCurrentSentencePlayback(source);
      dispatchSession({ type: SET_TRANSLATION_DISPLAY_MODE, value: "previous" });
      playbackKindRef.current = "previous_sentence_preview";
      setMediaError("");
      debugImmersiveLog("previous_sentence_speaker.start", {
        source,
        sentenceIndex: currentSentenceIndex,
      });
      void (async () => {
        // Tier 1: clip audio with main-video fallback
        const result = await playSentence(previousSentence, {
          initialRate: selectedPlaybackRate,
          rateSteps: [],
        }, { skipSeek: false });
        if (result.ok) return;
        debugImmersiveLog("previous_sentence_speaker.clip_failed", {
          source,
          sentenceIndex: currentSentenceIndex,
          reason: result.reason || "unknown",
        });
        // Tier 2: Web Speech API TTS
        const ttsOk = speakPreviousSentenceTTS(previousSentence.text_en || "", selectedPlaybackRate);
        if (ttsOk) {
          dispatchSession({
            type: PLAYBACK_STARTED,
            phase: "playing",
            translationDisplayMode: "previous",
          });
          return;
        }
        // Tier 3: error
        dispatchSession({ type: SET_PHASE, phase: "typing" });
        setMediaError("上一句音频不可用，请稍后重试。");
        debugImmersiveLog("previous_sentence_speaker.tts_failed", {
          source,
          sentenceIndex: currentSentenceIndex,
        });
      })();
    },
    [currentSentenceIndex, interruptCurrentSentencePlayback, playSentence, previousSentence, selectedPlaybackRate],
  );

  const requestPlayCurrentAnsweredSentence = useCallback(
    (source = "current_sentence_speaker") => {
      if (!currentSentence) return;
      stopPlayback();
      dispatchSession({ type: SET_PHASE, phase: "typing" });
      dispatchSession({ type: SET_TRANSLATION_DISPLAY_MODE, value: "current_answered" });
      setMediaError("");
      debugImmersiveLog("current_sentence_speaker.start", {
        source,
        sentenceIndex: currentSentenceIndex,
      });
      void tryPlayCurrentSentence({
        manual: true,
        playbackKind: "wordbook_sentence_preview",
        playbackPlan: {
          initialRate: selectedPlaybackRate,
          rateSteps: [],
        },
        source,
      });
    },
    [currentSentence, currentSentenceIndex, selectedPlaybackRate, stopPlayback, tryPlayCurrentSentence],
  );

  const requestInteractiveWordbookSentencePlayback = useCallback(
    (source = "wordbook_sentence_speaker") => {
      if (wordbookSentenceMode === "current") {
        requestPlayCurrentAnsweredSentence(source);
        return;
      }
      requestPlayPreviousSentence(source);
    },
    [requestPlayCurrentAnsweredSentence, requestPlayPreviousSentence, wordbookSentenceMode],
  );

  const {
    requestReplayCurrentSentence,
    requestTogglePausePlayback,
    requestNavigateSentence,
    requestRevealLetter,
    requestRevealWord,
    requestPlayPreviousSentence: requestPreviousSentencePlayback,
  } = useImmersiveSessionController({
    canInteract: Boolean(immersiveActive),
    currentSentenceIndex,
    sentenceCount,
    onReplayCurrentSentence: replayCurrentSentence,
    onTogglePausePlayback: handleTogglePausePlayback,
    onNavigateSentence: ({ targetIndex, source }) => {
      void jumpToSentence(targetIndex, source);
    },
    onRevealLetter: revealCurrentLetter,
    onRevealWord: revealCurrentWord,
    onHandleSentencePassed: () => {
      void handleSentencePassed();
    },
    onInterruptCurrentSentencePlayback: interruptCurrentSentencePlayback,
    onPlayPreviousSentence: requestPlayPreviousSentence,
  });

  const { handleKeyDown } = useImmersiveKeyboard({
    immersiveActive,
    currentSentence,
    learningSettings,
    typingEnabled,
    showEntryHintOverlay,
    setShowEntryHintOverlay,
    typingInputRef,
    exitImmersive,
    requestReplayCurrentSentence,
    requestTogglePausePlayback,
    audioRecorderRef,
    requestNavigateSentence,
    requestRevealLetter,
    requestRevealWord,
    setMediaError,
    playKeySound,
    activeWordIndexRef,
    currentWordInputRef,
    setCurrentWordInput,
    setWordInputs,
    setWordStatuses,
    wordInputsRef,
    wordStatusesRef,
    expectedTokens,
    commitCorrectWord,
    commitWrongWord,
  });

  const handleTranslationMaskPointerDown = useCallback(
    (event, mode = "move") => {
      // Guard only on the two things we actually need at pointer-down time.
      // pointerId check prevents two simultaneous drags (e.g. touch + mouse on same gesture).
      const gesture = translationMaskGestureRef.current;
      if (!translationMaskEnabled) return;
      if (gesture.pointerId !== null && gesture.pointerId !== event.pointerId) return;
      if (typeof event.button === "number" && event.button !== 0) return;
      const rectSnapshot = resolvedTranslationMaskRect;
      if (!rectSnapshot) return;
      showTranslationMaskChrome();
      event.preventDefault();
      event.stopPropagation();
      gesture.pointerId = event.pointerId;
      gesture.mode = mode;
      gesture.startX = event.clientX;
      gesture.startY = event.clientY;
      gesture.startRect = { ...rectSnapshot };
      gesture.latestRect = { ...rectSnapshot };
      gesture.captureElement = event.currentTarget;
      translationMaskDraggingRef.current = true;
      if (typeof event.currentTarget?.setPointerCapture === "function") {
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch (_) {
          // Ignore pointer capture failures across browsers.
        }
      }
    },
    [resolvedTranslationMaskRect, showTranslationMaskChrome, translationMaskEnabled],
  );

  const handleTranslationMaskButtonClick = useCallback(() => {
    toggleTranslationMask();
  }, [toggleTranslationMask]);

  const handleTranslationMaskPointerEnter = useCallback(() => {
    translationMaskHoveredRef.current = true;
    showTranslationMaskChrome();
  }, [showTranslationMaskChrome]);

  const handleTranslationMaskPointerLeave = useCallback(() => {
    translationMaskHoveredRef.current = false;
    queueTranslationMaskChromeHide();
  }, [queueTranslationMaskChromeHide]);


  useEffect(() => {
    return () => {
      clearTranslationMaskChromeIdleTimer();
    };
  }, [clearTranslationMaskChromeIdleTimer]);

  useEffect(() => {
    return () => {
      clearFocusRestoreTimer();
    };
  }, [clearFocusRestoreTimer]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const handlePointerMove = (event) => {
      const gesture = translationMaskGestureRef.current;
      if (gesture.pointerId === null || gesture.pointerId !== event.pointerId || !gesture.mode) {
        return;
      }
      // Read metrics from ref so this handler never sees a stale viewport size.
      const metrics = translationMaskMetricsRef.current;
      if (!metrics) return;
      const startRect = gesture.startRect;
      if (!startRect) return;
      const deltaX = event.clientX - gesture.startX;
      const deltaY = event.clientY - gesture.startY;
      const nextRect =
        gesture.mode === "move"
          ? {
              ...startRect,
              left: clampNumber(startRect.left + deltaX, 0, Math.max(0, metrics.width - startRect.width)),
              top: clampNumber(startRect.top + deltaY, 0, Math.max(0, metrics.height - startRect.height)),
            }
          : resolveTranslationMaskResizeRect(startRect, gesture.mode, deltaX, deltaY, metrics);
      if (!nextRect) return;
      gesture.latestRect = nextRect;
      setTranslationMaskRect(convertTranslationMaskRectToStored(nextRect, metrics));
    };

    const handlePointerFinish = (event) => {
      const gesture = translationMaskGestureRef.current;
      if (gesture.pointerId === null || (event && gesture.pointerId !== event.pointerId)) return;
      const metrics = translationMaskMetricsRef.current;
      if (gesture.latestRect && metrics) {
        persistTranslationMaskPreference(translationMaskEnabled, convertTranslationMaskRectToStored(gesture.latestRect, metrics));
      }
      resetTranslationMaskGesture();
      if (!translationMaskHoveredRef.current) {
        queueTranslationMaskChromeHide();
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerFinish);
    window.addEventListener("pointercancel", handlePointerFinish);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerFinish);
      window.removeEventListener("pointercancel", handlePointerFinish);
    };
  }, [
    persistTranslationMaskPreference,
    queueTranslationMaskChromeHide,
    resetTranslationMaskGesture,
    translationMaskEnabled,
  ]);



  if (!lesson || !currentSentence) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">沉浸学习</CardTitle>
          <CardDescription>当前课程暂无可学习句子。</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const showMediaLoadingOverlay = mediaLoading && !needsBinding && !mediaReady;
  const waitingForInitialPlayback = sentenceTypingDone && !sentencePlaybackDone && sentencePlaybackRequired;
  const allowNativeVideoFullscreen = isIpadSafari && mediaMode === "video";
  const translationMaskVisible = canShowTranslationMask && translationMaskEnabled;
  const translationMaskClassName = [
    "immersive-translation-mask",
    translationMaskChromeVisible ? "" : "immersive-translation-mask--chrome-hidden",
  ]
    .filter(Boolean)
    .join(" ");

  const immersivePageShellClassName = [
    "immersive-page-shell",
    isTouchDevice ? "immersive-page-shell--touch" : "",
    mobileViewportState.keyboardOpen ? "immersive-page-shell--keyboard-open" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const handleStartPostLesson = useCallback(() => setShowPostLesson(true), []);
  const handleExitPostLesson = useCallback(() => setShowPostLesson(false), []);

  if (showPostLesson) {
    return (
      <PostLessonPlayer
        lesson={lesson}
        accessToken={accessToken}
        apiClient={apiClient}
        onExit={handleExitPostLesson}
      />
    );
  }

  return (
    <ImmersiveLessonShell
      fullscreenStudyMode={fullscreenStudyMode}
      videoPanelProps={{
        immersiveActive,
        hasExitHandler,
        exitImmersive,
        lessonTitle: lesson?.title || `TEco Lab · 第 ${lesson?.id ?? ""} 期`,
        currentSentenceIndex,
        sentenceCount,
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
        immersiveContainerRef,
        immersivePageShellClassName,
        handleImmersivePageClick,
        immersiveMediaRef,
        updateTranslationMaskMetrics,
        requestNavigateSentence,
        requestReplayCurrentSentence,
        requestTogglePausePlayback,
        fullscreenStudyMode,
        onToggleFullscreenStudyMode: () => setFullscreenStudyMode(!fullscreenStudyMode),
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
      }}
      typingPanelProps={{
        ref: typingPanelRef,
        sentenceCount,
        currentSentenceIndex,
        isPlaying,
        isPlaybackPaused,
        expectedTokens,
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
        wordbookSelectedTokenIndexes,
        wordbookBusy,
        wordbookSuccessAnimationIndexes,
        handleWordbookTokenClick,
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
        setSoeLoading,
        apiClient,
        accessToken,
        currentLessonId,
        typingPanelRef,
        audioRecorderRef,
        parseResponse,
        wordbookSentenceBandMap,
        translationZh,
        lookupBandFromMap,
        currentSentence,
        nextSentence,
        sentenceTypingDone,
        fullscreenStudyMode,
        fullscreenSentenceHeading: translationHeading,
        fullscreenSentenceEn: translationEn,
        fullscreenSentenceZh: translationZh,
        typingInputRef,
        currentWordInput,
        typingEnabled,
        handleKeyDown,
        focusTypingInput,
        isTouchDevice,
        shouldKeepControlFocus,
        onStartPostLesson: handleStartPostLesson,
      }}
      explanationProps={{
        sentence: currentSentence,
        explanation: showExplanation ? currentExplanation : null,
        previousSentence: previousSentence?.text_en || "",
        previousSentenceTranslation: previousSentence?.text_zh || "",
        wordbookSentenceHeading: wordbookSentenceMode === "current" ? "本句" : "上一句",
        wordbookSentence: wordbookSentence,
        wordbookSentenceTokens,
        wordbookSelectedTokenIndexes,
        wordbookSuccessAnimationIndexes,
        wordbookSentenceBandMap,
        difficultyAnalyzerRef,
        collinsLevel,
        lookupBandFromMap,
        handleWordbookTokenClick,
        requestInteractiveWordbookSentencePlayback,
        wordbookSentencePlaybackLabel,
        collectWordbookEntry,
        selectedWordbookTokens,
        selectedWordbookStart,
        selectedWordbookEnd,
        selectedWordbookText,
        wordbookSuccessMessage,
        wordbookSentenceZh,
        wordbookBusy,
        audioUrl: showExplanation ? explanationAudioUrl : null,
        audioRef: explanationAudioRef,
        isAudioPlaying: isExplanationPlaying,
        isAudioPaused: isExplanationPaused,
        onPlayAudio: handlePlayExplanation,
        onPauseAudio: handlePauseExplanation,
        onResumeAudio: handleResumeExplanation,
        onReplayAudio: handleReplayExplanation,
        onStartPractice: handleStartPractice,
        wordStatuses,
        expectedTokens,
        sentenceTypingDone,
        showKeywordHints,
      }}
      chatProps={{
        lessonId: lesson?.id,
        currentSentence,
        accessToken,
        apiClient,
      }}
    />
  );
}


