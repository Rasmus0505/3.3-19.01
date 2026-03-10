import { ArrowLeft, ArrowRight, Eye, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getStorageEstimate, getLessonMedia, readMediaDurationSeconds, requestPersistentStorage, saveLessonMedia } from "../../shared/media/localMediaStore";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../shared/ui";
import { getMediaExt, isAudioFilename, isVideoFilename, normalizeToken } from "./tokenNormalize";
import { useSentencePlayback } from "./useSentencePlayback";
import { useTypingFeedbackSounds } from "./useTypingFeedbackSounds";
import "./immersive.css";

const LEARNING_SETTINGS_STORAGE_KEY = "immersive_learning_settings_v1";
const LOCAL_MEDIA_REQUIRED_CODE = "LOCAL_MEDIA_REQUIRED";
const APOSTROPHE_RE = /[’']/g;
const CINEMA_CONTROLS_IDLE_MS = 3000;
const WORD_TIMING_TOLERANCE_MS = 140;
const SHORTCUT_OPTIONS = [
  { value: "space", label: "Space" },
  { value: "shift+space", label: "Shift+Space" },
  { value: "enter", label: "Enter" },
  { value: "shift+enter", label: "Shift+Enter" },
  { value: "arrowleft", label: "ArrowLeft" },
  { value: "arrowright", label: "ArrowRight" },
  { value: "shift+arrowleft", label: "Shift+ArrowLeft" },
  { value: "shift+arrowright", label: "Shift+ArrowRight" },
  { value: "shift+r", label: "Shift+R" },
  { value: "shift+n", label: "Shift+N" },
  { value: "shift+p", label: "Shift+P" },
];
const SHORTCUT_ACTIONS = [
  { id: "reveal_letter", label: "揭示字母" },
  { id: "reveal_word", label: "揭示单词" },
  { id: "previous_sentence", label: "上一句" },
  { id: "next_sentence", label: "下一句" },
  { id: "replay_sentence", label: "重播" },
];
const DEFAULT_SHORTCUTS = {
  reveal_letter: "space",
  reveal_word: "shift+space",
  previous_sentence: "arrowleft",
  next_sentence: "enter",
  replay_sentence: "shift+r",
};
const REPLAY_PRESET_OPTIONS = [
  { id: "standard", label: "标准渐进" },
  { id: "recall", label: "更强回忆" },
  { id: "assist", label: "更强扶助" },
  { id: "custom", label: "自定义" },
];
const DEFAULT_CUSTOM_REPLAY_CONFIG = {
  tailSpeedStep: 0.1,
  minimumTailSpeed: 0.75,
  revealLetterAt: 2,
  revealWordAt: 3,
  extraRevealWordsPerReplay: 1,
};
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

function clampNumber(value, min, max, fallback, { integer = false } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const clamped = Math.min(max, Math.max(min, parsed));
  return integer ? Math.round(clamped) : Number(clamped.toFixed(2));
}

function normalizeShortcutValue(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return SHORTCUT_OPTIONS.some((item) => item.value === normalized) ? normalized : "";
}

function getShortcutLabel(shortcutValue) {
  return SHORTCUT_OPTIONS.find((item) => item.value === shortcutValue)?.label || shortcutValue;
}

function getFirstAvailableShortcut(excluded = new Set(), preferred = "") {
  const normalizedPreferred = normalizeShortcutValue(preferred);
  if (normalizedPreferred && !excluded.has(normalizedPreferred)) {
    return normalizedPreferred;
  }
  return SHORTCUT_OPTIONS.find((item) => !excluded.has(item.value))?.value || SHORTCUT_OPTIONS[0].value;
}

function sanitizeShortcutMap(rawShortcutMap = {}) {
  const nextShortcutMap = {};
  const occupied = new Set();
  for (const action of SHORTCUT_ACTIONS) {
    const requested = normalizeShortcutValue(rawShortcutMap?.[action.id]) || DEFAULT_SHORTCUTS[action.id];
    const resolved = occupied.has(requested) ? getFirstAvailableShortcut(occupied, DEFAULT_SHORTCUTS[action.id]) : requested;
    nextShortcutMap[action.id] = resolved;
    occupied.add(resolved);
  }
  return nextShortcutMap;
}

function sanitizeCustomReplayConfig(rawConfig = {}) {
  return {
    tailSpeedStep: clampNumber(rawConfig?.tailSpeedStep, 0.01, 0.5, DEFAULT_CUSTOM_REPLAY_CONFIG.tailSpeedStep),
    minimumTailSpeed: clampNumber(rawConfig?.minimumTailSpeed, 0.4, 0.98, DEFAULT_CUSTOM_REPLAY_CONFIG.minimumTailSpeed),
    revealLetterAt: clampNumber(rawConfig?.revealLetterAt, 0, 8, DEFAULT_CUSTOM_REPLAY_CONFIG.revealLetterAt, { integer: true }),
    revealWordAt: clampNumber(rawConfig?.revealWordAt, 0, 8, DEFAULT_CUSTOM_REPLAY_CONFIG.revealWordAt, { integer: true }),
    extraRevealWordsPerReplay: clampNumber(
      rawConfig?.extraRevealWordsPerReplay,
      0,
      4,
      DEFAULT_CUSTOM_REPLAY_CONFIG.extraRevealWordsPerReplay,
      { integer: true },
    ),
  };
}

function sanitizeLearningSettings(rawSettings = {}) {
  const presetId = REPLAY_PRESET_OPTIONS.some((item) => item.id === rawSettings?.presetId) ? rawSettings.presetId : "standard";
  return {
    presetId,
    shortcuts: sanitizeShortcutMap(rawSettings?.shortcuts),
    customConfig: sanitizeCustomReplayConfig(rawSettings?.customConfig),
  };
}

function getInitialLearningSettings() {
  if (typeof window === "undefined") {
    return sanitizeLearningSettings();
  }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LEARNING_SETTINGS_STORAGE_KEY) || "{}");
    return sanitizeLearningSettings(parsed);
  } catch (_) {
    return sanitizeLearningSettings();
  }
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

