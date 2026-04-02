import { ArrowLeft, ChevronDown, ChevronUp, Eye, Loader2, Volume2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
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
  SimpleTooltip,
} from "../../shared/ui";
import {
  LEARNING_SETTINGS_UPDATED_EVENT,
  SHORTCUT_ACTIONS,
  TRANSLATION_MASK_LAYOUT_VERSION,
  getShortcutLabel,
  isShortcutPressed,
  readLearningSettings,
  resolveReplayAssistance,
  writeLearningSettings,
} from "./learningSettings";
import {
  ANSWER_COMPLETED,
  DEFAULT_IMMERSIVE_PLAYBACK_RATE,
  EXIT_IMMERSIVE,
  LESSON_LOADED,
  NAVIGATE_TO_SENTENCE,
  PLAYBACK_FINISHED,
  PLAYBACK_STARTED,
  POST_ANSWER_REPLAY_COMPLETED,
  POST_ANSWER_REPLAY_STARTED,
  RESET_SENTENCE_GATE,
  SENTENCE_PASSED,
  SET_LOOP_ENABLED,
  SET_MEDIA_BINDING_REQUIRED,
  SET_POST_ANSWER_REPLAY_STATE,
  SET_PHASE,
  SET_PLAYBACK_RATE,
  SET_PLAYBACK_RATE_PINNED,
  SET_SENTENCE_JUMP_VALUE,
  SET_TRANSLATION_DISPLAY_MODE,
  createImmersiveSessionState,
  immersiveSessionReducer,
  normalizePlaybackRate,
} from "./immersiveSessionMachine";
import { getMediaExt, isAudioFilename, isVideoFilename, normalizeToken } from "./tokenNormalize";
import { useImmersiveSessionController } from "./useImmersiveSessionController";
import { useSentencePlayback } from "./useSentencePlayback";
import { useTypingFeedbackSounds } from "./useTypingFeedbackSounds";
import "./immersive.css";

const LOCAL_MEDIA_REQUIRED_CODE = "LOCAL_MEDIA_REQUIRED";
const APOSTROPHE_RE = /[’']/g;
const CINEMA_CONTROLS_IDLE_MS = 3000;
const WORD_TIMING_TOLERANCE_MS = 140;
const PROGRAMMATIC_FULLSCREEN_EXIT_RESET_MS = 1000;
const WORDBOOK_LONG_PRESS_MS = 260;
const MOBILE_KEYBOARD_MIN_INSET_PX = 120;
const TRANSLATION_MASK_MIN_WIDTH_PX = 120;
const TRANSLATION_MASK_MIN_HEIGHT_PX = 52;
const TRANSLATION_MASK_DEFAULT_WIDTH_RATIO = 0.58;
const TRANSLATION_MASK_DEFAULT_BOTTOM_OFFSET_PX = 12;
const TRANSLATION_MASK_CHROME_IDLE_MS = 1200;
const TRANSLATION_MASK_VISIBLE_BOTTOM_GAP_PX = 12;
const IMMERSIVE_PLAYBACK_RATE_STEP = 0.25;
const TRANSLATION_MASK_EMPTY_RECT = Object.freeze({ x: null, y: null, width: null, height: null });
const ENTRY_HINT_ACTION_IDS = ["reveal_word", "replay_sentence", "next_sentence"];
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
const TRANSLATION_MASK_RESIZE_HANDLES = [
  {
    key: "nw",
    mode: "resize-nw",
    className: "immersive-translation-mask__resize-handle immersive-translation-mask__resize-handle--top-left",
    ariaLabel: "从左上角调整字幕遮挡板尺寸",
  },
  {
    key: "ne",
    mode: "resize-ne",
    className: "immersive-translation-mask__resize-handle immersive-translation-mask__resize-handle--top-right",
    ariaLabel: "从右上角调整字幕遮挡板尺寸",
  },
  {
    key: "sw",
    mode: "resize-sw",
    className: "immersive-translation-mask__resize-handle immersive-translation-mask__resize-handle--bottom-left",
    ariaLabel: "从左下角调整字幕遮挡板尺寸",
  },
  {
    key: "se",
    mode: "resize-se",
    className: "immersive-translation-mask__resize-handle immersive-translation-mask__resize-handle--bottom-right",
    ariaLabel: "从右下角调整字幕遮挡板尺寸",
  },
];

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  if (!Number.isFinite(min) || !Number.isFinite(max)) return value;
  if (max <= min) return min;
  return Math.min(max, Math.max(min, value));
}

function normalizeTranslationMaskRect(rect) {
  if (!rect || typeof rect !== "object") {
    return { ...TRANSLATION_MASK_EMPTY_RECT };
  }
  const normalizeValue = (value) => {
    if (value == null || value === "") return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    return Number(clampNumber(parsed, 0, 1).toFixed(4));
  };
  return {
    x: normalizeValue(rect.x),
    y: normalizeValue(rect.y),
    width: normalizeValue(rect.width),
    height: normalizeValue(rect.height),
  };
}

function convertTranslationMaskRectToStored(rect, metrics) {
  if (!metrics || !rect) {
    return normalizeTranslationMaskRect(rect);
  }
  const width = Math.max(1, Number(metrics.width || 0));
  const height = Math.max(1, Number(metrics.height || 0));
  return normalizeTranslationMaskRect({
    x: rect.left / width,
    y: rect.top / height,
    width: rect.width / width,
    height: rect.height / height,
  });
}

function buildTranslationMaskUiPreference(enabled, rect) {
  const normalizedRect = normalizeTranslationMaskRect(rect);
  return {
    enabled: Boolean(enabled),
    layoutVersion: TRANSLATION_MASK_LAYOUT_VERSION,
    x: normalizedRect.x,
    y: normalizedRect.y,
    width: normalizedRect.width,
    height: normalizedRect.height,
  };
}

function buildDefaultTranslationMaskRect(metrics, options = {}) {
  const safeWidth = Math.max(1, Number(metrics?.width || 0));
  const safeHeight = Math.max(1, Number(metrics?.height || 0));
  const minWidth = Math.min(TRANSLATION_MASK_MIN_WIDTH_PX, safeWidth);
  const minHeight = Math.min(TRANSLATION_MASK_MIN_HEIGHT_PX, safeHeight);
  const width = clampNumber(safeWidth * TRANSLATION_MASK_DEFAULT_WIDTH_RATIO, minWidth, safeWidth);
  const height = minHeight;
  const preferredBottom = clampNumber(Number(options?.preferredBottom ?? safeHeight), height, safeHeight);
  const left = clampNumber((safeWidth - width) / 2, 0, Math.max(0, safeWidth - width));
  const top = clampNumber(
    preferredBottom - height - TRANSLATION_MASK_DEFAULT_BOTTOM_OFFSET_PX,
    0,
    Math.max(0, safeHeight - height),
  );
  return convertTranslationMaskRectToStored({ left, top, width, height }, { width: safeWidth, height: safeHeight });
}

