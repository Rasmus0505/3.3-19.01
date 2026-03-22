import { ArrowLeft, ArrowRight, Eye, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { parseResponse, toErrorText } from "../../shared/api/client";
import { getStorageEstimate, getLessonMedia, readMediaDurationSeconds, requestPersistentStorage, saveLessonMedia } from "../../shared/media/localMediaStore";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../shared/ui";
import { getShortcutLabel, isShortcutPressed, readLearningSettings, resolveReplayAssistance, writeLearningSettings } from "./learningSettings";
import { getMediaExt, isAudioFilename, isVideoFilename, normalizeToken } from "./tokenNormalize";
import { useSentencePlayback } from "./useSentencePlayback";
import { useTypingFeedbackSounds } from "./useTypingFeedbackSounds";
import "./immersive.css";

const LOCAL_MEDIA_REQUIRED_CODE = "LOCAL_MEDIA_REQUIRED";
const APOSTROPHE_RE = /[’']/g;
const CINEMA_CONTROLS_IDLE_MS = 3000;
const MIN_PERCEPTIBLE_SLOWDOWN_WINDOW_MS = 900;
const WORD_TIMING_TOLERANCE_MS = 140;
const PROGRAMMATIC_FULLSCREEN_EXIT_RESET_MS = 1000;
const WORDBOOK_LONG_PRESS_MS = 260;
const MEDIA_TYPE_BY_EXTENSION = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
  ".avi": "video/x-msvideo",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".flac": "audio/flac",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg; codecs=opus",
};

function debugImmersiveLog(event, detail = {}) {
  if (typeof console === "undefined" || typeof console.debug !== "function") return;
  console.debug("[DEBUG] immersive.learning", event, detail);
}

function formatPlaybackRateLabel(rate) {
  return `${Number(rate || 1).toFixed(2)}x`;
}

function getFullscreenElement() {
  if (typeof document === "undefined") return null;
  return document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement || null;
}

async function requestElementFullscreen(element) {
  if (!element) {
    throw new Error("fullscreen_target_missing");
  }
  if (typeof element.requestFullscreen === "function") {
    return element.requestFullscreen();
  }
  if (typeof element.webkitRequestFullscreen === "function") {
    return element.webkitRequestFullscreen();
  }
  if (typeof element.msRequestFullscreen === "function") {
    return element.msRequestFullscreen();
  }
  throw new Error("fullscreen_not_supported");
}

async function exitElementFullscreen() {
  if (typeof document === "undefined") return;
  if (document.fullscreenElement && typeof document.exitFullscreen === "function") {
    return document.exitFullscreen();
  }
  if (document.webkitFullscreenElement && typeof document.webkitExitFullscreen === "function") {
    return document.webkitExitFullscreen();
  }
  if (document.msFullscreenElement && typeof document.msExitFullscreen === "function") {
    return document.msExitFullscreen();
  }
}

function countTokenInputErrors(inputValue, expectedToken) {
  const actual = normalizeComparableToken(inputValue);
  const expected = normalizeComparableToken(expectedToken);
  const sameLength = Math.min(actual.length, expected.length);

  let mismatchCount = 0;
  for (let idx = 0; idx < sameLength; idx += 1) {
    if (actual[idx]?.toLowerCase() !== expected[idx]?.toLowerCase()) {
      mismatchCount += 1;
    }
  }

  if (actual.length > expected.length) {
    mismatchCount += actual.length - expected.length;
  }
  return mismatchCount;
}

function isApostropheChar(char) {
  return char === "'" || char === "’";
}

function normalizeComparableToken(token) {
  return normalizeToken(String(token || "")).replace(APOSTROPHE_RE, "");
}

function buildLetterSlots(expectedToken, inputValue) {
  const expected = String(expectedToken || "");
  const actual = normalizeComparableToken(inputValue);
  const slots = [];
  let typedIndex = 0;

  for (let idx = 0; idx < expected.length; idx += 1) {
    const expectedChar = expected[idx];
    if (isApostropheChar(expectedChar)) {
      slots.push({
        key: `slot-fixed-${idx}`,
        char: "'",
        state: "fixed",
        extra: false,
      });
      continue;
    }

    const typedChar = actual[typedIndex] || "";
    let state = "empty";
    if (typedChar) {
      state = typedChar.toLowerCase() === expectedChar.toLowerCase() ? "correct" : "wrong";
      typedIndex += 1;
    }
    slots.push({
      key: `slot-${idx}`,
      char: typedChar || "\u00A0",
      state,
      extra: false,
    });
  }

  for (let idx = typedIndex; idx < actual.length; idx += 1) {
    slots.push({
      key: `extra-${idx}`,
      char: actual[idx] || "\u00A0",
      state: "wrong",
      extra: true,
    });
  }

  if (!slots.length) {
    return [{ key: "slot-empty", char: "\u00A0", state: "empty", extra: false }];
  }
  return slots;
}

function createWordState(tokens) {
  const safeTokens = Array.isArray(tokens) ? tokens : [];
  return {
    activeWordIndex: 0,
    currentWordInput: "",
    wordInputs: safeTokens.map(() => ""),
    wordStatuses: safeTokens.map((_, idx) => (idx === 0 ? "active" : "pending")),
  };
}

function buildSelectableSentenceTokens(sentence) {
  if (Array.isArray(sentence?.tokens) && sentence.tokens.length) {
    return sentence.tokens;
  }
  return String(sentence?.text_en || "")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function toggleWordbookTokenIndex(selectedIndexes, tokenIndex) {
  if (!Number.isInteger(tokenIndex)) {
    return Array.isArray(selectedIndexes) ? selectedIndexes : [];
  }
  const nextSelection = new Set(Array.isArray(selectedIndexes) ? selectedIndexes.filter(Number.isInteger) : []);
  if (nextSelection.has(tokenIndex)) {
    nextSelection.delete(tokenIndex);
  } else {
    nextSelection.add(tokenIndex);
  }
  return Array.from(nextSelection).sort((left, right) => left - right);
}

function cloneWordSnapshot(activeWordIndex, currentWordInput, wordInputs, wordStatuses) {
  return {
    activeWordIndex: Math.max(0, Number(activeWordIndex || 0)),
    currentWordInput: String(currentWordInput || ""),
    wordInputs: Array.isArray(wordInputs) ? [...wordInputs] : [],
    wordStatuses: Array.isArray(wordStatuses) ? [...wordStatuses] : [],
  };
}

function completeActiveWordInSnapshot(snapshot, tokens) {
  const nextSnapshot = cloneWordSnapshot(
    snapshot.activeWordIndex,
    snapshot.currentWordInput,
    snapshot.wordInputs,
    snapshot.wordStatuses,
  );
  const activeIndex = nextSnapshot.activeWordIndex;
  if (activeIndex < 0 || activeIndex >= tokens.length) {
    return { snapshot: nextSnapshot, completedSentence: activeIndex >= tokens.length };
  }
  nextSnapshot.wordInputs[activeIndex] = String(tokens[activeIndex] || "");
  nextSnapshot.wordStatuses[activeIndex] = "correct";
  nextSnapshot.currentWordInput = "";
  const nextIndex = activeIndex + 1;
  if (nextIndex < tokens.length) {
    nextSnapshot.wordStatuses[nextIndex] = "active";
    nextSnapshot.activeWordIndex = nextIndex;
    return { snapshot: nextSnapshot, completedSentence: false };
  }
  nextSnapshot.activeWordIndex = tokens.length;
  return { snapshot: nextSnapshot, completedSentence: true };
}

function revealLetterInSnapshot(snapshot, tokens) {
  const nextSnapshot = cloneWordSnapshot(
    snapshot.activeWordIndex,
    snapshot.currentWordInput,
    snapshot.wordInputs,
    snapshot.wordStatuses,
  );
  const activeIndex = nextSnapshot.activeWordIndex;
  if (activeIndex < 0 || activeIndex >= tokens.length) {
    return { snapshot: nextSnapshot, completedSentence: activeIndex >= tokens.length };
  }
  const normalizedExpected = normalizeComparableToken(tokens[activeIndex] || "");
  if (!normalizedExpected) {
    return completeActiveWordInSnapshot(nextSnapshot, tokens);
  }
  const currentLength = normalizeComparableToken(nextSnapshot.currentWordInput).length;
  const nextInput = normalizedExpected.slice(0, Math.min(normalizedExpected.length, currentLength + 1));
  nextSnapshot.currentWordInput = nextInput;
  nextSnapshot.wordInputs[activeIndex] = nextInput;
  nextSnapshot.wordStatuses[activeIndex] = "active";
  if (nextInput.length >= normalizedExpected.length) {
    return completeActiveWordInSnapshot(nextSnapshot, tokens);
  }
  return { snapshot: nextSnapshot, completedSentence: false };
}

function applyReplayAssistanceToSnapshot(snapshot, tokens, assistance) {
  let nextSnapshot = cloneWordSnapshot(snapshot.activeWordIndex, snapshot.currentWordInput, snapshot.wordInputs, snapshot.wordStatuses);
  let completedSentence = nextSnapshot.activeWordIndex >= tokens.length;

  if (Number(assistance?.revealWordCount || 0) > 0) {
    for (let count = 0; count < assistance.revealWordCount; count += 1) {
      const result = completeActiveWordInSnapshot(nextSnapshot, tokens);
      nextSnapshot = result.snapshot;
      completedSentence = result.completedSentence;
      if (completedSentence) break;
    }
    return { snapshot: nextSnapshot, completedSentence };
  }

  if (Number(assistance?.revealLetterCount || 0) > 0) {
    for (let count = 0; count < assistance.revealLetterCount; count += 1) {
      const result = revealLetterInSnapshot(nextSnapshot, tokens);
      nextSnapshot = result.snapshot;
      completedSentence = result.completedSentence;
      if (completedSentence) break;
    }
  }

  return { snapshot: nextSnapshot, completedSentence };
}

function readTimeMs(value, { seconds = false } = {}) {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.round(seconds ? raw * 1000 : raw));
}

function getWordBeginMs(item = {}) {
  if (item.begin_ms != null) return readTimeMs(item.begin_ms);
  if (item.begin_time != null) return readTimeMs(item.begin_time);
  if (item.start_ms != null) return readTimeMs(item.start_ms);
  if (item.start_time != null) return readTimeMs(item.start_time);
  if (item.start != null) return readTimeMs(item.start, { seconds: true });
  return 0;
}

function getWordEndMs(item = {}) {
  if (item.end_ms != null) return readTimeMs(item.end_ms);
  if (item.end_time != null) return readTimeMs(item.end_time);
  if (item.stop_ms != null) return readTimeMs(item.stop_ms);
  if (item.stop_time != null) return readTimeMs(item.stop_time);
  if (item.end != null) return readTimeMs(item.end, { seconds: true });
  if (item.stop != null) return readTimeMs(item.stop, { seconds: true });
  return 0;
}

function toReplayWordItem(item) {
  const surface = String(item?.surface || item?.text || item?.word || "").trim();
  const beginMs = getWordBeginMs(item);
  const endMs = getWordEndMs(item);
  if (!surface || endMs <= beginMs) {
    return null;
  }
  return {
    surface,
    normalized: normalizeComparableToken(surface),
    beginMs,
    endMs,
  };
}

function collectReplayWords(asrPayload = {}) {
  const output = [];
  const transcripts = Array.isArray(asrPayload?.transcripts) ? asrPayload.transcripts : [];
  const directSentences = Array.isArray(asrPayload?.sentences) ? asrPayload.sentences : [];

  function pushWords(wordItems) {
    for (const item of Array.isArray(wordItems) ? wordItems : []) {
      const replayWord = toReplayWordItem(item);
      if (replayWord) {
        output.push(replayWord);
      }
    }
  }

  pushWords(asrPayload?.words);
  for (const transcript of transcripts) {
    pushWords(transcript?.words);
    for (const sentence of Array.isArray(transcript?.sentences) ? transcript.sentences : []) {
      pushWords(sentence?.words);
    }
  }
  for (const sentence of directSentences) {
    pushWords(sentence?.words);
  }

  const deduped = [];
  const seen = new Set();
  for (const item of output.sort((left, right) => left.beginMs - right.beginMs || left.endMs - right.endMs || left.surface.localeCompare(right.surface))) {
    const dedupeKey = `${item.beginMs}:${item.endMs}:${item.surface}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    deduped.push(item);
  }
  return deduped;
}

function alignSentenceTokenTimings(tokens, candidateWords) {
  const safeTokens = Array.isArray(tokens) ? tokens : [];
  const timings = safeTokens.map(() => null);
  let cursor = 0;
  for (let tokenIndex = 0; tokenIndex < safeTokens.length; tokenIndex += 1) {
    const expected = normalizeComparableToken(safeTokens[tokenIndex]);
    if (!expected) continue;
    while (cursor < candidateWords.length) {
      const candidate = candidateWords[cursor];
      cursor += 1;
      if (!candidate?.normalized) continue;
      if (candidate.normalized === expected) {
        timings[tokenIndex] = {
          beginMs: candidate.beginMs,
          endMs: candidate.endMs,
          surface: candidate.surface,
        };
        break;
      }
    }
  }
  return timings;
}

function buildSentenceWordTimingMap(sentences, asrPayload) {
  if (!Array.isArray(sentences) || !sentences.length) {
    return [];
  }
  const replayWords = collectReplayWords(asrPayload);
  if (!replayWords.length) {
    return sentences.map(() => ({ tokenTimings: [], matchedCount: 0 }));
  }

  return sentences.map((sentence) => {
    const sentenceStartMs = Math.max(0, Number(sentence?.begin_ms || 0));
    const sentenceEndMs = Math.max(sentenceStartMs + 1, Number(sentence?.end_ms || 0));
    const candidateWords = replayWords.filter(
      (item) => item.endMs >= sentenceStartMs - WORD_TIMING_TOLERANCE_MS && item.beginMs <= sentenceEndMs + WORD_TIMING_TOLERANCE_MS,
    );
    const tokenTimings = alignSentenceTokenTimings(sentence?.tokens || [], candidateWords);
    return {
      tokenTimings,
      matchedCount: tokenTimings.filter(Boolean).length,
    };
  });
}

function resolveReplayBoundaryMs(sentence, sentenceTiming, activeWordIndex) {
  const sentenceStartMs = Math.max(0, Number(sentence?.begin_ms || 0));
  if (activeWordIndex <= 0) {
    return sentenceStartMs;
  }
  const tokenTimings = Array.isArray(sentenceTiming?.tokenTimings) ? sentenceTiming.tokenTimings : [];
  for (let idx = activeWordIndex - 1; idx >= 0; idx -= 1) {
    if (tokenTimings[idx]?.endMs) {
      return tokenTimings[idx].endMs;
    }
  }
  for (let idx = activeWordIndex; idx < tokenTimings.length; idx += 1) {
    if (tokenTimings[idx]?.beginMs) {
      return tokenTimings[idx].beginMs;
    }
  }
  return null;
}

function buildReplayPlaybackPlan(sentence, sentenceTiming, activeWordIndex, tailRate) {
  const sentenceStartMs = Math.max(0, Number(sentence?.begin_ms || 0));
  const sentenceEndMs = Math.max(sentenceStartMs + 1, Number(sentence?.end_ms || 0));
  const resolvedBoundaryMs = resolveReplayBoundaryMs(sentence, sentenceTiming, activeWordIndex);
  const safeTailRate = Math.max(0.4, Math.min(1, Number(tailRate || 1)));
  const tailWindowMs = resolvedBoundaryMs ? Math.max(0, sentenceEndMs - resolvedBoundaryMs) : sentenceEndMs - sentenceStartMs;

  if (!resolvedBoundaryMs) {
    return {
      initialRate: safeTailRate,
      rateSteps: [],
      preciseBoundary: false,
      tailBoundaryMs: sentenceStartMs,
      tailWindowMs,
      speedMode: safeTailRate < 1 ? "full_sentence_fallback" : "normal",
      fallbackReason: "boundary_missing",
    };
  }

  if (resolvedBoundaryMs <= sentenceStartMs + 30) {
    return {
      initialRate: safeTailRate,
      rateSteps: [],
      preciseBoundary: true,
      tailBoundaryMs: resolvedBoundaryMs,
      tailWindowMs,
      speedMode: safeTailRate < 1 ? "full_sentence_fallback" : "normal",
      fallbackReason: "boundary_near_start",
    };
  }

  if (safeTailRate < 1 && tailWindowMs < MIN_PERCEPTIBLE_SLOWDOWN_WINDOW_MS) {
    return {
      initialRate: safeTailRate,
      rateSteps: [],
      preciseBoundary: true,
      tailBoundaryMs: resolvedBoundaryMs,
      tailWindowMs,
      speedMode: "full_sentence_fallback",
      fallbackReason: "tail_window_too_short",
    };
  }

  return {
    initialRate: 1,
    rateSteps: [
      {
        atSec: (resolvedBoundaryMs - sentenceStartMs) / 1000,
        rate: safeTailRate,
      },
    ],
    preciseBoundary: true,
    tailBoundaryMs: resolvedBoundaryMs,
    tailWindowMs,
    speedMode: safeTailRate < 1 ? "tail_only" : "normal",
    fallbackReason: "",
  };
}

function isEditableShortcutTarget(target) {
  if (!target) return false;
  if (target?.isContentEditable) return true;
  const tagName = String(target?.tagName || "").toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select";
}

function resolveMediaModeFromFileName(fileName) {
  if (isAudioFilename(fileName)) {
    return "audio";
  }
  // Unknown extensions should still try loading main media once.
  return "video";
}

function inferMediaModeFromContentType(contentType) {
  const normalized = String(contentType || "").toLowerCase();
  if (normalized.startsWith("video/")) {
    return "video";
  }
  if (normalized.startsWith("audio/")) {
    return "audio";
  }
  return "";
}

function inferMediaTypeFromFileName(fileName) {
  const ext = getMediaExt(fileName);
  return MEDIA_TYPE_BY_EXTENSION[ext] || "";
}

function resolveMediaModeByTypeAndName(mediaType, fileName) {
  const byType = inferMediaModeFromContentType(mediaType);
  if (byType) {
    return byType;
  }
  return resolveMediaModeFromFileName(fileName);
}

function isLocalMediaRequiredPayload(resp, payload) {
  return Number(resp?.status) === 409 && String(payload?.error_code || "").trim() === LOCAL_MEDIA_REQUIRED_CODE;
}

async function readErrorPayload(resp) {
  try {
    return await resp.clone().json();
  } catch (_) {
    return {};
  }
}

function formatMediaLoadError(resp, payload) {
  const statusText = Number(resp?.status) > 0 ? String(resp.status) : "";
  const errorCode = String(payload?.error_code || "").trim();
  const message = String(payload?.message || "").trim();
  const head = [statusText, errorCode].filter(Boolean).join(" ");
  if (head && message) {
    return `媒体加载失败（${head}: ${message}）。`;
  }
  if (head) {
    return `媒体加载失败（${head}）。`;
  }
  if (message) {
    return `媒体加载失败（${message}）。`;
  }
  return "媒体加载失败。";
}

export function ImmersiveLessonPage({
  lesson,
  accessToken,
  apiClient,
  onBack,
  onProgressSynced,
  onWordbookChanged,
  immersiveActive = false,
  onExitImmersive,
  onStartImmersive,
  externalMediaReloadToken = 0,
}) {
  const [phase, setPhase] = useState("idle");
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
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0);
  const [completedIndexes, setCompletedIndexes] = useState([]);
  const [activeWordIndex, setActiveWordIndex] = useState(0);
  const [currentWordInput, setCurrentWordInput] = useState("");
  const [wordInputs, setWordInputs] = useState([]);
  const [wordStatuses, setWordStatuses] = useState([]);
  const [learningSettings] = useState(() => readLearningSettings());
  const [sentenceTypingDone, setSentenceTypingDone] = useState(false);
  const [sentencePlaybackDone, setSentencePlaybackDone] = useState(false);
  const [sentencePlaybackRequired, setSentencePlaybackRequired] = useState(true);
  const [postAnswerReplayState, setPostAnswerReplayState] = useState("idle");
  const [translationDisplayMode, setTranslationDisplayMode] = useState("previous");
  const [wordbookBusy, setWordbookBusy] = useState(false);
  const [wordbookSelectedTokenIndexes, setWordbookSelectedTokenIndexes] = useState([]);
  const [isCinemaFullscreen, setIsCinemaFullscreen] = useState(false);
  const [isFullscreenFallback, setIsFullscreenFallback] = useState(false);
  const [showFullscreenPreviousSentence, setShowFullscreenPreviousSentence] = useState(
    () => readLearningSettings().uiPreferences?.showFullscreenPreviousSentence ?? false,
  );
  const [cinemaControlsIdle, setCinemaControlsIdle] = useState(false);

  const immersiveContainerRef = useRef(null);
  const mediaElementRef = useRef(null);
  const clipAudioRef = useRef(null);
  const typingInputRef = useRef(null);
  const bindingInputRef = useRef(null);
  const cinemaControlsIdleTimerRef = useRef(null);
  const currentWordInputRef = useRef("");
  const activeWordIndexRef = useRef(0);
  const wordInputsRef = useRef([]);
  const wordStatusesRef = useRef([]);
  const sentenceAdvanceLockedRef = useRef(false);
  const wordbookPointerGestureRef = useRef({
    pointerId: null,
    pressTokenIndex: null,
    longPressActive: false,
    longPressTimerId: null,
    sweepTokenIndex: null,
  });
  const playbackKindRef = useRef("initial");
  const replayAssistStageRef = useRef(0);
  const replayProgressAnchorRef = useRef(0);
  const autoFullscreenAttemptKeyRef = useRef("");
  const programmaticFullscreenExitRef = useRef(false);
  const programmaticFullscreenExitTimerRef = useRef(null);
  const cinemaFullscreenActive = isCinemaFullscreen || isFullscreenFallback;
  const showPreviousSentenceBlock = !cinemaFullscreenActive || showFullscreenPreviousSentence;
  const hasExitHandler = typeof onExitImmersive === "function" || typeof onBack === "function";
  const typingEnabled =
    immersiveActive && Boolean(lesson?.sentences?.[currentSentenceIndex]) && phase !== "transition" && phase !== "lesson_completed";

  const clearCinemaControlsIdleTimer = useCallback(() => {
    if (typeof window === "undefined") return;
    if (cinemaControlsIdleTimerRef.current === null) return;
    window.clearTimeout(cinemaControlsIdleTimerRef.current);
    cinemaControlsIdleTimerRef.current = null;
  }, []);

  const focusTypingInput = useCallback(() => {
    if (!typingEnabled) return;
    requestAnimationFrame(() => {
      const input = typingInputRef.current;
      if (!input) return;
      input.focus({ preventScroll: true });
      const len = String(input.value || "").length;
      try {
        input.setSelectionRange(len, len);
      } catch (_) {
        // Ignore selection errors for unsupported input types/browsers.
      }
    });
  }, [typingEnabled]);

  const wakeCinemaControls = useCallback(() => {
    if (!cinemaFullscreenActive || typeof window === "undefined") return;
    setCinemaControlsIdle((current) => (current ? false : current));
    clearCinemaControlsIdleTimer();
    cinemaControlsIdleTimerRef.current = window.setTimeout(() => {
      cinemaControlsIdleTimerRef.current = null;
      setCinemaControlsIdle(true);
    }, CINEMA_CONTROLS_IDLE_MS);
  }, [cinemaFullscreenActive, clearCinemaControlsIdleTimer]);

  const clearProgrammaticFullscreenExit = useCallback(() => {
    programmaticFullscreenExitRef.current = false;
    if (typeof window === "undefined") return;
    if (programmaticFullscreenExitTimerRef.current !== null) {
      window.clearTimeout(programmaticFullscreenExitTimerRef.current);
      programmaticFullscreenExitTimerRef.current = null;
    }
  }, []);

  const markProgrammaticFullscreenExit = useCallback(() => {
    programmaticFullscreenExitRef.current = true;
    if (typeof window === "undefined") return;
    if (programmaticFullscreenExitTimerRef.current !== null) {
      window.clearTimeout(programmaticFullscreenExitTimerRef.current);
    }
    programmaticFullscreenExitTimerRef.current = window.setTimeout(() => {
      programmaticFullscreenExitRef.current = false;
      programmaticFullscreenExitTimerRef.current = null;
    }, PROGRAMMATIC_FULLSCREEN_EXIT_RESET_MS);
  }, []);

  const currentSentence = lesson?.sentences?.[currentSentenceIndex] || null;
  const previousSentence = currentSentenceIndex > 0 ? lesson?.sentences?.[currentSentenceIndex - 1] || null : null;
  const currentSentenceEn = currentSentence?.text_en || "(当前句英文暂缺)";
  const currentSentenceZh = currentSentence ? currentSentence.text_zh || "(当前句中文翻译暂缺)" : "(暂无当前句中文翻译)";
  const previousSentenceEn = previousSentence?.text_en || "(当前是第一句，无上一句)";
  const previousSentenceZh = previousSentence
    ? previousSentence.text_zh || "(翻译失败，暂缺)"
    : "(暂无上一句中文翻译)";
  const autoReplayAnsweredSentence = learningSettings.playbackPreferences?.autoReplayAnsweredSentence !== false;
  const translationHeading = translationDisplayMode === "current_answered" ? "本句" : "上一句";
  const translationEn = translationDisplayMode === "current_answered" ? currentSentenceEn : previousSentenceEn;
  const translationZh = translationDisplayMode === "current_answered" ? currentSentenceZh : previousSentenceZh;
  const expectedTokens = useMemo(() => (Array.isArray(currentSentence?.tokens) ? currentSentence.tokens : []), [currentSentence?.tokens]);
  const previousSentenceTokens = useMemo(
    () => buildSelectableSentenceTokens(previousSentence),
    [previousSentence?.text_en, previousSentence?.tokens],
  );
  const hasWordbookAccess = Boolean(accessToken && lesson?.id);
  const canRenderInteractiveWordbook = Boolean(
    hasWordbookAccess &&
      previousSentence &&
      previousSentenceTokens.length > 0 &&
      translationDisplayMode === "previous" &&
      showPreviousSentenceBlock,
  );
  const hasWordbookSelection = wordbookSelectedTokenIndexes.length > 0;
  const selectedWordbookStart = hasWordbookSelection ? wordbookSelectedTokenIndexes[0] : -1;
  const selectedWordbookEnd = hasWordbookSelection ? wordbookSelectedTokenIndexes[wordbookSelectedTokenIndexes.length - 1] : -1;
  const selectedWordbookTokens = useMemo(
    () =>
      wordbookSelectedTokenIndexes
        .map((tokenIndex) => previousSentenceTokens[tokenIndex])
        .filter((token) => typeof token === "string" && token.length > 0),
    [previousSentenceTokens, wordbookSelectedTokenIndexes],
  );
  const selectedWordbookText = selectedWordbookTokens.join(" ");
  const sentenceWordTimingMap = useMemo(
    () => buildSentenceWordTimingMap(lesson?.sentences || [], lesson?.subtitle_cache_seed?.asr_payload || null),
    [lesson?.sentences, lesson?.subtitle_cache_seed?.asr_payload],
  );
  const currentSentenceTiming = sentenceWordTimingMap[currentSentenceIndex] || null;
  const sentenceCount = lesson?.sentences?.length || 0;
  const expectedSourceDurationSec = Math.max(0, Number(lesson?.source_duration_ms || 0) / 1000);

  const { playKeySound, playWrongSound, playCorrectSound } = useTypingFeedbackSounds();

  const persistFullscreenPreviousSentencePreference = useCallback((nextVisible) => {
    const safeVisible = Boolean(nextVisible);
    setShowFullscreenPreviousSentence(safeVisible);
    const currentSettings = readLearningSettings();
    writeLearningSettings({
      ...currentSettings,
      uiPreferences: {
        ...currentSettings.uiPreferences,
        showFullscreenPreviousSentence: safeVisible,
      },
    });
  }, []);

  const resetSentenceGate = useCallback((playbackRequired = true) => {
    sentenceAdvanceLockedRef.current = false;
    playbackKindRef.current = "initial";
    setSentenceTypingDone(false);
    setSentencePlaybackDone(false);
    setSentencePlaybackRequired(Boolean(playbackRequired));
    setPostAnswerReplayState("idle");
    setTranslationDisplayMode("previous");
    replayAssistStageRef.current = 0;
    replayProgressAnchorRef.current = 0;
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

  const clearWordbookSelection = useCallback(() => {
    setWordbookSelectedTokenIndexes([]);
  }, []);

  const clearWordbookGestureTimer = useCallback(() => {
    if (typeof window === "undefined") return;
    const gesture = wordbookPointerGestureRef.current;
    if (gesture.longPressTimerId !== null) {
      window.clearTimeout(gesture.longPressTimerId);
      gesture.longPressTimerId = null;
    }
  }, []);

  const resetWordbookPointerGesture = useCallback(() => {
    clearWordbookGestureTimer();
    const gesture = wordbookPointerGestureRef.current;
    gesture.pointerId = null;
    gesture.pressTokenIndex = null;
    gesture.longPressActive = false;
    gesture.sweepTokenIndex = null;
  }, [clearWordbookGestureTimer]);

  const toggleWordbookTokenSelection = useCallback((tokenIndex) => {
    if (!Number.isInteger(tokenIndex)) return;
    setWordbookSelectedTokenIndexes((current) => toggleWordbookTokenIndex(current, tokenIndex));
  }, []);

  const collectWordbookEntry = useCallback(
    async ({ sentence, entryType, entryText, startTokenIndex, endTokenIndex }) => {
      if (!lesson?.id || !sentence || !accessToken) return;
      setWordbookBusy(true);
      try {
        const resp = await apiClient(
          "/api/wordbook/collect",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              lesson_id: lesson.id,
              sentence_index: sentence.idx,
              entry_text: entryText,
              entry_type: entryType,
              start_token_index: startTokenIndex,
              end_token_index: endTokenIndex,
            }),
          },
          accessToken,
        );
        const data = await parseResponse(resp);
        if (!resp.ok) {
          toast.error(toErrorText(data, "加入生词本失败"));
          return;
        }
        toast.success(data.message || (data.created ? "已加入生词本" : "已更新到最新语境"));
        onWordbookChanged?.();
        clearWordbookSelection();
      } catch (error) {
        toast.error(`网络错误: ${String(error)}`);
      } finally {
        setWordbookBusy(false);
      }
    },
    [accessToken, apiClient, clearWordbookSelection, lesson?.id, onWordbookChanged],
  );

  const handleWordbookTokenPointerDown = useCallback(
    (event, tokenIndex) => {
      if (!canRenderInteractiveWordbook || wordbookBusy) return;
      if (typeof event.button === "number" && event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const pointerId = event.pointerId;
      const gesture = wordbookPointerGestureRef.current;
      if (gesture.pointerId !== null && gesture.pointerId !== pointerId) {
        return;
      }
      clearWordbookGestureTimer();
      gesture.pointerId = pointerId;
      gesture.pressTokenIndex = tokenIndex;
      gesture.longPressActive = false;
      gesture.sweepTokenIndex = null;
      gesture.longPressTimerId = window.setTimeout(() => {
        const nextGesture = wordbookPointerGestureRef.current;
        if (nextGesture.pointerId !== pointerId || nextGesture.pressTokenIndex !== tokenIndex) return;
        nextGesture.longPressActive = true;
        nextGesture.sweepTokenIndex = tokenIndex;
        toggleWordbookTokenSelection(tokenIndex);
      }, WORDBOOK_LONG_PRESS_MS);
    },
    [canRenderInteractiveWordbook, clearWordbookGestureTimer, toggleWordbookTokenSelection, wordbookBusy],
  );

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return undefined;

    const handlePointerMove = (event) => {
      const gesture = wordbookPointerGestureRef.current;
      if (gesture.pointerId === null || gesture.pointerId !== event.pointerId || !gesture.longPressActive) {
        return;
      }
      const tokenElement = document.elementFromPoint(event.clientX, event.clientY)?.closest?.("[data-wordbook-token-index]");
      if (!tokenElement) {
        gesture.sweepTokenIndex = null;
        return;
      }
      const nextTokenIndex = Number(tokenElement.getAttribute("data-wordbook-token-index"));
      if (!Number.isInteger(nextTokenIndex)) return;
      if (gesture.sweepTokenIndex === nextTokenIndex) return;
      gesture.sweepTokenIndex = nextTokenIndex;
      toggleWordbookTokenSelection(nextTokenIndex);
    };

    const handlePointerUp = (event) => {
      const gesture = wordbookPointerGestureRef.current;
      if (gesture.pointerId === null || gesture.pointerId !== event.pointerId) return;
      const pressTokenIndex = gesture.pressTokenIndex;
      const longPressActive = gesture.longPressActive;
      resetWordbookPointerGesture();
      if (!Number.isInteger(pressTokenIndex)) return;
      if (!longPressActive) {
        toggleWordbookTokenSelection(pressTokenIndex);
      }
    };

    const handlePointerCancel = (event) => {
      const gesture = wordbookPointerGestureRef.current;
      if (gesture.pointerId === null || gesture.pointerId !== event.pointerId) return;
      resetWordbookPointerGesture();
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
      resetWordbookPointerGesture();
    };
  }, [resetWordbookPointerGesture, toggleWordbookTokenSelection]);

  useEffect(() => {
    clearWordbookSelection();
    resetWordbookPointerGesture();
  }, [clearWordbookSelection, currentSentence?.idx, lesson?.id, resetWordbookPointerGesture]);

  useEffect(() => {
    if (canRenderInteractiveWordbook) return;
    clearWordbookSelection();
    resetWordbookPointerGesture();
  }, [canRenderInteractiveWordbook, clearWordbookSelection, resetWordbookPointerGesture]);

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
    wordStatusesRef.current = wordStatuses;
  }, [wordStatuses]);

  useEffect(() => {
    if (activeWordIndex > replayProgressAnchorRef.current) {
      replayProgressAnchorRef.current = activeWordIndex;
      replayAssistStageRef.current = 0;
      debugImmersiveLog("replay_stage_reset.progress", {
        sentenceIndex: currentSentenceIndex,
        activeWordIndex,
      });
    }
  }, [activeWordIndex, currentSentenceIndex]);

  const handleSentencePassed = useCallback(async () => {
    if (!lesson || !currentSentence) return;

    const nextCompleted = Array.from(new Set([...completedIndexes, currentSentence.idx])).sort((a, b) => a - b);
    setCompletedIndexes(nextCompleted);

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
      setPhase("lesson_completed");
      return;
    }

    resetWordTyping(lesson?.sentences?.[nextIdx], true);
    setCurrentSentenceIndex(nextIdx);
    setPhase("auto_play_pending");
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
    setSentencePlaybackDone(true);
    if (playbackKind === "answer_completed_replay") {
      setPostAnswerReplayState("completed");
      return;
    }
    if (!expectedTokens.length) {
      setSentenceTypingDone(true);
      return;
    }
    setPhase("typing");
  }, [currentSentenceIndex, expectedTokens.length, sentenceTypingDone]);

  const { isPlaying, isPlaybackPaused, currentPlaybackRate, playSentence, stopPlayback, togglePausePlayback, onMainMediaTimeUpdate } =
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
      if (needsBinding) {
        setMediaError("当前课程缺少可播放媒体，请先在历史记录中恢复视频。");
        setSentencePlaybackRequired(false);
        if (!expectedTokens.length) {
          setSentenceTypingDone(true);
        }
        setPhase("typing");
        return;
      }
      debugImmersiveLog("playback_start", {
        playbackKind,
        source,
        sentenceIndex: currentSentenceIndex,
        playbackPlan,
      });
      const result = await playSentence(currentSentence, playbackPlan);
      if (result.ok) {
        playbackKindRef.current = playbackKind;
        setSentencePlaybackRequired(true);
        setSentencePlaybackDone(false);
        setMediaError("");
        setPhase("playing");
        debugImmersiveLog("playback_started", { playbackKind, sentenceIndex: currentSentenceIndex });
        return;
      }
      if (result.reason === "clip_unavailable") {
        setNeedsBinding(true);
        setSentencePlaybackRequired(false);
        if (!expectedTokens.length) {
          setSentenceTypingDone(true);
        }
        setMediaError("本句服务器音频不可用，请先在历史记录中恢复视频。");
        setPhase("typing");
        return;
      }
      if (result.reason === "autoplay_blocked") {
        setSentencePlaybackRequired(false);
        if (!expectedTokens.length) {
          setSentenceTypingDone(true);
        }
        setPhase("typing");
        setMediaError(
          manual
            ? `浏览器仍阻止自动播放。你可以继续输入，或稍后按 ${replayShortcutLabel} 手动重播本句。`
            : `自动播放受限。你可以直接输入，或按 ${replayShortcutLabel} 手动播放本句。`,
        );
        return;
      }
      setSentencePlaybackRequired(false);
      if (!expectedTokens.length) {
        setSentenceTypingDone(true);
      }
      setMediaError("当前句播放失败，已切换为输入模式。");
      setPhase("typing");
    },
    [currentSentence, currentSentenceIndex, expectedTokens.length, learningSettings.shortcuts.replay_sentence, needsBinding, playSentence],
  );

  const startAnswerCompletedReplay = useCallback(async () => {
    if (!currentSentence) {
      setPostAnswerReplayState("completed");
      return;
    }

    setPostAnswerReplayState("replaying");
    setSentencePlaybackDone(false);
    playbackKindRef.current = "answer_completed_replay";
    setPhase("playing");
    setMediaError("");
    debugImmersiveLog("answer_completed_replay.start", {
      sentenceIndex: currentSentenceIndex,
    });

    const result = await playSentence(currentSentence, { initialRate: 1, rateSteps: [] });
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
    setPostAnswerReplayState("completed");
    setSentencePlaybackDone(true);
    setPhase("typing");
  }, [currentSentence, currentSentenceIndex, playSentence]);

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

    const savedIdx = Number.isInteger(lesson?.progress?.current_sentence_index) ? lesson.progress.current_sentence_index : 0;
    const safeIdx = Math.min(Math.max(savedIdx, 0), Math.max(0, (lesson?.sentences?.length || 1) - 1));
    const savedCompleted = Array.isArray(lesson?.progress?.completed_sentence_indexes)
      ? Array.from(new Set(lesson.progress.completed_sentence_indexes)).sort((a, b) => a - b)
      : [];
    setCurrentSentenceIndex(safeIdx);
    setCompletedIndexes(savedCompleted);
    resetWordTyping(lesson?.sentences?.[safeIdx], true);
    setPhase("idle");

    const fileName = String(lesson.source_filename || "");
    const preferredMode = isVideoFilename(fileName) ? "video" : resolveMediaModeFromFileName(fileName);
    setMediaMode(preferredMode);
  }, [lesson?.id, resetWordTyping, stopPlayback]);

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
            setMediaError("服务器媒体不可用，请先在历史记录中恢复视频。");
          } else {
            setNeedsBinding(true);
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
    setPhase("auto_play_pending");
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
    setTranslationDisplayMode("current_answered");
    setPostAnswerReplayState((current) => (current === "idle" ? "waiting_initial_finish" : current));
  }, [autoReplayAnsweredSentence, immersiveActive, sentenceTypingDone]);

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
    focusTypingInput();
  }, [activeWordIndex, currentSentenceIndex, focusTypingInput, typingEnabled]);

  useEffect(() => {
    if (!typingEnabled || !immersiveActive) return undefined;
    if (typeof window === "undefined") return undefined;

    const onPointerDownCapture = () => {
      setTimeout(() => {
        focusTypingInput();
      }, 0);
    };

    window.addEventListener("pointerdown", onPointerDownCapture, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDownCapture, true);
    };
  }, [focusTypingInput, immersiveActive, typingEnabled]);

  useEffect(() => {
    if (!immersiveActive) return;
    if (!sentenceTypingDone) return;
    if (autoReplayAnsweredSentence) {
      if (postAnswerReplayState !== "completed") return;
    } else if (sentencePlaybackRequired && !sentencePlaybackDone) {
      return;
    }
    if (sentenceAdvanceLockedRef.current) return;
    sentenceAdvanceLockedRef.current = true;
    setPhase("transition");
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
  ]);

  useEffect(() => {
    if (immersiveActive) return;
    stopPlayback();
    setPhase("idle");
    setPostAnswerReplayState("idle");
    setTranslationDisplayMode("previous");
  }, [immersiveActive, stopPlayback]);

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
    setPhase("typing");
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
        setSentenceTypingDone(true);
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
      if (isCinemaFullscreen || isFullscreenFallback) {
        if (isCinemaFullscreen) {
          markProgrammaticFullscreenExit();
        }
        await exitElementFullscreen().catch(() => {});
        setIsCinemaFullscreen(false);
        setIsFullscreenFallback(false);
      }
      handler(source);
    },
    [isCinemaFullscreen, isFullscreenFallback, markProgrammaticFullscreenExit, onBack, onExitImmersive],
  );

  const exitCinemaFullscreen = useCallback(async () => {
    await exitImmersive("button_exit_fullscreen");
  }, [exitImmersive]);

  const enterCinemaFullscreen = useCallback(async ({ source = "manual", showFailureToast = false } = {}) => {
    if (!immersiveActive) return { ok: false, reason: "immersive_inactive" };
    if (isCinemaFullscreen || isFullscreenFallback) return { ok: true, reason: "already_active" };

    setShowFullscreenPreviousSentence(false);
    const container = immersiveContainerRef.current;
    if (!container) return { ok: false, reason: "fullscreen_target_missing" };

    debugImmersiveLog("cinema_fullscreen.request", { source, lessonId: lesson?.id });
    setIsFullscreenFallback(true);
    try {
      await requestElementFullscreen(container);
      setIsFullscreenFallback(false);
      setIsCinemaFullscreen(true);
      debugImmersiveLog("cinema_fullscreen.success", { source, lessonId: lesson?.id });
      return { ok: true, reason: "system_fullscreen" };
    } catch (error) {
      setIsCinemaFullscreen(false);
      setIsFullscreenFallback(true);
      debugImmersiveLog("cinema_fullscreen.fallback", {
        source,
        lessonId: lesson?.id,
        error: String(error),
      });
      if (showFailureToast) {
        toast.warning("浏览器拦截了全屏，请再点一次并允许全屏；本次已先进入铺满学习模式。");
      }
      return { ok: false, reason: "fallback_active", error };
    }
  }, [immersiveActive, isCinemaFullscreen, isFullscreenFallback, lesson?.id]);

  const jumpToSentence = useCallback(
    async (targetIndex, source = "manual") => {
      if (!lesson || sentenceCount <= 0) return;
      const safeTarget = Math.max(0, Math.min(sentenceCount - 1, Number(targetIndex) || 0));
      if (safeTarget === currentSentenceIndex) return;

      stopPlayback();
      setPhase(immersiveActive ? "auto_play_pending" : "idle");
      setCurrentSentenceIndex(safeTarget);
      resetWordTyping(lesson?.sentences?.[safeTarget], true);
      await syncProgress(safeTarget, completedIndexes, lesson?.sentences?.[safeTarget]?.begin_ms || 0);
      onProgressSynced?.();
    },
    [completedIndexes, currentSentenceIndex, immersiveActive, lesson, onProgressSynced, resetWordTyping, sentenceCount, stopPlayback, syncProgress],
  );

  const goToPreviousSentence = useCallback(
    (source = "button_prev") => {
      if (currentSentenceIndex <= 0) return;
      void jumpToSentence(currentSentenceIndex - 1, source);
    },
    [currentSentenceIndex, jumpToSentence],
  );

  const goToNextSentence = useCallback(
    (source = "button_next") => {
      if (currentSentenceIndex >= sentenceCount - 1) return;
      void jumpToSentence(currentSentenceIndex + 1, source);
    },
    [currentSentenceIndex, jumpToSentence, sentenceCount],
  );

  const revealCurrentLetter = useCallback(
    (source = "button_reveal_letter") => {
      if (!typingEnabled) return activeWordIndexRef.current;
      const result = applyReplayAssistanceToSnapshot(
        cloneWordSnapshot(activeWordIndexRef.current, currentWordInputRef.current, wordInputsRef.current, wordStatusesRef.current),
        expectedTokens,
        { revealLetterCount: 1, revealWordCount: 0 },
      );
      applyWordSnapshot(result.snapshot);
      if (result.completedSentence) {
        setSentenceTypingDone(true);
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
      const expected = expectedTokens[activeWordIndexRef.current] || "";
      if (!expected) return activeWordIndexRef.current;
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
      const nextStage = replayAssistStageRef.current + 1;
      const assistance = resolveReplayAssistance(learningSettings, nextStage);
      const assistedSnapshot = applyReplayAssistanceToSnapshot(
        cloneWordSnapshot(activeWordIndexRef.current, currentWordInputRef.current, wordInputsRef.current, wordStatusesRef.current),
        expectedTokens,
        assistance,
      );
      applyWordSnapshot(assistedSnapshot.snapshot);
      if (assistedSnapshot.completedSentence) {
        setSentenceTypingDone(true);
      }
      replayAssistStageRef.current = nextStage;
      const playbackPlan = buildReplayPlaybackPlan(
        currentSentence,
        currentSentenceTiming,
        assistedSnapshot.snapshot.activeWordIndex,
        assistance.tailRate,
      );
      debugImmersiveLog("manual_replay", {
        source,
        sentenceIndex: currentSentenceIndex,
        stage: nextStage,
        assistance,
        tailRate: assistance.tailRate,
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
      applyWordSnapshot,
      currentSentence,
      currentSentenceIndex,
      currentSentenceTiming,
      expectedTokens,
      learningSettings,
      mediaLoading,
      needsBinding,
      phase,
      tryPlayCurrentSentence,
    ],
  );

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
        setPhase(result.state === "paused" ? "typing" : "playing");
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
    if (typeof document === "undefined") return undefined;

    const syncFullscreenState = () => {
      const fullscreenElement = getFullscreenElement();
      const nextIsCinemaFullscreen = Boolean(immersiveContainerRef.current && fullscreenElement === immersiveContainerRef.current);
      const leftSystemFullscreen = isCinemaFullscreen && !nextIsCinemaFullscreen;
      setIsCinemaFullscreen(nextIsCinemaFullscreen);
      if (!leftSystemFullscreen) {
        return;
      }
      if (programmaticFullscreenExitRef.current) {
        clearProgrammaticFullscreenExit();
        return;
      }
      if (!immersiveActive || !hasExitHandler) {
        return;
      }
      debugImmersiveLog("cinema_fullscreen.exit_via_system", {
        lessonId: lesson?.id,
      });
      void exitImmersive("system_fullscreen_exit");
    };

    document.addEventListener("fullscreenchange", syncFullscreenState);
    document.addEventListener("webkitfullscreenchange", syncFullscreenState);
    document.addEventListener("MSFullscreenChange", syncFullscreenState);
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreenState);
      document.removeEventListener("webkitfullscreenchange", syncFullscreenState);
      document.removeEventListener("MSFullscreenChange", syncFullscreenState);
    };
  }, [clearProgrammaticFullscreenExit, exitImmersive, hasExitHandler, immersiveActive, isCinemaFullscreen, lesson?.id]);

  useEffect(() => {
    if (!immersiveActive) {
      autoFullscreenAttemptKeyRef.current = "";
      return;
    }
    if (!lesson?.id || sentenceCount <= 0) return;

    const attemptKey = `${lesson.id}`;
    if (autoFullscreenAttemptKeyRef.current === attemptKey) return;

    autoFullscreenAttemptKeyRef.current = attemptKey;
    console.debug("[DEBUG] immersive.auto_fullscreen.start", { lessonId: lesson.id });
    void enterCinemaFullscreen({ source: "auto", showFailureToast: true });
  }, [enterCinemaFullscreen, immersiveActive, lesson?.id, sentenceCount]);

  useEffect(() => {
    if (!cinemaFullscreenActive) return undefined;
    if (typeof document === "undefined") return undefined;

    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [cinemaFullscreenActive]);

  useEffect(() => {
    return () => {
      clearCinemaControlsIdleTimer();
    };
  }, [clearCinemaControlsIdleTimer]);

  useEffect(() => {
    return () => {
      clearProgrammaticFullscreenExit();
    };
  }, [clearProgrammaticFullscreenExit]);

  useEffect(() => {
    if (!cinemaFullscreenActive || typeof window === "undefined") {
      clearCinemaControlsIdleTimer();
      setCinemaControlsIdle(false);
      return undefined;
    }

    wakeCinemaControls();
    const markControlsActive = () => {
      wakeCinemaControls();
    };

    window.addEventListener("pointermove", markControlsActive);
    window.addEventListener("pointerdown", markControlsActive);
    window.addEventListener("touchstart", markControlsActive);
    window.addEventListener("keydown", markControlsActive);

    return () => {
      window.removeEventListener("pointermove", markControlsActive);
      window.removeEventListener("pointerdown", markControlsActive);
      window.removeEventListener("touchstart", markControlsActive);
      window.removeEventListener("keydown", markControlsActive);
      clearCinemaControlsIdleTimer();
    };
  }, [cinemaFullscreenActive, clearCinemaControlsIdleTimer, wakeCinemaControls]);

  useEffect(() => {
    if (immersiveActive || !cinemaFullscreenActive) return;
    void (async () => {
      await exitElementFullscreen().catch(() => {});
      setIsCinemaFullscreen(false);
      setIsFullscreenFallback(false);
    })();
  }, [cinemaFullscreenActive, immersiveActive]);

  useEffect(() => {
    if (!typingEnabled || !cinemaFullscreenActive) return;
    focusTypingInput();
  }, [cinemaFullscreenActive, focusTypingInput, typingEnabled]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const onWindowKeyDown = (event) => {
      const fromTypingInput = event.target === typingInputRef.current;
      if (isEditableShortcutTarget(event.target) && !fromTypingInput) return;
      if (!immersiveActive) return;

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        void exitImmersive("shortcut_esc");
        return;
      }
      if (isShortcutPressed(event, learningSettings.shortcuts.replay_sentence)) {
        event.preventDefault();
        event.stopPropagation();
        replayCurrentSentence(`shortcut_${getShortcutLabel(learningSettings.shortcuts.replay_sentence)}`);
        return;
      }
      if (isShortcutPressed(event, learningSettings.shortcuts.toggle_pause_playback)) {
        event.preventDefault();
        event.stopPropagation();
        handleTogglePausePlayback(`shortcut_${getShortcutLabel(learningSettings.shortcuts.toggle_pause_playback)}`);
        return;
      }
      if (isShortcutPressed(event, learningSettings.shortcuts.previous_sentence)) {
        event.preventDefault();
        event.stopPropagation();
        goToPreviousSentence(`shortcut_${getShortcutLabel(learningSettings.shortcuts.previous_sentence)}`);
        return;
      }
      if (isShortcutPressed(event, learningSettings.shortcuts.next_sentence)) {
        event.preventDefault();
        event.stopPropagation();
        goToNextSentence(`shortcut_${getShortcutLabel(learningSettings.shortcuts.next_sentence)}`);
        return;
      }
      if (isShortcutPressed(event, learningSettings.shortcuts.reveal_letter)) {
        event.preventDefault();
        event.stopPropagation();
        revealCurrentLetter(`shortcut_${getShortcutLabel(learningSettings.shortcuts.reveal_letter)}`);
        return;
      }
      if (isShortcutPressed(event, learningSettings.shortcuts.reveal_word)) {
        event.preventDefault();
        event.stopPropagation();
        revealCurrentWord(`shortcut_${getShortcutLabel(learningSettings.shortcuts.reveal_word)}`);
      }
    };

    window.addEventListener("keydown", onWindowKeyDown);
    return () => {
      window.removeEventListener("keydown", onWindowKeyDown);
    };
  }, [
    exitImmersive,
    goToPreviousSentence,
    goToNextSentence,
    immersiveActive,
    learningSettings.shortcuts,
    handleTogglePausePlayback,
    replayCurrentSentence,
    revealCurrentLetter,
    revealCurrentWord,
  ]);

  const handleKeyDown = useCallback(
    (event) => {
      if (!currentSentence) return;

      const key = event.key;
      if (key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        void exitImmersive("shortcut_esc");
        return;
      }
      if (isShortcutPressed(event, learningSettings.shortcuts.replay_sentence)) {
        event.preventDefault();
        event.stopPropagation();
        replayCurrentSentence(`shortcut_${getShortcutLabel(learningSettings.shortcuts.replay_sentence)}`);
        return;
      }
      if (isShortcutPressed(event, learningSettings.shortcuts.toggle_pause_playback)) {
        event.preventDefault();
        event.stopPropagation();
        handleTogglePausePlayback(`shortcut_${getShortcutLabel(learningSettings.shortcuts.toggle_pause_playback)}`);
        return;
      }
      if (isShortcutPressed(event, learningSettings.shortcuts.previous_sentence)) {
        event.preventDefault();
        event.stopPropagation();
        goToPreviousSentence(`shortcut_${getShortcutLabel(learningSettings.shortcuts.previous_sentence)}`);
        return;
      }
      if (isShortcutPressed(event, learningSettings.shortcuts.next_sentence)) {
        event.preventDefault();
        event.stopPropagation();
        goToNextSentence(`shortcut_${getShortcutLabel(learningSettings.shortcuts.next_sentence)}`);
        return;
      }
      if (isShortcutPressed(event, learningSettings.shortcuts.reveal_letter)) {
        event.preventDefault();
        event.stopPropagation();
        revealCurrentLetter(`shortcut_${getShortcutLabel(learningSettings.shortcuts.reveal_letter)}`);
        return;
      }
      if (isShortcutPressed(event, learningSettings.shortcuts.reveal_word)) {
        event.preventDefault();
        event.stopPropagation();
        revealCurrentWord(`shortcut_${getShortcutLabel(learningSettings.shortcuts.reveal_word)}`);
        return;
      }

      if (!typingEnabled) return;

      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      if (key === "Backspace") {
        event.preventDefault();
        playKeySound();
        const currentActiveIndex = activeWordIndexRef.current;
        const nextInput = currentWordInputRef.current.slice(0, -1);
        currentWordInputRef.current = nextInput;
        setCurrentWordInput(nextInput);
        setWordInputs((prev) => {
          const next = [...prev];
          next[currentActiveIndex] = nextInput;
          wordInputsRef.current = next;
          return next;
        });
        setWordStatuses((prev) => {
          const next = [...prev];
          next[currentActiveIndex] = "active";
          wordStatusesRef.current = next;
          return next;
        });
        return;
      }

      if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        playKeySound();
        const currentActiveIndex = activeWordIndexRef.current;
        const expected = expectedTokens[currentActiveIndex] || "";
        if (!expected) return;

        const nextInput = `${currentWordInputRef.current}${key}`;
        currentWordInputRef.current = nextInput;
        setCurrentWordInput(nextInput);
        setWordInputs((prev) => {
          const next = [...prev];
          next[currentActiveIndex] = nextInput;
          wordInputsRef.current = next;
          return next;
        });
        setWordStatuses((prev) => {
          const next = [...prev];
          next[currentActiveIndex] = "active";
          wordStatusesRef.current = next;
          return next;
        });

        const errorCount = countTokenInputErrors(nextInput, expected);
        if (errorCount > 2) {
          commitWrongWord();
          return;
        }

        const normalizedExpected = normalizeComparableToken(expected);
        const normalizedInput = normalizeComparableToken(nextInput);
        if (normalizedInput.length >= normalizedExpected.length) {
          if (normalizedInput === normalizedExpected) {
            commitCorrectWord(nextInput);
          } else {
            commitWrongWord();
          }
        }
      }
    },
    [
      commitCorrectWord,
      commitWrongWord,
      currentSentence,
      exitImmersive,
      expectedTokens,
      goToPreviousSentence,
      goToNextSentence,
      handleTogglePausePlayback,
      learningSettings.shortcuts,
      playKeySound,
      replayCurrentSentence,
      revealCurrentLetter,
      revealCurrentWord,
      typingEnabled,
    ],
  );

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
  const cinemaHeaderControlsClassName = [
    "immersive-header-left",
    cinemaFullscreenActive ? "immersive-header-left--cinema" : "",
    cinemaFullscreenActive && cinemaControlsIdle ? "immersive-header-left--cinema-idle" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const cinemaButtonClassName = cinemaFullscreenActive ? "immersive-cinema-button" : undefined;
  const showPlaybackRateBadge = cinemaFullscreenActive && currentPlaybackRate < 0.999;
  const playbackRateLabel = formatPlaybackRateLabel(currentPlaybackRate);

  return (
    <div
      ref={immersiveContainerRef}
      className={`immersive-page-shell ${cinemaFullscreenActive ? "immersive-page-shell--cinema" : ""} ${
        isFullscreenFallback ? "immersive-page-shell--fallback" : ""
      }`}
    >
      <Card
        className={`immersive-page ${immersiveActive ? "immersive-page--immersive" : ""} ${
          cinemaFullscreenActive ? "immersive-page--cinema" : ""
        }`}
        onClick={focusTypingInput}
      >
        <CardHeader className="immersive-card-header">
          <div className="immersive-header">
            <div className={cinemaHeaderControlsClassName} onMouseEnter={wakeCinemaControls} onFocusCapture={wakeCinemaControls}>
              {immersiveActive && hasExitHandler && !cinemaFullscreenActive ? (
                <Button variant="outline" size="sm" className={cinemaButtonClassName} onClick={() => void exitImmersive("button")}>
                  <ArrowLeft className="size-4" />
                  退出
                </Button>
              ) : null}
              {immersiveActive && cinemaFullscreenActive ? (
                <>
                  {showPlaybackRateBadge ? <Badge variant="secondary">{playbackRateLabel}</Badge> : null}
                  <Button variant="outline" size="sm" className={cinemaButtonClassName} onClick={() => void exitCinemaFullscreen()}>
                    退出学习
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cinemaButtonClassName}
                    onClick={() => persistFullscreenPreviousSentencePreference(!showFullscreenPreviousSentence)}
                  >
                    {showFullscreenPreviousSentence ? "隐藏上一句" : "显示上一句"}
                  </Button>
                </>
              ) : null}
            </div>
            {!cinemaFullscreenActive ? (
              <CardDescription className="immersive-header-progress">
                第 {Math.min(currentSentenceIndex + 1, sentenceCount)} / {sentenceCount} 句
              </CardDescription>
            ) : null}
          </div>
        </CardHeader>

        <CardContent className={`immersive-card-content ${cinemaFullscreenActive ? "immersive-card-content--cinema" : "space-y-4"}`}>
          <div className={`immersive-media ${cinemaFullscreenActive ? "immersive-media--cinema" : ""}`}>
          {!needsBinding && mediaMode === "video" ? (
            <video
              ref={mediaElementRef}
              src={mediaBlobUrl || undefined}
              preload="metadata"
              onLoadedMetadata={() => setMediaReady(true)}
              onCanPlay={() => setMediaReady(true)}
              onError={handleMainMediaError}
              onTimeUpdate={onMainMediaTimeUpdate}
              controls
              controlsList="nofullscreen"
              playsInline
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

          </div>

          {!immersiveActive ? (
            <div className="rounded-2xl border border-dashed bg-muted/15 px-6 py-8 text-sm text-muted-foreground">
              请先在历史记录页顶部配置学习参数，再从课程卡片进入学习。
            </div>
          ) : (
            <div className={`immersive-typing ${cinemaFullscreenActive ? "immersive-typing--cinema" : ""}`}>
              <div className="immersive-typing-status">
                <Badge variant="outline">
                  第 {Math.min(currentSentenceIndex + 1, sentenceCount)} / {sentenceCount} 句
                </Badge>
                <Badge variant="outline">已完成 {completedIndexes.length} / {sentenceCount}</Badge>
                {isPlaying ? <Badge variant="secondary">正在播放本句</Badge> : null}
                {isPlaybackPaused ? <Badge variant="outline">已暂停</Badge> : null}
              </div>

              {mediaError ? <p className="text-xs text-destructive">{mediaError}</p> : null}
              {waitingForInitialPlayback ? <p className="text-xs text-muted-foreground">输入已完成，等待本句播放结束。</p> : null}

              <div className={cinemaFullscreenActive ? "immersive-word-row-frame immersive-word-row-frame--cinema" : ""}>
                <div className={`immersive-word-row ${cinemaFullscreenActive ? "immersive-word-row--cinema" : ""}`}>
                  {expectedTokens.map((token, index) => {
                    const status = wordStatuses[index] || "pending";
                    const slots = buildLetterSlots(token, wordInputs[index] || "");
                    return (
                      <div
                        key={`${token}-${index}`}
                        className={`immersive-word-slot immersive-word-slot--${status} immersive-word-slot--underline`}
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
              </div>

              {showPreviousSentenceBlock ? (
                <div className={`immersive-previous-sentence ${cinemaFullscreenActive ? "immersive-previous-sentence--cinema" : ""}`}>
                  {canRenderInteractiveWordbook ? (
                    <>
                      <div className="flex flex-wrap items-start gap-2 sm:flex-nowrap sm:items-center">
                        <div className="min-w-0 flex flex-1 flex-wrap items-center gap-x-1 gap-y-2">
                          <span className="shrink-0 text-foreground">上一句：</span>
                          {previousSentenceTokens.map((token, index) => {
                            const tokenSelected = wordbookSelectedTokenIndexes.includes(index);
                            return (
                              <button
                                key={`previous-wordbook-token-${token}-${index}`}
                                type="button"
                                data-wordbook-token-index={index}
                                aria-pressed={tokenSelected}
                                className={`min-h-0 cursor-pointer rounded-md border border-transparent px-1.5 py-0.5 text-left text-sm leading-6 transition-colors select-none touch-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                                  tokenSelected
                                    ? "bg-slate-200 text-foreground shadow-sm"
                                    : "bg-slate-100/80 text-foreground hover:bg-slate-200/70"
                                } ${wordbookBusy ? "opacity-60" : ""}`}
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
                        <Button
                          type="button"
                          size="sm"
                          className="shrink-0"
                          disabled={wordbookBusy || selectedWordbookTokens.length === 0}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (!previousSentence) return;
                            void collectWordbookEntry({
                              sentence: previousSentence,
                              entryType: selectedWordbookTokens.length > 1 ? "phrase" : "word",
                              entryText: selectedWordbookText,
                              startTokenIndex: selectedWordbookStart,
                              endTokenIndex: selectedWordbookEnd,
                            });
                          }}
                        >
                          {wordbookBusy ? "加入中..." : "加入生词本"}
                        </Button>
                      </div>
                      <p className="pl-[4.5em]">{previousSentenceZh}</p>
                    </>
                  ) : (
                    <>
                      <p>{translationHeading}：{translationEn}</p>
                      <p className="pl-[4.5em]">{translationZh}</p>
                    </>
                  )}
                </div>
              ) : null}
              {!cinemaFullscreenActive ? (
                <p className="immersive-keyboard-hint text-xs text-muted-foreground">
                  快捷键按历史页顶部配置生效：{getShortcutLabel(learningSettings.shortcuts.reveal_letter)} 揭示字母，
                  {getShortcutLabel(learningSettings.shortcuts.reveal_word)} 揭示单词，
                  {getShortcutLabel(learningSettings.shortcuts.previous_sentence)} 上一句，
                  {getShortcutLabel(learningSettings.shortcuts.next_sentence)} 下一句，
                  {getShortcutLabel(learningSettings.shortcuts.replay_sentence)} 重播，
                  {getShortcutLabel(learningSettings.shortcuts.toggle_pause_playback)} 暂停/继续播放。
                </p>
              ) : null}
              {!cinemaFullscreenActive && phase === "lesson_completed" ? <p className="text-sm text-primary">课程已完成，恭喜你！</p> : null}
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
            className="immersive-hidden-input"
            value={currentWordInput}
            onChange={() => {}}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              if (typingEnabled) {
                setTimeout(() => {
                  focusTypingInput();
                }, 0);
              }
            }}
            autoComplete="off"
            spellCheck={false}
            readOnly={!typingEnabled}
          />
        </CardContent>
      </Card>
    </div>
  );
}