function getPresetSummaryLines(learningSettings) {
  const presetId = learningSettings?.presetId || "standard";
  if (presetId === "standard") {
    return [
      "第1次：未答尾段 0.95x",
      "第2次：未答尾段 0.85x，揭示当前词 1 个字母",
      "第3次：未答尾段 0.75x，揭示当前词 1 个完整单词",
      "第4次起：保持 0.75x，每次额外多揭示 1 个单词",
    ];
  }
  if (presetId === "recall") {
    return [
      "第1次：未答尾段 0.95x",
      "第2次：未答尾段 0.85x",
      "第3次：未答尾段 0.75x，揭示当前词 1 个字母",
      "第4次起：保持 0.75x，每次揭示 1 个单词",
    ];
  }
  if (presetId === "assist") {
    return [
      "第1次：未答尾段 0.90x，揭示当前词 1 个字母",
      "第2次：未答尾段 0.80x，揭示当前词 1 个单词",
      "第3次起：保持 0.75x，每次揭示 1 个单词",
    ];
  }
  const customConfig = sanitizeCustomReplayConfig(learningSettings?.customConfig);
  return [
    `每次手动重播尾段额外降速 ${(customConfig.tailSpeedStep * 100).toFixed(0)}%，最低 ${customConfig.minimumTailSpeed.toFixed(2)}x`,
    customConfig.revealLetterAt > 0 ? `第 ${customConfig.revealLetterAt} 次重播开始揭示 1 个字母` : "不自动揭示字母",
    customConfig.revealWordAt > 0
      ? `第 ${customConfig.revealWordAt} 次重播开始揭示单词，之后每次额外 +${customConfig.extraRevealWordsPerReplay} 个单词`
      : "不自动揭示单词",
  ];
}