function measureContainedVideoRect(containerRect, videoElement) {
  const safeContainerWidth = Math.max(0, Number(containerRect?.width || 0));
  const safeContainerHeight = Math.max(0, Number(containerRect?.height || 0));
  const intrinsicWidth = Math.max(0, Number(videoElement?.videoWidth || 0));
  const intrinsicHeight = Math.max(0, Number(videoElement?.videoHeight || 0));
  if (safeContainerWidth <= 0 || safeContainerHeight <= 0 || intrinsicWidth <= 0 || intrinsicHeight <= 0) {
    return null;
  }

  const containerAspectRatio = safeContainerWidth / safeContainerHeight;
  const videoAspectRatio = intrinsicWidth / intrinsicHeight;

  if (videoAspectRatio >= containerAspectRatio) {
    const width = safeContainerWidth;
    const height = width / videoAspectRatio;
    return {
      left: 0,
      top: (safeContainerHeight - height) / 2,
      width,
      height,
    };
  }

  const height = safeContainerHeight;
  const width = height * videoAspectRatio;
  return {
    left: (safeContainerWidth - width) / 2,
    top: 0,
    width,
    height,
  };
}

function resolveTranslationMaskRect(maskRect, metrics) {
  if (!metrics) return null;
  const safeWidth = Math.max(1, Number(metrics.width || 0));
  const safeHeight = Math.max(1, Number(metrics.height || 0));
  const maxWidth = Math.min(safeWidth, Math.max(1, Number(metrics.maxWidth || safeWidth)));
  const maxHeight = Math.min(safeHeight, Math.max(1, Number(metrics.maxHeight || safeHeight)));
  const minWidth = Math.min(Math.max(1, Number(metrics.minWidth || TRANSLATION_MASK_MIN_WIDTH_PX)), maxWidth);
  const minHeight = Math.min(Math.max(1, Number(metrics.minHeight || TRANSLATION_MASK_MIN_HEIGHT_PX)), maxHeight);
  const normalizedRect = normalizeTranslationMaskRect(maskRect);
  const fallbackRect = normalizeTranslationMaskRect(metrics.defaultRect);
  const sourceRect =
    normalizedRect.x == null || normalizedRect.y == null || normalizedRect.width == null || normalizedRect.height == null
      ? fallbackRect
      : normalizedRect;
  const width = clampNumber((sourceRect.width ?? fallbackRect.width ?? 1) * safeWidth, minWidth, maxWidth);
  const height = clampNumber((sourceRect.height ?? fallbackRect.height ?? 1) * safeHeight, minHeight, maxHeight);
  const left = clampNumber((sourceRect.x ?? fallbackRect.x ?? 0) * safeWidth, 0, Math.max(0, safeWidth - width));
  const top = clampNumber((sourceRect.y ?? fallbackRect.y ?? 0) * safeHeight, 0, Math.max(0, safeHeight - height));
  return { left, top, width, height };
}

function resolveTranslationMaskResizeRect(startRect, mode, deltaX, deltaY, metrics) {
  if (!startRect || !metrics) return null;
  const boundsWidth = Math.max(1, Number(metrics.width || 0));
  const boundsHeight = Math.max(1, Number(metrics.height || 0));
  const maxWidth = Math.min(boundsWidth, Math.max(1, Number(metrics.maxWidth || boundsWidth)));
  const maxHeight = Math.min(boundsHeight, Math.max(1, Number(metrics.maxHeight || boundsHeight)));
  const minWidth = Math.min(Math.max(1, Number(metrics.minWidth || TRANSLATION_MASK_MIN_WIDTH_PX)), maxWidth);
  const minHeight = Math.min(Math.max(1, Number(metrics.minHeight || TRANSLATION_MASK_MIN_HEIGHT_PX)), maxHeight);
  const right = startRect.left + startRect.width;
  const bottom = startRect.top + startRect.height;

  switch (mode) {
    case "resize":
    case "resize-se":
      return {
        left: startRect.left,
        top: startRect.top,
        width: clampNumber(startRect.width + deltaX, minWidth, Math.min(maxWidth, boundsWidth - startRect.left)),
        height: clampNumber(startRect.height + deltaY, minHeight, Math.min(maxHeight, boundsHeight - startRect.top)),
      };
    case "resize-sw": {
      const left = clampNumber(startRect.left + deltaX, 0, Math.max(0, right - minWidth));
      return {
        left,
        top: startRect.top,
        width: clampNumber(right - left, minWidth, maxWidth),
        height: clampNumber(startRect.height + deltaY, minHeight, Math.min(maxHeight, boundsHeight - startRect.top)),
      };
    }
    case "resize-ne": {
      const top = clampNumber(startRect.top + deltaY, 0, Math.max(0, bottom - minHeight));
      return {
        left: startRect.left,
        top,
        width: clampNumber(startRect.width + deltaX, minWidth, Math.min(maxWidth, boundsWidth - startRect.left)),
        height: clampNumber(bottom - top, minHeight, maxHeight),
      };
    }
    case "resize-nw": {
      const left = clampNumber(startRect.left + deltaX, 0, Math.max(0, right - minWidth));
      const top = clampNumber(startRect.top + deltaY, 0, Math.max(0, bottom - minHeight));
      return {
        left,
        top,
        width: clampNumber(right - left, minWidth, maxWidth),
        height: clampNumber(bottom - top, minHeight, maxHeight),
      };
    }
    default:
      return null;
  }
}

function debugImmersiveLog(event, detail = {}) {
  if (typeof console === "undefined" || typeof console.debug !== "function") return;
  console.debug("[DEBUG] immersive.learning", event, detail);
}

function buildImmersiveEntryHintItems(learningSettings) {
  const actionLabelMap = new Map(SHORTCUT_ACTIONS.map((action) => [action.id, action.label]));
  const orderedActionIds = [...ENTRY_HINT_ACTION_IDS, ...SHORTCUT_ACTIONS.map((action) => action.id)];
  const seen = new Set();
  const items = [];
  for (const actionId of orderedActionIds) {
    if (seen.has(actionId)) continue;
    seen.add(actionId);
    const shortcutLabel = getShortcutLabel(learningSettings?.shortcuts?.[actionId]);
    if (!shortcutLabel || shortcutLabel === "未设置") continue;
    items.push({
      id: actionId,
      shortcutLabel,
      actionLabel: actionLabelMap.get(actionId) || actionId,
    });
    if (items.length >= 3) {
      break;
    }
  }
  return items;
}

function formatPlaybackRateLabel(rate) {
  return `${Number(rate || 1).toFixed(2)}x`;
}

function formatPlaybackRateInputValue(rate) {
  return Number(normalizePlaybackRate(rate)).toFixed(2).replace(/\.00$/, "").replace(/0$/, "");
}

