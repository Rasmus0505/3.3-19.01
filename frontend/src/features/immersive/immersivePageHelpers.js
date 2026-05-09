import {
  SHORTCUT_ACTIONS,
  TRANSLATION_MASK_LAYOUT_VERSION,
  getShortcutLabel,
} from "./learningSettings";
import { DEFAULT_IMMERSIVE_PLAYBACK_RATE, normalizePlaybackRate } from "./immersiveSessionMachine";
import { getMediaExt, isAudioFilename, isVideoFilename, normalizeToken } from "./tokenNormalize";

const LOCAL_MEDIA_REQUIRED_CODE = "LOCAL_MEDIA_REQUIRED";

const APOSTROPHE_RE = /['']/g;
function normalizeComparableToken(token) {
  return normalizeToken(String(token || "")).replace(APOSTROPHE_RE, "");
}
function isApostropheChar(char) {
  return char === "'" || char === "'";
}
function buildLetterSlots(expectedToken, inputValue, revealedComparableIndices = []) {
  const expected = String(expectedToken || "");
  const actual = normalizeComparableToken(inputValue);
  const revealedSet = new Set(Array.isArray(revealedComparableIndices) ? revealedComparableIndices : []);
  const slots = [];
  let typedIndex = 0;
  for (let idx = 0; idx < expected.length; idx += 1) {
    const expectedChar = expected[idx];
    if (isApostropheChar(expectedChar)) {
      slots.push({ key: `slot-fixed-${idx}`, char: "'", state: "fixed", extra: false });
      continue;
    }
    const typedChar = actual[typedIndex] || "";
    let state = "empty";
    if (typedChar) {
      const match = typedChar.toLowerCase() === expectedChar.toLowerCase();
      let charState = "wrong";
      if (match) charState = revealedSet.has(typedIndex) ? "revealed" : "correct";
      state = charState;
      typedIndex += 1;
    }
    slots.push({ key: `slot-${idx}`, char: typedChar || "\u00A0", state, extra: false });
  }
  for (let idx = typedIndex; idx < actual.length; idx += 1) {
    slots.push({ key: `extra-${idx}`, char: actual[idx] || "\u00A0", state: "wrong", extra: true });
  }
  if (!slots.length) return [{ key: "slot-empty", char: "\u00A0", state: "empty", extra: false }];
  return slots;
}

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
  if (detailStr && detailStr !== msg) {
    const shortMsg = msg.slice(0, 24);
    if (!shortMsg || !detailStr.startsWith(shortMsg)) {
      out = out ? `${out}\n${detailStr}` : detailStr;
    }
  }
  if (out.trim()) return out.trim();
  if (typeof detail === "string" && detail.trim()) return detail.trim();
  return httpStatus ? `评测失败（HTTP ${httpStatus}）` : "评测失败";
}

function resolveImmersiveShellHeightPx({
  isTouchDevice = false,
  currentBaseline = 0,
  fallbackHeight = 0,
  visualHeight = 0,
  containerTop = 0,
}) {
  if (isTouchDevice) {
    return Math.max(0, Math.round(currentBaseline || fallbackHeight || visualHeight || 0));
  }
  const safeTop = Math.max(0, Math.round(containerTop || 0));
  const availableHeight = Math.max(0, Math.round(fallbackHeight || 0) - safeTop);
  if (availableHeight > 0) return availableHeight;
  return Math.max(0, Math.round(currentBaseline || fallbackHeight || visualHeight || 0));
}
const WORD_TIMING_TOLERANCE_MS = 140;
const WORDBOOK_LONG_PRESS_MS = 260;
const MOBILE_KEYBOARD_MIN_INSET_PX = 120;
const TRANSLATION_MASK_MIN_WIDTH_PX = 120;
const TRANSLATION_MASK_MIN_HEIGHT_PX = 52;
const TRANSLATION_MASK_DEFAULT_WIDTH_RATIO = 0.58;
const TRANSLATION_MASK_DEFAULT_BOTTOM_OFFSET_PX = 12;
const TRANSLATION_MASK_CHROME_IDLE_MS = 1200;
const TRANSLATION_MASK_VISIBLE_BOTTOM_GAP_PX = 12;
const IMMERSIVE_PLAYBACK_RATE_STEP = 0.1;
const TRANSLATION_MASK_EMPTY_RECT = Object.freeze({ x: null, y: null, width: null, height: null });
const ENTRY_HINT_ACTION_IDS = ["reveal_word", "replay_sentence", "next_sentence"];
const Collins_CACHE_KEY_PREFIX = "levelTag_analysis_v1:";
const Collins_ANALYSIS_CHUNK_SIZE = 50;
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
  // Left / right edge — narrower touch target that only adjusts width without moving top/left.
  {
    key: "w",
    mode: "resize-w",
    className: "immersive-translation-mask__resize-handle immersive-translation-mask__resize-handle--left",
    ariaLabel: "从左侧调整字幕遮挡板宽度",
  },
  {
    key: "e",
    mode: "resize-e",
    className: "immersive-translation-mask__resize-handle immersive-translation-mask__resize-handle--right",
    ariaLabel: "从右侧调整字幕遮挡板宽度",
  },
];