function resolveReplayAssistance(learningSettings, stage) {
  const safeStage = Math.max(1, Number(stage || 1));
  const presetId = learningSettings?.presetId || "standard";
  if (presetId === "standard") {
    return {
      tailRate: safeStage === 1 ? 0.95 : safeStage === 2 ? 0.85 : 0.75,
      revealLetterCount: safeStage === 2 ? 1 : 0,
      revealWordCount: safeStage >= 3 ? 1 + Math.max(0, safeStage - 3) : 0,
    };
  }
  if (presetId === "recall") {
    return {
      tailRate: safeStage === 1 ? 0.95 : safeStage === 2 ? 0.85 : 0.75,
      revealLetterCount: safeStage === 3 ? 1 : 0,
      revealWordCount: safeStage >= 4 ? 1 : 0,
    };
  }
  if (presetId === "assist") {
    return {
      tailRate: safeStage === 1 ? 0.9 : safeStage === 2 ? 0.8 : 0.75,
      revealLetterCount: safeStage === 1 ? 1 : 0,
      revealWordCount: safeStage >= 2 ? 1 : 0,
    };
  }
  const customConfig = sanitizeCustomReplayConfig(learningSettings?.customConfig);
  const tailRate = Math.max(customConfig.minimumTailSpeed, Number((1 - safeStage * customConfig.tailSpeedStep).toFixed(2)));
  const revealWordCount =
    customConfig.revealWordAt > 0 && safeStage >= customConfig.revealWordAt
      ? 1 + Math.max(0, safeStage - customConfig.revealWordAt) * customConfig.extraRevealWordsPerReplay
      : 0;
  return {
    tailRate,
    revealLetterCount: revealWordCount > 0 ? 0 : customConfig.revealLetterAt > 0 && safeStage === customConfig.revealLetterAt ? 1 : 0,
    revealWordCount,
  };
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

  if (!resolvedBoundaryMs) {
    return {
      initialRate: safeTailRate,
      rateSteps: [],
      preciseBoundary: false,
      tailBoundaryMs: sentenceStartMs,
    };
  }

  if (resolvedBoundaryMs <= sentenceStartMs + 30) {
    return {
      initialRate: safeTailRate,
      rateSteps: [],
      preciseBoundary: true,
      tailBoundaryMs: resolvedBoundaryMs,
    };
  }

  if (resolvedBoundaryMs >= sentenceEndMs - 30) {
    return {
      initialRate: 1,
      rateSteps: [],
      preciseBoundary: true,
      tailBoundaryMs: resolvedBoundaryMs,
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
  };
}

function isShortcutPressed(event, shortcutValue) {
  const key = String(event.key || "").toLowerCase();
  switch (shortcutValue) {
    case "space":
      return !event.shiftKey && event.key === " ";
    case "shift+space":
      return event.shiftKey && event.key === " ";
    case "enter":
      return !event.shiftKey && key === "enter";
    case "shift+enter":
      return event.shiftKey && key === "enter";
    case "arrowleft":
      return !event.shiftKey && key === "arrowleft";
    case "arrowright":
      return !event.shiftKey && key === "arrowright";
    case "shift+arrowleft":
      return event.shiftKey && key === "arrowleft";
    case "shift+arrowright":
      return event.shiftKey && key === "arrowright";
    case "shift+r":
      return event.shiftKey && key === "r";
    case "shift+n":
      return event.shiftKey && key === "n";
    case "shift+p":
      return event.shiftKey && key === "p";
    default:
      return false;
  }
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
  const [learningSettings, setLearningSettings] = useState(() => getInitialLearningSettings());
  const [settingsError, setSettingsError] = useState("");
  const [sentenceTypingDone, setSentenceTypingDone] = useState(false);
  const [sentencePlaybackDone, setSentencePlaybackDone] = useState(false);
  const [sentencePlaybackRequired, setSentencePlaybackRequired] = useState(true);
  const [isCinemaFullscreen, setIsCinemaFullscreen] = useState(false);
  const [isFullscreenFallback, setIsFullscreenFallback] = useState(false);
  const [showFullscreenPreviousSentence, setShowFullscreenPreviousSentence] = useState(false);
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
  const playbackKindRef = useRef("initial");
  const replayAssistStageRef = useRef(0);
  const replayProgressAnchorRef = useRef(0);
  const pendingAutoFullscreenRef = useRef(false);
  const cinemaFullscreenActive = isCinemaFullscreen || isFullscreenFallback;
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

  const currentSentence = lesson?.sentences?.[currentSentenceIndex] || null;
  const previousSentence = currentSentenceIndex > 0 ? lesson?.sentences?.[currentSentenceIndex - 1] || null : null;
  const previousSentenceEn = previousSentence?.text_en || "(当前是第一句，无上一句)";
  const previousSentenceZh = previousSentence
    ? previousSentence.text_zh || "(翻译失败，暂缺)"
    : "(暂无上一句中文翻译)";
  const expectedTokens = useMemo(() => (Array.isArray(currentSentence?.tokens) ? currentSentence.tokens : []), [currentSentence?.tokens]);
  const sentenceWordTimingMap = useMemo(
    () => buildSentenceWordTimingMap(lesson?.sentences || [], lesson?.subtitle_cache_seed?.asr_payload || null),
    [lesson?.sentences, lesson?.subtitle_cache_seed?.asr_payload],
  );
  const currentSentenceTiming = sentenceWordTimingMap[currentSentenceIndex] || null;
  const sentenceCount = lesson?.sentences?.length || 0;
  const expectedSourceDurationSec = Math.max(0, Number(lesson?.source_duration_ms || 0) / 1000);

  const { playKeySound, playWrongSound, playCorrectSound } = useTypingFeedbackSounds();

  const resetSentenceGate = useCallback((playbackRequired = true) => {
    sentenceAdvanceLockedRef.current = false;
    playbackKindRef.current = "initial";
    setSentenceTypingDone(false);
    setSentencePlaybackDone(false);
    setSentencePlaybackRequired(Boolean(playbackRequired));
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
    if (!expectedTokens.length) {
      setSentenceTypingDone(true);
      return;
    }
    setPhase("typing");
  }, [currentSentenceIndex, expectedTokens.length, sentenceTypingDone]);

  const { isPlaying, playSentence, stopPlayback, onMainMediaTimeUpdate } = useSentencePlayback({
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
    if (sentencePlaybackRequired && !sentencePlaybackDone) return;
    if (sentenceAdvanceLockedRef.current) return;
    sentenceAdvanceLockedRef.current = true;
    setPhase("transition");
    setTimeout(() => {
      void handleSentencePassed();
    }, 120);
  }, [handleSentencePassed, immersiveActive, sentencePlaybackDone, sentencePlaybackRequired, sentenceTypingDone]);

  useEffect(() => {
    if (immersiveActive) return;
    stopPlayback();
    setPhase("idle");
  }, [immersiveActive, stopPlayback]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(LEARNING_SETTINGS_STORAGE_KEY, JSON.stringify(sanitizeLearningSettings(learningSettings)));
  }, [learningSettings]);

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
        await exitElementFullscreen().catch(() => {});
        setIsCinemaFullscreen(false);
        setIsFullscreenFallback(false);
        setShowFullscreenPreviousSentence(false);
      }
      handler(source);
    },
    [isCinemaFullscreen, isFullscreenFallback, onBack, onExitImmersive],
  );

  const startImmersive = useCallback(() => {
    if (typeof onStartImmersive !== "function") return;
    pendingAutoFullscreenRef.current = true;
    onStartImmersive();
  }, [onStartImmersive]);

  const exitCinemaFullscreen = useCallback(async () => {
    setShowFullscreenPreviousSentence(false);
    if (isFullscreenFallback) {
      setIsFullscreenFallback(false);
      setIsCinemaFullscreen(false);
      return;
    }

    const fullscreenElement = getFullscreenElement();
    if (fullscreenElement && immersiveContainerRef.current && fullscreenElement === immersiveContainerRef.current) {
      await exitElementFullscreen().catch(() => {});
    }
    setIsCinemaFullscreen(false);
  }, [isFullscreenFallback]);

  const enterCinemaFullscreen = useCallback(async () => {
    if (!immersiveActive) return;
    if (isCinemaFullscreen || isFullscreenFallback) return;

    setShowFullscreenPreviousSentence(false);
    const container = immersiveContainerRef.current;
    if (!container) return;

    try {
      await requestElementFullscreen(container);
      setIsFullscreenFallback(false);
      setIsCinemaFullscreen(true);
    } catch (_) {
      setIsCinemaFullscreen(false);
      setIsFullscreenFallback(true);
    }
  }, [immersiveActive, isCinemaFullscreen, isFullscreenFallback]);

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

  const updateLearningSettings = useCallback((updater) => {
    setLearningSettings((current) => {
      const nextValue = typeof updater === "function" ? updater(current) : updater;
      return sanitizeLearningSettings(nextValue);
    });
  }, []);

  const handleShortcutChange = useCallback(
    (actionId, nextShortcutValue) => {
      const normalized = normalizeShortcutValue(nextShortcutValue);
      if (!normalized) return;
      const alreadyUsedBy = SHORTCUT_ACTIONS.find(
        (item) => item.id !== actionId && learningSettings.shortcuts[item.id] === normalized,
      );
      if (alreadyUsedBy) {
        setSettingsError(`${getShortcutLabel(normalized)} 已分配给“${alreadyUsedBy.label}”，请换一个快捷键。`);
        return;
      }
      setSettingsError("");
      updateLearningSettings((current) => ({
        ...current,
        shortcuts: {
          ...current.shortcuts,
          [actionId]: normalized,
        },
      }));
    },
    [learningSettings.shortcuts, updateLearningSettings],
  );

  const handleCustomConfigChange = useCallback(
    (field, value) => {
      setSettingsError("");
      updateLearningSettings((current) => ({
        ...current,
        presetId: "custom",
        customConfig: {
          ...current.customConfig,
          [field]: value,
        },
      }));
    },
    [updateLearningSettings],
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
        preciseBoundary: playbackPlan.preciseBoundary,
        tailBoundaryMs: playbackPlan.tailBoundaryMs,
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

  useEffect(() => {
    if (typeof document === "undefined") return undefined;

    const syncFullscreenState = () => {
      const fullscreenElement = getFullscreenElement();
      const nextIsCinemaFullscreen = Boolean(immersiveContainerRef.current && fullscreenElement === immersiveContainerRef.current);
      setIsCinemaFullscreen(nextIsCinemaFullscreen);
      if (!nextIsCinemaFullscreen) {
        setShowFullscreenPreviousSentence(false);
      }
    };

    document.addEventListener("fullscreenchange", syncFullscreenState);
    document.addEventListener("webkitfullscreenchange", syncFullscreenState);
    document.addEventListener("MSFullscreenChange", syncFullscreenState);
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreenState);
      document.removeEventListener("webkitfullscreenchange", syncFullscreenState);
      document.removeEventListener("MSFullscreenChange", syncFullscreenState);
    };
  }, []);

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
    void exitCinemaFullscreen();
  }, [cinemaFullscreenActive, exitCinemaFullscreen, immersiveActive]);

  useEffect(() => {
    if (!typingEnabled || !cinemaFullscreenActive) return;
    focusTypingInput();
  }, [cinemaFullscreenActive, focusTypingInput, typingEnabled]);

  useEffect(() => {
    if (!immersiveActive) return;
    if (!pendingAutoFullscreenRef.current) return;
    if (cinemaFullscreenActive) {
      pendingAutoFullscreenRef.current = false;
      return;
    }
    pendingAutoFullscreenRef.current = false;
    void enterCinemaFullscreen();
  }, [cinemaFullscreenActive, enterCinemaFullscreen, immersiveActive]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const onWindowKeyDown = (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const fromTypingInput = event.target === typingInputRef.current;
      if (isEditableShortcutTarget(event.target) && !fromTypingInput) return;
      if (!immersiveActive) return;

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (isCinemaFullscreen || isFullscreenFallback) {
          void exitCinemaFullscreen();
          return;
        }
        void exitImmersive("shortcut_esc");
        return;
      }
      if (isShortcutPressed(event, learningSettings.shortcuts.replay_sentence)) {
        event.preventDefault();
        event.stopPropagation();
        replayCurrentSentence(`shortcut_${learningSettings.shortcuts.replay_sentence}`);
        return;
      }
      if (isShortcutPressed(event, learningSettings.shortcuts.previous_sentence)) {
        event.preventDefault();
        event.stopPropagation();
        goToPreviousSentence(`shortcut_${learningSettings.shortcuts.previous_sentence}`);
        return;
      }
      if (isShortcutPressed(event, learningSettings.shortcuts.next_sentence)) {
        event.preventDefault();
        event.stopPropagation();
        goToNextSentence(`shortcut_${learningSettings.shortcuts.next_sentence}`);
        return;
      }
      if (isShortcutPressed(event, learningSettings.shortcuts.reveal_letter)) {
        event.preventDefault();
        event.stopPropagation();
        revealCurrentLetter(`shortcut_${learningSettings.shortcuts.reveal_letter}`);
        return;
      }
      if (isShortcutPressed(event, learningSettings.shortcuts.reveal_word)) {
        event.preventDefault();
        event.stopPropagation();
        revealCurrentWord(`shortcut_${learningSettings.shortcuts.reveal_word}`);
      }
    };

    window.addEventListener("keydown", onWindowKeyDown);
    return () => {
      window.removeEventListener("keydown", onWindowKeyDown);
    };
  }, [
    exitCinemaFullscreen,
    exitImmersive,
    goToPreviousSentence,
    goToNextSentence,
    immersiveActive,
    isCinemaFullscreen,
    isFullscreenFallback,
    learningSettings.shortcuts,
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
        if (isCinemaFullscreen || isFullscreenFallback) {
          void exitCinemaFullscreen();
          return;
        }
        void exitImmersive("shortcut_esc");
        return;
      }
      if (isShortcutPressed(event, learningSettings.shortcuts.replay_sentence)) {
        event.preventDefault();
        event.stopPropagation();
        replayCurrentSentence(`shortcut_${learningSettings.shortcuts.replay_sentence}`);
        return;
      }
      if (isShortcutPressed(event, learningSettings.shortcuts.previous_sentence)) {
        event.preventDefault();
        event.stopPropagation();
        goToPreviousSentence(`shortcut_${learningSettings.shortcuts.previous_sentence}`);
        return;
      }
      if (isShortcutPressed(event, learningSettings.shortcuts.next_sentence)) {
        event.preventDefault();
        event.stopPropagation();
        goToNextSentence(`shortcut_${learningSettings.shortcuts.next_sentence}`);
        return;
      }
      if (isShortcutPressed(event, learningSettings.shortcuts.reveal_letter)) {
        event.preventDefault();
        event.stopPropagation();
        revealCurrentLetter(`shortcut_${learningSettings.shortcuts.reveal_letter}`);
        return;
      }
      if (isShortcutPressed(event, learningSettings.shortcuts.reveal_word)) {
        event.preventDefault();
        event.stopPropagation();
        revealCurrentWord(`shortcut_${learningSettings.shortcuts.reveal_word}`);
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
      exitCinemaFullscreen,
      goToPreviousSentence,
      goToNextSentence,
      isCinemaFullscreen,
      isFullscreenFallback,
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
  const canGoPrevious = currentSentenceIndex > 0;
  const canGoNext = currentSentenceIndex < Math.max(0, sentenceCount - 1);
  const canRevealLetter = typingEnabled && activeWordIndex < expectedTokens.length && expectedTokens.length > 0;
  const canRevealWord = typingEnabled && activeWordIndex < expectedTokens.length && expectedTokens.length > 0;
  const waitingForInitialPlayback = sentenceTypingDone && !sentencePlaybackDone && sentencePlaybackRequired;
  const presetSummaryLines = getPresetSummaryLines(learningSettings);
  const cinemaHeaderControlsClassName = [
    "immersive-header-left",
    cinemaFullscreenActive ? "immersive-header-left--cinema" : "",
    cinemaFullscreenActive && cinemaControlsIdle ? "immersive-header-left--cinema-idle" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const cinemaButtonClassName = cinemaFullscreenActive ? "immersive-cinema-button" : undefined;
  const toolbarButtonClassName = cinemaFullscreenActive ? "immersive-toolbar-button immersive-toolbar-button--cinema" : "immersive-toolbar-button";

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
              {immersiveActive && hasExitHandler ? (
                <Button variant="outline" size="sm" className={cinemaButtonClassName} onClick={() => void exitImmersive("button")}>
                  <ArrowLeft className="size-4" />
                  退出
                </Button>
              ) : null}
              {immersiveActive && !cinemaFullscreenActive ? (
                <Button variant="outline" size="sm" onClick={() => void enterCinemaFullscreen()}>
                  全屏学习
                </Button>
              ) : null}
              {immersiveActive && cinemaFullscreenActive ? (
                <>
                  <Button variant="outline" size="sm" className={cinemaButtonClassName} onClick={() => void exitCinemaFullscreen()}>
                    退出全屏
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cinemaButtonClassName}
                    onClick={() => setShowFullscreenPreviousSentence((prev) => !prev)}
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
            <div className="immersive-settings-panel">
              <div className="immersive-settings-card">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">开始前配置</p>
                  <p className="text-sm text-muted-foreground">先定好扶助策略和快捷键，点击“开始学习”后直接进入全屏沉浸学习。</p>
                </div>

                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-[0.18em] text-muted-foreground">学习预设</Label>
                    <div className="immersive-preset-grid">
                      {REPLAY_PRESET_OPTIONS.map((item) => {
                        const active = learningSettings.presetId === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            className={`immersive-preset-chip ${active ? "immersive-preset-chip--active" : ""}`}
                            onClick={() => {
                              setSettingsError("");
                              updateLearningSettings((current) => ({ ...current, presetId: item.id }));
                            }}
                          >
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="immersive-settings-summary">
                    {presetSummaryLines.map((line) => (
                      <p key={line}>{line}</p>
                    ))}
                  </div>

                  {learningSettings.presetId === "custom" ? (
                    <div className="immersive-custom-grid">
                      <div className="space-y-2">
                        <Label htmlFor="tail-speed-step">尾段降速步长</Label>
                        <Input
                          id="tail-speed-step"
                          type="number"
                          min="0.01"
                          max="0.5"
                          step="0.01"
                          value={learningSettings.customConfig.tailSpeedStep}
                          onChange={(event) => handleCustomConfigChange("tailSpeedStep", event.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="minimum-tail-speed">最低尾段倍速</Label>
                        <Input
                          id="minimum-tail-speed"
                          type="number"
                          min="0.4"
                          max="0.98"
                          step="0.01"
                          value={learningSettings.customConfig.minimumTailSpeed}
                          onChange={(event) => handleCustomConfigChange("minimumTailSpeed", event.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="reveal-letter-at">第几次开始揭示字母</Label>
                        <Input
                          id="reveal-letter-at"
                          type="number"
                          min="0"
                          max="8"
                          step="1"
                          value={learningSettings.customConfig.revealLetterAt}
                          onChange={(event) => handleCustomConfigChange("revealLetterAt", event.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="reveal-word-at">第几次开始揭示单词</Label>
                        <Input
                          id="reveal-word-at"
                          type="number"
                          min="0"
                          max="8"
                          step="1"
                          value={learningSettings.customConfig.revealWordAt}
                          onChange={(event) => handleCustomConfigChange("revealWordAt", event.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="extra-word-count">阈值后每次额外揭示单词数</Label>
                        <Input
                          id="extra-word-count"
                          type="number"
                          min="0"
                          max="4"
                          step="1"
                          value={learningSettings.customConfig.extraRevealWordsPerReplay}
                          onChange={(event) => handleCustomConfigChange("extraRevealWordsPerReplay", event.target.value)}
                        />
                      </div>
                    </div>
                  ) : null}

                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label className="text-xs uppercase tracking-[0.18em] text-muted-foreground">快捷键</Label>
                      <p className="text-sm text-muted-foreground">仅支持安全白名单，所有设置按当前浏览器全局记忆。</p>
                    </div>
                    <div className="immersive-shortcut-grid">
                      {SHORTCUT_ACTIONS.map((action) => (
                        <div key={action.id} className="space-y-2">
                          <Label htmlFor={`shortcut-${action.id}`}>{action.label}</Label>
                          <Select value={learningSettings.shortcuts[action.id]} onValueChange={(value) => handleShortcutChange(action.id, value)}>
                            <SelectTrigger id={`shortcut-${action.id}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {SHORTCUT_OPTIONS.map((option) => {
                                const occupiedByOther = SHORTCUT_ACTIONS.some(
                                  (item) => item.id !== action.id && learningSettings.shortcuts[item.id] === option.value,
                                );
                                return (
                                  <SelectItem key={option.value} value={option.value} disabled={occupiedByOther}>
                                    {option.label}
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>
                  </div>

                  {settingsError ? (
                    <p className="text-xs text-destructive">{settingsError}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">默认推荐：Space 揭示字母，Shift+Space 揭示单词，ArrowLeft 上一句，Enter 下一句，Shift+R 重播。</p>
                  )}
                </div>

                <Button className="h-12 w-full bg-black text-base font-semibold text-white hover:bg-black/90" onClick={startImmersive}>
                  开始学习
                </Button>
              </div>
            </div>
          ) : (
            <div className={`immersive-typing ${cinemaFullscreenActive ? "immersive-typing--cinema" : ""}`}>
              <div className="immersive-typing-toolbar">
                <div className="immersive-typing-toolbar-controls">
                  <TooltipProvider delayDuration={120}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          className={toolbarButtonClassName}
                          onClick={() => revealCurrentLetter("button_reveal_letter")}
                          disabled={!canRevealLetter}
                        >
                          揭示字母
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{getShortcutLabel(learningSettings.shortcuts.reveal_letter)}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <TooltipProvider delayDuration={120}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          className={toolbarButtonClassName}
                          onClick={() => revealCurrentWord("button_reveal_word")}
                          disabled={!canRevealWord}
                        >
                          <Eye className="size-4" />
                          揭示单词
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{getShortcutLabel(learningSettings.shortcuts.reveal_word)}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <TooltipProvider delayDuration={120}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          className={toolbarButtonClassName}
                          onClick={() => replayCurrentSentence("button_replay")}
                          disabled={phase === "transition" || needsBinding}
                        >
                          重播
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{getShortcutLabel(learningSettings.shortcuts.replay_sentence)}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <TooltipProvider delayDuration={120}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          className={toolbarButtonClassName}
                          onClick={() => goToPreviousSentence("button_prev")}
                          disabled={!canGoPrevious || phase === "transition"}
                        >
                          <ArrowLeft className="size-4" />
                          上一句
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{getShortcutLabel(learningSettings.shortcuts.previous_sentence)}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <TooltipProvider delayDuration={120}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          className={toolbarButtonClassName}
                          onClick={() => goToNextSentence("button_next")}
                          disabled={!canGoNext || phase === "transition"}
                        >
                          下一句
                          <ArrowRight className="size-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{getShortcutLabel(learningSettings.shortcuts.next_sentence)}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <Badge variant="outline">
                    已完成 {completedIndexes.length} / {sentenceCount}
                  </Badge>
                  {isPlaying ? <Badge variant="secondary">正在播放本句</Badge> : null}
                </div>
                <div className="immersive-typing-toolbar-meta">
                  <span className="immersive-shortcut-hint">
                    预设：{REPLAY_PRESET_OPTIONS.find((item) => item.id === learningSettings.presetId)?.label || "标准渐进"}
                  </span>
                  <span className="immersive-shortcut-hint">重播后会对未答尾段降速，并按阶梯逐步揭示提示。</span>
                </div>
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

              {!cinemaFullscreenActive || showFullscreenPreviousSentence ? (
                <div className={`immersive-previous-sentence ${cinemaFullscreenActive ? "immersive-previous-sentence--cinema" : ""}`}>
                  <p>上一句：{previousSentenceEn}</p>
                  <p className="pl-[4.5em]">{previousSentenceZh}</p>
                </div>
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