function isIpadSafariBrowser() {
  if (typeof navigator === "undefined") return false;
  const userAgent = String(navigator.userAgent || "");
  const platform = String(navigator.platform || "");
  const touchPoints = Number(navigator.maxTouchPoints || 0);
  const isAppleTablet = /iPad/i.test(userAgent) || (platform === "MacIntel" && touchPoints > 1);
  if (!isAppleTablet) return false;
  return /Safari/i.test(userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/i.test(userAgent);
}

function isTouchPrimaryInputDevice() {
  if (typeof navigator === "undefined") return false;
  const touchPoints = Number(navigator.maxTouchPoints || 0);
  if (touchPoints > 0) return true;
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(pointer: coarse)").matches;
}

function getFullscreenElement() {
  if (typeof document === "undefined") return null;
  return (
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.msFullscreenElement ||
    (document.webkitIsFullScreen ? document.documentElement : null) ||
    null
  );
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

function resolveInteractiveWordbookContext({
  hasWordbookAccess = false,
  showSentenceBlock = false,
  translationDisplayMode = "previous",
  singleSentenceLoopEnabled = false,
  sentenceTypingDone = false,
  postAnswerReplayState = "idle",
  currentSentence = null,
  currentSentenceTokens = [],
  currentSentenceZh = "",
  previousSentence = null,
  previousSentenceTokens = [],
  previousSentenceZh = "",
} = {}) {
  if (!hasWordbookAccess || !showSentenceBlock) {
    return null;
  }

  const safeCurrentSentenceTokens = Array.isArray(currentSentenceTokens) ? currentSentenceTokens : [];
  if (
    translationDisplayMode === "current_answered" &&
    currentSentence &&
    safeCurrentSentenceTokens.length > 0
  ) {
    return {
      mode: "current",
      sentence: currentSentence,
      tokens: safeCurrentSentenceTokens,
      heading: "本句",
      zhText: currentSentenceZh,
    };
  }

  const safePreviousSentenceTokens = Array.isArray(previousSentenceTokens) ? previousSentenceTokens : [];
  if (translationDisplayMode === "previous" && previousSentence && safePreviousSentenceTokens.length > 0) {
    return {
      mode: "previous",
      sentence: previousSentence,
      tokens: safePreviousSentenceTokens,
      heading: "上一句",
      zhText: previousSentenceZh,
    };
  }

  return null;
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

function buildWordbookTokenRange(startTokenIndex, endTokenIndex) {
  if (!Number.isInteger(startTokenIndex) || !Number.isInteger(endTokenIndex)) {
    return [];
  }
  const rangeStart = Math.min(startTokenIndex, endTokenIndex);
  const rangeEnd = Math.max(startTokenIndex, endTokenIndex);
  return Array.from({ length: rangeEnd - rangeStart + 1 }, (_, offset) => rangeStart + offset);
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

function buildReplayPlaybackPlan(sentence, sentenceTiming, activeWordIndex, selectedRate) {
  const sentenceStartMs = Math.max(0, Number(sentence?.begin_ms || 0));
  const sentenceEndMs = Math.max(sentenceStartMs + 1, Number(sentence?.end_ms || 0));
  const resolvedBoundaryMs = resolveReplayBoundaryMs(sentence, sentenceTiming, activeWordIndex) || sentenceStartMs;
  const safeInitialRate = normalizePlaybackRate(selectedRate);
  return {
    initialRate: safeInitialRate,
    rateSteps: [],
    preciseBoundary: Boolean(resolvedBoundaryMs),
    tailBoundaryMs: resolvedBoundaryMs,
    tailWindowMs: sentenceEndMs - sentenceStartMs,
    speedMode: "fixed_rate",
    fallbackReason: "",
  };
}

function isEditableShortcutTarget(target) {
  if (!target) return false;
  if (target?.isContentEditable) return true;
  const tagName = String(target?.tagName || "").toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select";
}

function shouldKeepControlFocus(target) {
  if (!target || typeof target.closest !== "function") return false;
  if (isEditableShortcutTarget(target)) return true;
  return Boolean(target.closest("button, a, label, [role='button'], [role='link']"));
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
  const [learningSettings, setLearningSettings] = useState(() => readLearningSettings());
  const [sessionState, dispatchSession] = useReducer(
    immersiveSessionReducer,
    null,
    () => createImmersiveSessionState({ lesson, learningSettings: readLearningSettings() }),
  );
  const [wordbookBusy, setWordbookBusy] = useState(false);
  const [wordbookSelectedTokenIndexes, setWordbookSelectedTokenIndexes] = useState([]);
  const [showEntryHintOverlay, setShowEntryHintOverlay] = useState(false);
  const [isCinemaFullscreen, setIsCinemaFullscreen] = useState(false);
  const [isFullscreenFallback, setIsFullscreenFallback] = useState(false);
  const [isCssFullscreen, setIsCssFullscreen] = useState(false);
  const [showFullscreenPreviousSentence, setShowFullscreenPreviousSentence] = useState(
    () => readLearningSettings().uiPreferences?.showFullscreenPreviousSentence ?? false,
  );
  const [cinemaControlsIdle, setCinemaControlsIdle] = useState(false);
  const [translationMaskEnabled, setTranslationMaskEnabled] = useState(
    () => readLearningSettings().uiPreferences?.translationMask?.enabled !== false,
  );
  const [translationMaskRect, setTranslationMaskRect] = useState(() =>
    normalizeTranslationMaskRect(readLearningSettings().uiPreferences?.translationMask),
  );
  const [translationMaskMetrics, setTranslationMaskMetrics] = useState(null);
  const [translationMaskChromeVisible, setTranslationMaskChromeVisible] = useState(true);
  const [mobileViewportState, setMobileViewportState] = useState({
    height: 0,
    keyboardInset: 0,
    keyboardOpen: false,
  });
  const [playbackRateInputValue, setPlaybackRateInputValue] = useState(() =>
    formatPlaybackRateInputValue(DEFAULT_IMMERSIVE_PLAYBACK_RATE),
  );
  const [sentenceJumpEditing, setSentenceJumpEditing] = useState(false);
  const [wordbookSuccessMessage, setWordbookSuccessMessage] = useState(null);
  const wordbookSuccessTimerRef = useRef(null);
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

  const immersiveContainerRef = useRef(null);
  const immersiveMediaRef = useRef(null);
  const mediaElementRef = useRef(null);
  const clipAudioRef = useRef(null);
  const typingPanelRef = useRef(null);
  const typingInputRef = useRef(null);
  const bindingInputRef = useRef(null);
  const cinemaControlsIdleTimerRef = useRef(null);
  const translationMaskChromeIdleTimerRef = useRef(null);
  const currentWordInputRef = useRef("");
  const activeWordIndexRef = useRef(0);
  const wordInputsRef = useRef([]);
  const wordStatusesRef = useRef([]);
  const sentenceAdvanceLockedRef = useRef(false);
  const translationMaskHoveredRef = useRef(false);
  const wordbookPointerGestureRef = useRef({
    pointerId: null,
    pressTokenIndex: null,
    anchorTokenIndex: null,
    currentTokenIndex: null,
    longPressActive: false,
    longPressTimerId: null,
  });
  const playbackKindRef = useRef("initial");
  const replayAssistStageRef = useRef(0);
  const replayProgressAnchorRef = useRef(0);
  const autoFullscreenAttemptKeyRef = useRef("");
  const programmaticFullscreenExitRef = useRef(false);
  const programmaticFullscreenExitTimerRef = useRef(null);
  const focusRestoreTimerRef = useRef(null);
  const wordbookActionRef = useRef(false);
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
  const cinemaFullscreenActive = isCinemaFullscreen || isFullscreenFallback || isCssFullscreen;
  const isIpadSafari = useMemo(() => isIpadSafariBrowser(), []);
  const isTouchDevice = useMemo(() => isTouchPrimaryInputDevice(), []);
  const showPreviousSentenceBlock = !cinemaFullscreenActive || showFullscreenPreviousSentence;
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

  const clearCinemaControlsIdleTimer = useCallback(() => {
    if (typeof window === "undefined") return;
    if (cinemaControlsIdleTimerRef.current === null) return;
    window.clearTimeout(cinemaControlsIdleTimerRef.current);
    cinemaControlsIdleTimerRef.current = null;
  }, []);

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
      block: cinemaFullscreenActive ? "end" : "nearest",
      inline: "nearest",
      behavior: "auto",
    });
  }, [cinemaFullscreenActive]);

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
  const currentLessonId = String(lesson?.id ?? "").trim();
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
  const entryHintItems = useMemo(() => buildImmersiveEntryHintItems(learningSettings), [learningSettings]);
  const expectedTokens = useMemo(() => (Array.isArray(currentSentence?.tokens) ? currentSentence.tokens : []), [currentSentence?.tokens]);
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
  const canRenderInteractiveWordbook = Boolean(interactiveWordbookContext);
  const wordbookSentence = interactiveWordbookContext?.sentence || null;
  const wordbookSentenceTokens = interactiveWordbookContext?.tokens || [];
  const wordbookSentenceHeading = interactiveWordbookContext?.heading || "上一句";
  const wordbookSentenceZh = interactiveWordbookContext?.zhText || "";
  const wordbookSentenceMode = interactiveWordbookContext?.mode || "previous";
  const wordbookSentencePlaybackLabel = wordbookSentenceMode === "current" ? "播放本句" : "播放上一句";
  const wordbookSentenceSourceKey = `${lesson?.id ?? "lesson"}:${wordbookSentenceMode}:${
    wordbookSentence?.idx ?? "none"
  }`;
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
  const sentenceCount = lesson?.sentences?.length || 0;
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
  const canShowTranslationMask = Boolean(
    cinemaFullscreenActive && mediaMode === "video" && translationMaskMetrics && resolvedTranslationMaskRect,
  );

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

  const syncLearningSettingsState = useCallback((nextSettings) => {
    const resolvedSettings = nextSettings && typeof nextSettings === "object" ? nextSettings : readLearningSettings();
    setLearningSettings(resolvedSettings);
    setShowFullscreenPreviousSentence(resolvedSettings.uiPreferences?.showFullscreenPreviousSentence ?? false);
    setTranslationMaskEnabled(resolvedSettings.uiPreferences?.translationMask?.enabled !== false);
    setTranslationMaskRect(normalizeTranslationMaskRect(resolvedSettings.uiPreferences?.translationMask));
    dispatchSession({
      type: SET_LOOP_ENABLED,
      enabled: resolvedSettings.playbackPreferences?.singleSentenceLoopEnabled === true,
    });
  }, []);

  const persistUiPreferences = useCallback(
    (updater) => {
      const currentSettings = readLearningSettings();
      const currentUiPreferences = currentSettings.uiPreferences || {};
      const nextUiPreferences = typeof updater === "function" ? updater(currentUiPreferences) : updater;
      writeLearningSettings({
        ...currentSettings,
        uiPreferences: {
          ...currentUiPreferences,
          ...nextUiPreferences,
        },
      });
      syncLearningSettingsState(readLearningSettings());
    },
    [syncLearningSettingsState],
  );

  const persistPlaybackPreferences = useCallback(
    (updater) => {
      const currentSettings = readLearningSettings();
      const currentPlaybackPreferences = currentSettings.playbackPreferences || {};
      const nextPlaybackPreferences =
        typeof updater === "function" ? updater(currentPlaybackPreferences) : updater;
      writeLearningSettings({
        ...currentSettings,
        playbackPreferences: {
          ...currentPlaybackPreferences,
          ...nextPlaybackPreferences,
        },
      });
      syncLearningSettingsState(readLearningSettings());
    },
    [syncLearningSettingsState],
  );

  const persistFullscreenPreviousSentencePreference = useCallback((nextVisible) => {
    const safeVisible = Boolean(nextVisible);
    setShowFullscreenPreviousSentence(safeVisible);
    persistUiPreferences((currentUiPreferences) => ({
      ...currentUiPreferences,
      showFullscreenPreviousSentence: safeVisible,
    }));
  }, [persistUiPreferences]);

  const persistTranslationMaskPreference = useCallback(
    (nextEnabled, nextRect) => {
      const nextPreference = buildTranslationMaskUiPreference(nextEnabled, nextRect);
      setTranslationMaskEnabled(nextPreference.enabled);
      setTranslationMaskRect(normalizeTranslationMaskRect(nextPreference));
      persistUiPreferences((currentUiPreferences) => ({
        ...currentUiPreferences,
        translationMask: nextPreference,
      }));
    },
    [persistUiPreferences],
  );

  const handleToggleSingleSentenceLoop = useCallback(() => {
    const nextEnabled = !singleSentenceLoopEnabled;
    setLoopEnabled(nextEnabled);
    persistPlaybackPreferences((currentPlaybackPreferences) => ({
      ...currentPlaybackPreferences,
      singleSentenceLoopEnabled: nextEnabled,
    }));
  }, [persistPlaybackPreferences, setLoopEnabled, singleSentenceLoopEnabled]);

  const persistLessonPlaybackRate = useCallback(
    (nextPinned, nextRate) => {
      persistPlaybackPreferences((currentPlaybackPreferences) => {
        const nextOverrides = {
          ...(currentPlaybackPreferences?.lessonPlaybackRateOverrides || {}),
        };
        if (currentLessonId && nextPinned) {
          nextOverrides[currentLessonId] = {
            pinned: true,
            rate: normalizePlaybackRate(nextRate),
          };
        } else if (currentLessonId) {
          delete nextOverrides[currentLessonId];
        }
        return {
          ...currentPlaybackPreferences,
          lessonPlaybackRateOverrides: nextOverrides,
        };
      });
    },
    [currentLessonId, persistPlaybackPreferences],
  );

  const applyPlaybackRate = useCallback(
    (nextRate, { persistPinned = playbackRatePinned } = {}) => {
      const resolvedRate = normalizePlaybackRate(nextRate);
      setSelectedPlaybackRate(resolvedRate);
      setPlaybackRateInputValue(formatPlaybackRateInputValue(resolvedRate));
      const activeMedia = [mediaElementRef.current, clipAudioRef.current];
      for (const media of activeMedia) {
        if (!media) continue;
        media.playbackRate = resolvedRate;
        media.defaultPlaybackRate = resolvedRate;
      }
      if (persistPinned) {
        persistLessonPlaybackRate(true, resolvedRate);
      }
      return resolvedRate;
    },
    [persistLessonPlaybackRate, playbackRatePinned, setSelectedPlaybackRate],
  );

  const commitPlaybackRateInput = useCallback((rawValue = playbackRateInputValue) => {
    const normalizedValue = String(rawValue ?? "").trim();
    if (!normalizedValue) {
      const resetRate = applyPlaybackRate(DEFAULT_IMMERSIVE_PLAYBACK_RATE);
      setPlaybackRateInputValue(formatPlaybackRateInputValue(resetRate));
      return;
    }
    const committedRate = applyPlaybackRate(normalizedValue);
    setPlaybackRateInputValue(formatPlaybackRateInputValue(committedRate));
  }, [applyPlaybackRate, playbackRateInputValue]);

  const handlePlaybackRateInputChange = useCallback((event) => {
    setPlaybackRateInputValue(event.target.value);
  }, []);

  const handlePlaybackRateInputKeyDown = useCallback(
    (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commitPlaybackRateInput(event.currentTarget.value);
        event.currentTarget.blur();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setPlaybackRateInputValue(formatPlaybackRateInputValue(selectedPlaybackRate));
        event.currentTarget.blur();
      }
    },
    [commitPlaybackRateInput, selectedPlaybackRate],
  );

  const handlePlaybackRateInputBlur = useCallback(
    (event) => {
      commitPlaybackRateInput(event.currentTarget.value);
    },
    [commitPlaybackRateInput],
  );

  const adjustPlaybackRateByStep = useCallback(
    (direction) => {
      const draftValue = String(playbackRateInputValue ?? "").trim();
      const parsedDraftValue = Number(draftValue);
      const baseRate = Number.isFinite(parsedDraftValue) ? parsedDraftValue : selectedPlaybackRate;
      applyPlaybackRate(baseRate + direction * IMMERSIVE_PLAYBACK_RATE_STEP);
    },
    [applyPlaybackRate, playbackRateInputValue, selectedPlaybackRate],
  );

  const handleResetPlaybackRate = useCallback(() => {
    applyPlaybackRate(DEFAULT_IMMERSIVE_PLAYBACK_RATE);
  }, [applyPlaybackRate]);

  const handleTogglePlaybackRatePinned = useCallback(() => {
    const nextPinned = !playbackRatePinned;
    setPlaybackRatePinned(nextPinned, selectedPlaybackRate);
    persistLessonPlaybackRate(nextPinned, selectedPlaybackRate);
  }, [persistLessonPlaybackRate, playbackRatePinned, selectedPlaybackRate, setPlaybackRatePinned]);

  useEffect(() => {
    setPlaybackRateInputValue(formatPlaybackRateInputValue(selectedPlaybackRate));
  }, [selectedPlaybackRate]);

  useEffect(() => {
    setSentenceJumpEditing(false);
  }, [currentSentenceIndex, lesson?.id]);

  const sentenceJumpInputValue = sentenceJumpEditing
    ? sentenceJumpValue
    : sentenceJumpValue !== ""
      ? sentenceJumpValue
      : String(currentSentenceIndex + 1);

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
  }, []);

  const updateTranslationMaskMetrics = useCallback(() => {
    const container = immersiveMediaRef.current;
    const videoElement = mediaElementRef.current;
    if (!container || !videoElement || !cinemaFullscreenActive || mediaMode !== "video") {
      setTranslationMaskMetrics(null);
      return;
    }
    const containerRect = container.getBoundingClientRect();
    const videoRect = measureContainedVideoRect(containerRect, videoElement);
    if (!videoRect || videoRect.width <= 0 || videoRect.height <= 0) {
      setTranslationMaskMetrics(null);
      return;
    }
    const typingRect = typingPanelRef.current?.getBoundingClientRect() || null;
    const viewportWidth = Math.max(0, Number(window.innerWidth || containerRect.width || 0));
    const viewportHeight = Math.max(0, Number(window.innerHeight || containerRect.height || 0));
    const orientation = viewportWidth >= viewportHeight ? "landscape" : "portrait";
    const minPreferredBottom = Math.min(TRANSLATION_MASK_MIN_HEIGHT_PX, videoRect.height);
    const preferredBottom = typingRect
      ? clampNumber(
          typingRect.top - containerRect.top - TRANSLATION_MASK_VISIBLE_BOTTOM_GAP_PX,
          minPreferredBottom,
          videoRect.height,
        )
      : videoRect.height;
    const maskViewportRect = {
      width: videoRect.width,
      height: videoRect.height,
    };
    const defaultRect = buildDefaultTranslationMaskRect(maskViewportRect, { preferredBottom });
    const isCompactPortrait = viewportWidth > 0 && viewportWidth < 768 && orientation === "portrait";
    const isTabletLandscape = viewportWidth >= 768 && viewportWidth < 1024 && orientation === "landscape";
    const isLargeLandscape = viewportWidth >= 1024 && orientation === "landscape";
    const maxWidth = isLargeLandscape
      ? Math.min(maskViewportRect.width, 680)
      : isTabletLandscape
        ? Math.min(maskViewportRect.width * 0.85, 560)
        : isCompactPortrait
          ? Math.min(maskViewportRect.width * 0.85, 400)
          : maskViewportRect.width;
    const minHeight = isCompactPortrait ? Math.min(maskViewportRect.height, 48) : TRANSLATION_MASK_MIN_HEIGHT_PX;
    const maxHeight = isCompactPortrait
      ? Math.min(maskViewportRect.height, Math.max(48, Math.min(viewportHeight * 0.15, 80)))
      : maskViewportRect.height;
    setTranslationMaskMetrics({
      width: maskViewportRect.width,
      height: maskViewportRect.height,
      offsetLeft: videoRect.left,
      offsetTop: videoRect.top,
      defaultRect,
      maxWidth,
      maxHeight,
      minHeight,
    });
  }, [cinemaFullscreenActive, mediaMode]);

  const toggleTranslationMask = useCallback(() => {
    persistTranslationMaskPreference(!translationMaskEnabled, translationMaskRect);
  }, [persistTranslationMaskPreference, translationMaskEnabled, translationMaskRect]);

  const resetSentenceGate = useCallback((playbackRequired = true) => {
    sentenceAdvanceLockedRef.current = false;
    playbackKindRef.current = "initial";
    dispatchSession({ type: RESET_SENTENCE_GATE, playbackRequired });
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
    gesture.anchorTokenIndex = null;
    gesture.currentTokenIndex = null;
    gesture.longPressActive = false;
  }, [clearWordbookGestureTimer]);

  const toggleWordbookTokenSelection = useCallback((tokenIndex) => {
    if (!Number.isInteger(tokenIndex)) return;
    setWordbookSelectedTokenIndexes((current) => toggleWordbookTokenIndex(current, tokenIndex));
  }, []);

  const selectWordbookTokenRange = useCallback((startTokenIndex, endTokenIndex) => {
    const nextRange = buildWordbookTokenRange(startTokenIndex, endTokenIndex);
    setWordbookSelectedTokenIndexes(nextRange);
    return nextRange;
  }, []);

  const collectWordbookEntry = useCallback(
    async ({ sentence, entryType, entryText, startTokenIndex, endTokenIndex }) => {
      if (!lesson?.id || !sentence || !accessToken) return;
      wordbookActionRef.current = true;
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
        const message = data.message || (data.created ? "已加入生词本" : "已更新到最新语境");
        if (wordbookSuccessTimerRef.current) clearTimeout(wordbookSuccessTimerRef.current);
        setWordbookSuccessMessage(message);
        wordbookSuccessTimerRef.current = setTimeout(() => {
          setWordbookSuccessMessage(null);
          wordbookSuccessTimerRef.current = null;
        }, 1500);
        clearWordbookSelection();
      } catch (error) {
        toast.error(`网络错误: ${String(error)}`);
      } finally {
        setWordbookBusy(false);
        setTimeout(() => {
          wordbookActionRef.current = false;
        }, 0);
      }
    },
    [accessToken, apiClient, clearWordbookSelection, lesson?.id],
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
      gesture.anchorTokenIndex = tokenIndex;
      gesture.currentTokenIndex = tokenIndex;
      gesture.longPressActive = false;
      gesture.longPressTimerId = window.setTimeout(() => {
        const nextGesture = wordbookPointerGestureRef.current;
        if (nextGesture.pointerId !== pointerId || nextGesture.pressTokenIndex !== tokenIndex) return;
        nextGesture.longPressActive = true;
        nextGesture.anchorTokenIndex = tokenIndex;
        nextGesture.currentTokenIndex = tokenIndex;
        selectWordbookTokenRange(tokenIndex, tokenIndex);
      }, WORDBOOK_LONG_PRESS_MS);
    },
    [canRenderInteractiveWordbook, clearWordbookGestureTimer, selectWordbookTokenRange, wordbookBusy],
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
        return;
      }
      const nextTokenIndex = Number(tokenElement.getAttribute("data-wordbook-token-index"));
      if (!Number.isInteger(nextTokenIndex)) return;
      const anchorTokenIndex = gesture.anchorTokenIndex;
      if (!Number.isInteger(anchorTokenIndex)) return;
      if (gesture.currentTokenIndex === nextTokenIndex) return;
      gesture.currentTokenIndex = nextTokenIndex;
      selectWordbookTokenRange(anchorTokenIndex, nextTokenIndex);
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
  }, [resetWordbookPointerGesture, selectWordbookTokenRange, toggleWordbookTokenSelection]);

  useEffect(() => {
    clearWordbookSelection();
    resetWordbookPointerGesture();
  }, [clearWordbookSelection, resetWordbookPointerGesture, wordbookSentenceSourceKey]);

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
    if (typeof window === "undefined") return undefined;

    const syncFromStorageEvent = (event) => {
      if (event?.key && event.key !== "immersive_learning_settings_v2") return;
      syncLearningSettingsState();
    };
    const syncFromCustomEvent = (event) => {
      syncLearningSettingsState(event?.detail);
    };

    window.addEventListener("storage", syncFromStorageEvent);
    window.addEventListener(LEARNING_SETTINGS_UPDATED_EVENT, syncFromCustomEvent);
    return () => {
      window.removeEventListener("storage", syncFromStorageEvent);
      window.removeEventListener(LEARNING_SETTINGS_UPDATED_EVENT, syncFromCustomEvent);
    };
  }, [syncLearningSettingsState]);

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
    if (!cinemaFullscreenActive || mediaMode !== "video") {
      resetTranslationMaskGesture();
      return;
    }
    updateTranslationMaskMetrics();
  }, [cinemaFullscreenActive, mediaMode, resetTranslationMaskGesture, updateTranslationMaskMetrics]);

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
        if (cinemaFullscreenActive) {
          wakeCinemaControls();
        }
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
  }, [cinemaFullscreenActive, immersiveActive, updateTranslationMaskMetrics, wakeCinemaControls]);

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
    if (!sentenceTypingDone) return;
    if (autoReplayAnsweredSentence) {
      if (singleSentenceLoopEnabled) return;
      if (postAnswerReplayState !== "completed") return;
    } else if (sentencePlaybackRequired && !sentencePlaybackDone) {
      return;
    }
    if (sentenceAdvanceLockedRef.current) return;
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
  ]);

  useEffect(() => {
    if (immersiveActive) return;
    stopPlayback();
    dispatchSession({ type: EXIT_IMMERSIVE });
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
      if (isCinemaFullscreen) {
        markProgrammaticFullscreenExit();
        await exitElementFullscreen().catch(() => {});
        setIsCinemaFullscreen(false);
      } else if (isFullscreenFallback) {
        setIsFullscreenFallback(false);
      }
      if (isCssFullscreen) {
        setIsCssFullscreen(false);
      }
      handler(source);
    },
    [isCinemaFullscreen, isFullscreenFallback, isCssFullscreen, markProgrammaticFullscreenExit, onBack, onExitImmersive],
  );

  const exitCinemaFullscreen = useCallback(async () => {
    await exitImmersive("button_exit_fullscreen");
  }, [exitImmersive]);

  const enterCinemaFullscreen = useCallback(async ({ source = "manual", showFailureToast = false } = {}) => {
    if (!immersiveActive) return { ok: false, reason: "immersive_inactive" };
    if (cinemaFullscreenActive) return { ok: true, reason: "already_active" };

    debugImmersiveLog("cinema_fullscreen.request", { source, lessonId: lesson?.id });

    // Always use CSS fullscreen — no browser fullscreen API, so Electron/touch
    // quirks and pointer-lock issues disappear completely.
    setIsCssFullscreen(true);
    debugImmersiveLog("cinema_fullscreen.success", { source, lessonId: lesson?.id, reason: "css_fullscreen" });
    return { ok: true, reason: "css_fullscreen" };
  }, [immersiveActive, cinemaFullscreenActive, lesson?.id]);

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
      const result = applyReplayAssistanceToSnapshot(
        cloneWordSnapshot(activeWordIndexRef.current, currentWordInputRef.current, wordInputsRef.current, wordStatusesRef.current),
        expectedTokens,
        { revealLetterCount: 1, revealWordCount: 0 },
      );
      applyWordSnapshot(result.snapshot);
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
        dispatchSession({
          type: ANSWER_COMPLETED,
          translationDisplayMode: "current_answered",
        });
      }
      replayAssistStageRef.current = nextStage;
      const playbackPlan = buildReplayPlaybackPlan(
        currentSentence,
        currentSentenceTiming,
        assistedSnapshot.snapshot.activeWordIndex,
        selectedPlaybackRate,
      );
      debugImmersiveLog("manual_replay", {
        source,
        sentenceIndex: currentSentenceIndex,
        stage: nextStage,
        assistance,
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
      selectedPlaybackRate,
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
        const result = await playSentence(previousSentence, {
          initialRate: selectedPlaybackRate,
          rateSteps: [],
        }, { skipSeek: true });
        if (!result.ok) {
          dispatchSession({ type: SET_PHASE, phase: "typing" });
          setMediaError("播放上一句失败，请稍后重试。");
          debugImmersiveLog("previous_sentence_speaker.failed", {
            source,
            sentenceIndex: currentSentenceIndex,
            reason: result.reason || "unknown",
          });
          return;
        }
        dispatchSession({
          type: PLAYBACK_STARTED,
          phase: "playing",
          translationDisplayMode: "previous",
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
    requestHandleSentencePassed,
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

  const handleTranslationMaskPointerDown = useCallback(
    (event, mode = "move") => {
      if (!translationMaskEnabled || !resolvedTranslationMaskRect || !translationMaskMetrics) return;
      if (typeof event.button === "number" && event.button !== 0) return;
      const gesture = translationMaskGestureRef.current;
      if (gesture.pointerId !== null && gesture.pointerId !== event.pointerId) return;
      showTranslationMaskChrome();
      event.preventDefault();
      event.stopPropagation();
      gesture.pointerId = event.pointerId;
      gesture.mode = mode;
      gesture.startX = event.clientX;
      gesture.startY = event.clientY;
      gesture.startRect = { ...resolvedTranslationMaskRect };
      gesture.latestRect = { ...resolvedTranslationMaskRect };
      gesture.captureElement = event.currentTarget;
      if (typeof event.currentTarget?.setPointerCapture === "function") {
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch (_) {
          // Ignore pointer capture failures across browsers.
        }
      }
    },
    [resolvedTranslationMaskRect, showTranslationMaskChrome, translationMaskEnabled, translationMaskMetrics],
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
    if (typeof document === "undefined") return undefined;

    const syncFullscreenState = () => {
      const fullscreenElement = getFullscreenElement();
      const nextIsNativeVideoFullscreen = Boolean(
        isIpadSafari &&
          mediaElementRef.current &&
          (mediaElementRef.current.webkitDisplayingFullscreen || document.webkitIsFullScreen),
      );
      const nextIsCinemaFullscreen = Boolean(
        nextIsNativeVideoFullscreen || (immersiveContainerRef.current && fullscreenElement === immersiveContainerRef.current),
      );
      const leftSystemFullscreen = isCinemaFullscreen && !nextIsCinemaFullscreen && !isFullscreenFallback;
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
  }, [clearProgrammaticFullscreenExit, exitImmersive, hasExitHandler, immersiveActive, isCinemaFullscreen, isFullscreenFallback, isIpadSafari, lesson?.id]);

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
      clearTranslationMaskChromeIdleTimer();
    };
  }, [clearTranslationMaskChromeIdleTimer]);

  useEffect(() => {
    return () => {
      clearProgrammaticFullscreenExit();
    };
  }, [clearProgrammaticFullscreenExit]);

  useEffect(() => {
    return () => {
      clearFocusRestoreTimer();
    };
  }, [clearFocusRestoreTimer]);

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
      setIsCssFullscreen(false);
    })();
  }, [cinemaFullscreenActive, immersiveActive]);

  useEffect(() => {
    if (!typingEnabled || !cinemaFullscreenActive) return;
    focusTypingInput(isTouchDevice);
  }, [cinemaFullscreenActive, focusTypingInput, isTouchDevice, typingEnabled]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const handlePointerMove = (event) => {
      const gesture = translationMaskGestureRef.current;
      if (gesture.pointerId === null || gesture.pointerId !== event.pointerId || !gesture.mode || !translationMaskMetrics) {
        return;
      }
      const startRect = gesture.startRect;
      if (!startRect) return;
      const deltaX = event.clientX - gesture.startX;
      const deltaY = event.clientY - gesture.startY;
      const nextRect =
        gesture.mode === "move"
          ? {
              ...startRect,
              left: clampNumber(startRect.left + deltaX, 0, Math.max(0, translationMaskMetrics.width - startRect.width)),
              top: clampNumber(startRect.top + deltaY, 0, Math.max(0, translationMaskMetrics.height - startRect.height)),
            }
          : resolveTranslationMaskResizeRect(startRect, gesture.mode, deltaX, deltaY, translationMaskMetrics);
      if (!nextRect) return;
      gesture.latestRect = nextRect;
      setTranslationMaskRect(convertTranslationMaskRectToStored(nextRect, translationMaskMetrics));
    };

    const handlePointerFinish = (event) => {
      const gesture = translationMaskGestureRef.current;
      if (gesture.pointerId === null || (event && gesture.pointerId !== event.pointerId)) return;
      if (gesture.latestRect) {
        persistTranslationMaskPreference(translationMaskEnabled, convertTranslationMaskRectToStored(gesture.latestRect, translationMaskMetrics));
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
    translationMaskMetrics,
  ]);

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
        requestReplayCurrentSentence(`shortcut_${getShortcutLabel(learningSettings.shortcuts.replay_sentence)}`);
        return;
      }
      if (isShortcutPressed(event, learningSettings.shortcuts.toggle_pause_playback)) {
        event.preventDefault();
        event.stopPropagation();
        requestTogglePausePlayback(`shortcut_${getShortcutLabel(learningSettings.shortcuts.toggle_pause_playback)}`);
        return;
      }
      if (isShortcutPressed(event, learningSettings.shortcuts.previous_sentence)) {
        event.preventDefault();
        event.stopPropagation();
        requestNavigateSentence({
          delta: -1,
          source: `shortcut_${getShortcutLabel(learningSettings.shortcuts.previous_sentence)}`,
        });
        return;
      }
      if (isShortcutPressed(event, learningSettings.shortcuts.next_sentence)) {
        event.preventDefault();
        event.stopPropagation();
        requestNavigateSentence({
          delta: 1,
          source: `shortcut_${getShortcutLabel(learningSettings.shortcuts.next_sentence)}`,
        });
        return;
      }
      if (isShortcutPressed(event, learningSettings.shortcuts.reveal_letter)) {
        event.preventDefault();
        event.stopPropagation();
        requestRevealLetter(`shortcut_${getShortcutLabel(learningSettings.shortcuts.reveal_letter)}`);
        return;
      }
      if (isShortcutPressed(event, learningSettings.shortcuts.reveal_word)) {
        event.preventDefault();
        event.stopPropagation();
        requestRevealWord(`shortcut_${getShortcutLabel(learningSettings.shortcuts.reveal_word)}`);
      }
    };

    window.addEventListener("keydown", onWindowKeyDown);
    return () => {
      window.removeEventListener("keydown", onWindowKeyDown);
    };
  }, [
    exitImmersive,
    immersiveActive,
    learningSettings.shortcuts,
    requestNavigateSentence,
    requestReplayCurrentSentence,
    requestRevealLetter,
    requestRevealWord,
    requestTogglePausePlayback,
  ]);

  const handleKeyDown = useCallback(
    (event) => {
      if (!currentSentence) return;

      const key = event.key;
      if (
        showEntryHintOverlay &&
        (key === "Backspace" || (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey))
      ) {
        setShowEntryHintOverlay(false);
      }
      if (key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        void exitImmersive("shortcut_esc");
        return;
      }
      if (isShortcutPressed(event, learningSettings.shortcuts.replay_sentence)) {
        event.preventDefault();
        event.stopPropagation();
        requestReplayCurrentSentence(`shortcut_${getShortcutLabel(learningSettings.shortcuts.replay_sentence)}`);
        return;
      }
      if (isShortcutPressed(event, learningSettings.shortcuts.toggle_pause_playback)) {
        event.preventDefault();
        event.stopPropagation();
        requestTogglePausePlayback(`shortcut_${getShortcutLabel(learningSettings.shortcuts.toggle_pause_playback)}`);
        return;
      }
      if (isShortcutPressed(event, learningSettings.shortcuts.previous_sentence)) {
        event.preventDefault();
        event.stopPropagation();
        requestNavigateSentence({
          delta: -1,
          source: `shortcut_${getShortcutLabel(learningSettings.shortcuts.previous_sentence)}`,
        });
        return;
      }
      if (isShortcutPressed(event, learningSettings.shortcuts.next_sentence)) {
        event.preventDefault();
        event.stopPropagation();
        requestNavigateSentence({
          delta: 1,
          source: `shortcut_${getShortcutLabel(learningSettings.shortcuts.next_sentence)}`,
        });
        return;
      }
      if (isShortcutPressed(event, learningSettings.shortcuts.reveal_letter)) {
        event.preventDefault();
        event.stopPropagation();
        requestRevealLetter(`shortcut_${getShortcutLabel(learningSettings.shortcuts.reveal_letter)}`);
        return;
      }
      if (isShortcutPressed(event, learningSettings.shortcuts.reveal_word)) {
        event.preventDefault();
        event.stopPropagation();
        requestRevealWord(`shortcut_${getShortcutLabel(learningSettings.shortcuts.reveal_word)}`);
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
      learningSettings.shortcuts,
      playKeySound,
      requestNavigateSentence,
      requestReplayCurrentSentence,
      requestRevealLetter,
      requestRevealWord,
      requestTogglePausePlayback,
      showEntryHintOverlay,
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
  const showPlaybackRateBadge =
    cinemaFullscreenActive && Math.abs(selectedPlaybackRate - DEFAULT_IMMERSIVE_PLAYBACK_RATE) > 0.001;
  const showTranslationMaskToggle = cinemaFullscreenActive && mediaMode === "video" && !needsBinding;
  const playbackRateLabel = formatPlaybackRateLabel(selectedPlaybackRate);
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
    cinemaFullscreenActive ? "immersive-page-shell--cinema" : "",
    isFullscreenFallback && !isCssFullscreen ? "immersive-page-shell--fallback" : "",
    isCssFullscreen ? "immersive-page-shell--css-fullscreen" : "",
    isTouchDevice ? "immersive-page-shell--touch" : "",
    mobileViewportState.keyboardOpen ? "immersive-page-shell--keyboard-open" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const typingInputClassName = [
    "immersive-hidden-input",
    isTouchDevice ? "immersive-hidden-input--touch" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
      <div ref={immersiveContainerRef} className={immersivePageShellClassName}>
        <Card
        className={`immersive-page ${immersiveActive ? "immersive-page--immersive" : ""} ${
          cinemaFullscreenActive ? "immersive-page--cinema" : ""
        }`}
        onClick={handleImmersivePageClick}
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
                  {showTranslationMaskToggle ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className={cinemaButtonClassName}
                      aria-pressed={translationMaskEnabled}
                      aria-label={translationMaskEnabled ? "关闭字幕遮挡板" : "开启字幕遮挡板"}
                      title={translationMaskEnabled ? "关闭字幕遮挡板" : "开启字幕遮挡板"}
                      onClick={handleTranslationMaskButtonClick}
                    >
                      <Eye className="size-4" />
                      字幕遮挡板
                    </Button>
                  ) : null}
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
          <div ref={immersiveMediaRef} className={`immersive-media ${cinemaFullscreenActive ? "immersive-media--cinema" : ""}`}>
          {!needsBinding && mediaMode === "video" ? (
            <video
              ref={mediaElementRef}
              className={allowNativeVideoFullscreen ? "immersive-media-video immersive-media-video--allow-native-fullscreen" : "immersive-media-video"}
              src={mediaBlobUrl || undefined}
              preload="metadata"
              onLoadedMetadata={() => setMediaReady(true)}
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
              className={`immersive-typing ${cinemaFullscreenActive ? "immersive-typing--cinema" : ""}`}
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
                  <SimpleTooltip content="重复播放当前句子，加强听力训练" side="top">
                    <button
                      type="button"
                      className={`immersive-session-toggle ${singleSentenceLoopEnabled ? "immersive-session-toggle--active" : ""}`}
                      aria-pressed={singleSentenceLoopEnabled}
                      onClick={handleToggleSingleSentenceLoop}
                    >
                      精听
                    </button>
                  </SimpleTooltip>
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
                  <SimpleTooltip content="恢复默认倍速 1.0x" side="top">
                    <button type="button" className="immersive-session-action" onClick={handleResetPlaybackRate}                    >
                      重置
                    </button>
                  </SimpleTooltip>
                  <SimpleTooltip
                    key={`fixed-${playbackRatePinned}`}
                    content={playbackRatePinned ? "取消固定倍速" : "切换句子时保持倍速不变"}
                    side="top"
                  >
                    <button
                      type="button"
                      className={`immersive-session-toggle ${playbackRatePinned ? "immersive-session-toggle--active" : ""}`}
                      aria-pressed={playbackRatePinned}
                      onClick={handleTogglePlaybackRatePinned}
                    >
                      固定
                    </button>
                  </SimpleTooltip>
                </div>
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
                <div
                  className={`immersive-previous-sentence ${cinemaFullscreenActive ? "immersive-previous-sentence--cinema" : ""}`}
                >
                  {canRenderInteractiveWordbook ? (
                    <>
                      <div className="immersive-previous-sentence__row">
                        <div
                          className={`min-w-0 flex flex-1 items-center gap-x-1 gap-y-2 ${
                            cinemaFullscreenActive
                              ? "overflow-x-auto whitespace-nowrap flex-nowrap"
                              : "flex-wrap"
                          }`}
                        >
                          <span className="shrink-0 text-foreground">{wordbookSentenceHeading}：</span>
                          {wordbookSentenceTokens.map((token, index) => {
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
                      <p className={`pl-[4.5em] ${cinemaFullscreenActive ? "overflow-x-auto whitespace-nowrap" : ""}`}>
                        {wordbookSentenceZh}
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="immersive-previous-sentence__row">
                        <p className={`min-w-0 flex-1 ${cinemaFullscreenActive ? "overflow-x-auto whitespace-nowrap" : ""}`}>
                          {translationHeading}：{translationEn}
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
                      <p className={`pl-[4.5em] ${cinemaFullscreenActive ? "overflow-x-auto whitespace-nowrap" : ""}`}>
                        {translationZh}
                      </p>
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
          </CardContent>
        </Card>
      </div>
  );
}