function addSentenceCefrTokensToMap(map, sentenceResult) {
  if (!(map instanceof Map) || !sentenceResult?.tokens?.length) return;
  for (const tokenInfo of sentenceResult.tokens) {
    _addNormalizedKeysToMap(map, String(tokenInfo.word || "").toLowerCase(), tokenInfo.level);
  }
}

function addTokenLevelToMap(map, token, level) {
  if (!(map instanceof Map) || !token) return;
  _addNormalizedKeysToMap(map, String(token).toLowerCase(), level);
}

function _addNormalizedKeysToMap(map, rawLower, level) {
  const keys = new Set([
    rawLower,
    normalizeToken(rawLower),
    normalizeToken(rawLower).replace(/'/g, ""),
  ]);
  for (const k of keys) {
    if (k) map.set(k, level);
  }
}

/**
 * @param {Map} map - Collins level map
 * @param {string} token - raw token
 * @param {VocabAnalyzer|null} [fallbackAnalyzer] - if provided, missing map entries are resolved via VocabAnalyzer
 * @returns {string|undefined} Collins level or undefined
 */
function lookupBandFromMap(map, token, fallbackAnalyzer) {
  if (!(map instanceof Map)) return undefined;
  const key = normalizeToken(token);
  if (map.has(key)) return map.get(key);
  const noApos = key.replace(/'/g, "");
  if (noApos && noApos !== key && map.has(noApos)) return map.get(noApos);
  // Fallback: ask VocabAnalyzer directly (handles stopwords, nonstandard contractions, bare punctuation)
  if (fallbackAnalyzer && fallbackAnalyzer.isLoaded) {
    return fallbackAnalyzer.lookupCefrLevelForSurfaceForm(token) ?? undefined;
  }
  return undefined;
}

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
  if (safeContainerWidth <= 0 || safeContainerHeight <= 0) {
    return null;
  }
  const intrinsicWidth = Math.max(0, Number(videoElement?.videoWidth || 0));
  const intrinsicHeight = Math.max(0, Number(videoElement?.videoHeight || 0));
  // Electron / some browsers report 0×0 intrinsic size until a frame decodes; use layout box vs container.
  if (intrinsicWidth <= 0 || intrinsicHeight <= 0) {
    const vb = videoElement?.getBoundingClientRect?.();
    if (!vb || vb.width <= 0 || vb.height <= 0) return null;
    return {
      left: vb.left - containerRect.left,
      top: vb.top - containerRect.top,
      width: vb.width,
      height: vb.height,
    };
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
    // Left edge: adjust width and left, keep top/height unchanged.
    case "resize-w": {
      const left = clampNumber(startRect.left + deltaX, 0, Math.max(0, right - minWidth));
      return {
        left,
        top: startRect.top,
        width: clampNumber(right - left, minWidth, maxWidth),
        height: startRect.height,
      };
    }
    // Right edge: adjust width only, keep left/top/height unchanged.
    case "resize-e": {
      return {
        left: startRect.left,
        top: startRect.top,
        width: clampNumber(startRect.width + deltaX, minWidth, Math.min(maxWidth, boundsWidth - startRect.left)),
        height: startRect.height,
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

function resolveSessionPlaybackRate(currentRate, fallbackRate = DEFAULT_IMMERSIVE_PLAYBACK_RATE) {
  if (currentRate != null) {
    const numeric = Number(currentRate);
    if (Number.isFinite(numeric)) {
      return normalizePlaybackRate(numeric);
    }
  }
  return normalizePlaybackRate(fallbackRate);
}

function resolveRequestedPlaybackRate(...candidates) {
  for (const candidate of candidates) {
    if (candidate == null) {
      continue;
    }
    if (typeof candidate === "string" && String(candidate).trim() === "") {
      continue;
    }
    const numeric = Number(candidate);
    if (Number.isFinite(numeric)) {
      return normalizePlaybackRate(numeric);
    }
  }
  return DEFAULT_IMMERSIVE_PLAYBACK_RATE;
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
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  if (window.matchMedia("(pointer: coarse)").matches) return true;
  if (typeof navigator === "undefined") return false;
  const touchPoints = Number(navigator.maxTouchPoints || 0);
  const userAgent = String(navigator.userAgent || "");
  return touchPoints > 0 && /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);
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

function mergeSortedComparableIndices(base, additions) {
  const next = new Set([...(Array.isArray(base) ? base : []), ...additions]);
  return Array.from(next).sort((a, b) => a - b);
}

/** 精听辅助新增的每个可比位下标并入 wordRevealComparableIndices（与 buildLetterSlots 一致）。 */
function mergeRevealComparableIndicesAfterAssistance(beforeInputs, afterInputs, prevArrays) {
  const maxIdx = Math.max(
    Array.isArray(beforeInputs) ? beforeInputs.length : 0,
    Array.isArray(afterInputs) ? afterInputs.length : 0,
    Array.isArray(prevArrays) ? prevArrays.length : 0,
  );
  const next = Array.isArray(prevArrays) && prevArrays.length ? [...prevArrays] : [];
  while (next.length < maxIdx) next.push([]);
  for (let i = 0; i < maxIdx; i += 1) {
    const beforeLen = normalizeComparableToken(beforeInputs[i] || "").length;
    const afterLen = normalizeComparableToken(afterInputs[i] || "").length;
    const delta = Math.max(0, afterLen - beforeLen);
    if (delta > 0) {
      const additions = Array.from({ length: delta }, (_, j) => beforeLen + j);
      next[i] = mergeSortedComparableIndices(next[i], additions);
    }
  }
  return next;
}

function pruneRevealComparableIndicesForInputs(wordInputs, prevArrays) {
  if (!Array.isArray(prevArrays) || !prevArrays.length) return prevArrays;
  let changed = false;
  const next = prevArrays.map((arr, i) => {
    const len = normalizeComparableToken(wordInputs[i] || "").length;
    const pruned = (arr || []).filter((idx) => idx < len);
    if (pruned.length !== (arr || []).length) changed = true;
    return pruned;
  });
  return changed ? next : prevArrays;
}

/**
 * 匹配 expectedTokens 中需要自动显示的词/短语索引。
 * 短语必须连续 token 完全匹配（normalize 后比较）。
 * @param {string[]} tokens
 * @param {Array<{type:string, value:string}>} autoDisplayEntries
 * @returns {Set<number>} 需要自动显示的 token 下标集合
 */
function resolveAutoDisplayIndices(tokens, autoDisplayEntries) {
  const autoSet = new Set();
  if (!Array.isArray(tokens) || !Array.isArray(autoDisplayEntries) || !autoDisplayEntries.length) {
    return autoSet;
  }

  // 构建条目列表：单词条目 { type, words: [single] }，短语条目 { type, words: [multi] }
  const entries = [];
  for (const entry of autoDisplayEntries) {
    if (!entry.value) continue;
    const words = String(entry.value).trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    entries.push({ type: entry.type, words });
  }

  // 按短语长度降序排序（长短语优先匹配）
  entries.sort((a, b) => b.words.length - a.words.length);

  // 跳过已匹配的下标，避免短语与单词冲突
  const skip = new Set();

  for (const entry of entries) {
    const wordCount = entry.words.length;
    if (wordCount === 1) {
      // 单词条目：扫描所有 token
      for (let i = 0; i < tokens.length; i++) {
        if (skip.has(i)) continue;
        const normalized = normalizeComparableToken(tokens[i]);
        if (normalized === entry.words[0]) {
          autoSet.add(i);
          skip.add(i);
        }
      }
    } else {
      // 短语条目：滑动窗口匹配连续 token
      for (let i = 0; i <= tokens.length - wordCount; i++) {
        if (skip.has(i)) continue;
        let match = true;
        for (let j = 0; j < wordCount; j++) {
          if (skip.has(i + j)) { match = false; break; }
          const normalized = normalizeComparableToken(tokens[i + j]);
          if (normalized !== entry.words[j]) { match = false; break; }
        }
        if (match) {
          for (let j = 0; j < wordCount; j++) {
            autoSet.add(i + j);
            skip.add(i + j);
          }
        }
      }
    }
  }

  return autoSet;
}

function createWordState(tokens) {
  const safeTokens = Array.isArray(tokens) ? tokens.filter((t) => typeof t === "string" && t.trim()) : [];
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

function shouldAutoAdvanceSentence({
  immersiveActive = false,
  sentenceTypingDone = false,
  postAnswerReplayState = "idle",
  sentenceAdvanceLocked = false,
  autoReplayAnsweredSentence = false,
  singleSentenceLoopEnabled = false,
  sentencePlaybackRequired = true,
  sentencePlaybackDone = false,
} = {}) {
  if (!immersiveActive || !sentenceTypingDone || sentenceAdvanceLocked) {
    return false;
  }

  if (autoReplayAnsweredSentence) {
    if (singleSentenceLoopEnabled) {
      return false;
    }
    return postAnswerReplayState === "completed";
  }

  if (postAnswerReplayState !== "idle") {
    return false;
  }

  if (sentencePlaybackRequired && !sentencePlaybackDone) {
    return false;
  }

  return true;
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

export {
  LOCAL_MEDIA_REQUIRED_CODE,
  WORD_TIMING_TOLERANCE_MS,
  WORDBOOK_LONG_PRESS_MS,
  MOBILE_KEYBOARD_MIN_INSET_PX,
  TRANSLATION_MASK_MIN_WIDTH_PX,
  TRANSLATION_MASK_MIN_HEIGHT_PX,
  TRANSLATION_MASK_DEFAULT_WIDTH_RATIO,
  TRANSLATION_MASK_DEFAULT_BOTTOM_OFFSET_PX,
  TRANSLATION_MASK_CHROME_IDLE_MS,
  TRANSLATION_MASK_VISIBLE_BOTTOM_GAP_PX,
  IMMERSIVE_PLAYBACK_RATE_STEP,
  TRANSLATION_MASK_EMPTY_RECT,
  ENTRY_HINT_ACTION_IDS,
  Collins_CACHE_KEY_PREFIX,
  Collins_ANALYSIS_CHUNK_SIZE,
  MEDIA_TYPE_BY_EXTENSION,
  TRANSLATION_MASK_RESIZE_HANDLES,
  normalizeComparableToken,
  buildLetterSlots,
  formatSoeAssessErrorMessage,
  resolveImmersiveShellHeightPx,
  resolveAutoDisplayIndices,
  addSentenceCefrTokensToMap,
  addTokenLevelToMap,
  lookupBandFromMap,
  clampNumber,
  normalizeTranslationMaskRect,
  convertTranslationMaskRectToStored,
  buildTranslationMaskUiPreference,
  buildDefaultTranslationMaskRect,
  measureContainedVideoRect,
  resolveTranslationMaskRect,
  resolveTranslationMaskResizeRect,
  debugImmersiveLog,
  buildImmersiveEntryHintItems,
  formatPlaybackRateLabel,
  formatPlaybackRateInputValue,
  resolveSessionPlaybackRate,
  resolveRequestedPlaybackRate,
  isIpadSafariBrowser,
  isTouchPrimaryInputDevice,
  countTokenInputErrors,
  mergeSortedComparableIndices,
  mergeRevealComparableIndicesAfterAssistance,
  pruneRevealComparableIndicesForInputs,
  createWordState,
  buildSelectableSentenceTokens,
  resolveInteractiveWordbookContext,
  shouldAutoAdvanceSentence,
  toggleWordbookTokenIndex,
  buildWordbookTokenRange,
  cloneWordSnapshot,
  completeActiveWordInSnapshot,
  revealLetterInSnapshot,
  applyReplayAssistanceToSnapshot,
  readTimeMs,
  getWordBeginMs,
  getWordEndMs,
  toReplayWordItem,
  collectReplayWords,
  alignSentenceTokenTimings,
  buildSentenceWordTimingMap,
  resolveReplayBoundaryMs,
  buildReplayPlaybackPlan,
  isEditableShortcutTarget,
  shouldKeepControlFocus,
  resolveMediaModeFromFileName,
  inferMediaModeFromContentType,
  inferMediaTypeFromFileName,
  resolveMediaModeByTypeAndName,
  isLocalMediaRequiredPayload,
  formatMediaLoadError,
  readErrorPayload,
};



