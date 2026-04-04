import { DEFAULT_IMMERSIVE_PLAYBACK_RATE, normalizePlaybackRate } from "./immersiveSessionMachine";

const LEARNING_SETTINGS_STORAGE_KEY = "immersive_learning_settings_v2";
const LEGACY_LEARNING_SETTINGS_STORAGE_KEY = "immersive_learning_settings_v1";
export const LEARNING_SETTINGS_UPDATED_EVENT = "immersive-learning-settings-updated";

const RESERVED_SHORTCUT_KEYS = new Set(["escape", "tab", "backspace", "delete"]);
const MODIFIER_ONLY_KEYS = new Set(["shift", "control", "ctrl", "meta", "os"]);
const BARE_ALLOWED_SHORTCUT_KEYS = new Set([
  "space",
  "enter",
  "arrowleft",
  "arrowright",
  "arrowup",
  "arrowdown",
  "home",
  "end",
  "pageup",
  "pagedown",
  "mediaplaypause",
  "mediastop",
  "mediatracknext",
  "mediatrackprevious",
]);

const SHORT_KEY_LABELS = {
  " ": "Space",
  space: "Space",
  enter: "Enter",
  arrowleft: "ArrowLeft",
  arrowright: "ArrowRight",
  arrowup: "ArrowUp",
  arrowdown: "ArrowDown",
  home: "Home",
  end: "End",
  pageup: "PageUp",
  pagedown: "PageDown",
  mediaplaypause: "MediaPlayPause",
  mediastop: "MediaStop",
  mediatracknext: "MediaTrackNext",
  mediatrackprevious: "MediaTrackPrevious",
};

const LEGACY_SHORTCUT_BINDINGS = {
  space: { code: "Space", key: "space", shift: false, ctrl: false, alt: false, meta: false },
  "shift+space": { code: "Space", key: "space", shift: true, ctrl: false, alt: false, meta: false },
  enter: { code: "Enter", key: "enter", shift: false, ctrl: false, alt: false, meta: false },
  "shift+enter": { code: "Enter", key: "enter", shift: true, ctrl: false, alt: false, meta: false },
  "shift+a": { code: "KeyA", key: "a", shift: true, ctrl: false, alt: false, meta: false },
  "shift+s": { code: "KeyS", key: "s", shift: true, ctrl: false, alt: false, meta: false },
  "shift+q": { code: "KeyQ", key: "q", shift: true, ctrl: false, alt: false, meta: false },
  "shift+w": { code: "KeyW", key: "w", shift: true, ctrl: false, alt: false, meta: false },
  arrowleft: { code: "ArrowLeft", key: "arrowleft", shift: false, ctrl: false, alt: false, meta: false },
  arrowright: { code: "ArrowRight", key: "arrowright", shift: false, ctrl: false, alt: false, meta: false },
  "shift+arrowleft": { code: "ArrowLeft", key: "arrowleft", shift: true, ctrl: false, alt: false, meta: false },
  "shift+arrowright": { code: "ArrowRight", key: "arrowright", shift: true, ctrl: false, alt: false, meta: false },
  "shift+r": { code: "KeyR", key: "r", shift: true, ctrl: false, alt: false, meta: false },
  "shift+n": { code: "KeyN", key: "n", shift: true, ctrl: false, alt: false, meta: false },
  "shift+p": { code: "KeyP", key: "p", shift: true, ctrl: false, alt: false, meta: false },
  "shift+k": { code: "KeyK", key: "k", shift: true, ctrl: false, alt: false, meta: false },
  "shift+alt": { code: "AltLeft", key: "Alt", shift: true, ctrl: false, alt: true, meta: false },
  alt: { code: "AltLeft", key: "Alt", shift: false, ctrl: false, alt: true, meta: false },
};

export const SHORTCUT_ACTIONS = [
  { id: "reveal_letter", label: "揭示字母" },
  { id: "reveal_word", label: "揭示单词" },
  { id: "previous_sentence", label: "上一句" },
  { id: "next_sentence", label: "下一句" },
  { id: "replay_sentence", label: "重播" },
  { id: "toggle_pause_playback", label: "播放" },
  { id: "record_score", label: "录音评分" },
];

export const DEFAULT_SHORTCUTS = {
  reveal_letter: null,
  reveal_word: null,
  previous_sentence: null,
  next_sentence: null,
  replay_sentence: null,
  toggle_pause_playback: null,
  record_score: null,
};

export const TRANSLATION_MASK_LAYOUT_VERSION = 3;

export const DEFAULT_UI_PREFERENCES = {
  showFullscreenPreviousSentence: false,
  translationMask: {
    enabled: true,
    layoutVersion: TRANSLATION_MASK_LAYOUT_VERSION,
    x: null,
    y: null,
    width: null,
    height: null,
  },
};

export const DEFAULT_PLAYBACK_PREFERENCES = {
  autoReplayAnsweredSentence: true,
  singleSentenceLoopEnabled: false,
  lessonPlaybackRateOverrides: {},
};

function sanitizeLessonPlaybackRateOverrides(rawOverrides = {}) {
  if (!rawOverrides || typeof rawOverrides !== "object" || Array.isArray(rawOverrides)) {
    return {};
  }
  const nextOverrides = {};
  for (const [rawLessonId, rawOverride] of Object.entries(rawOverrides)) {
    const lessonId = String(rawLessonId || "").trim();
    if (!lessonId || !rawOverride || typeof rawOverride !== "object") {
      continue;
    }
    if (rawOverride.pinned !== true) {
      continue;
    }
    nextOverrides[lessonId] = {
      pinned: true,
      rate: normalizePlaybackRate(rawOverride.rate),
    };
  }
  return nextOverrides;
}

function normalizeShortcutKeyValue(value) {
  if (value == null) return "";
  if (value === " ") return "space";
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return "";
  if (normalized === "spacebar") return "space";
  return normalized;
}

function normalizeShortcutCodeValue(value) {
  return String(value || "").trim();
}

function cloneShortcutBinding(binding) {
  return {
    code: binding?.code || "",
    key: binding?.key || "",
    shift: Boolean(binding?.shift),
    ctrl: Boolean(binding?.ctrl),
    alt: Boolean(binding?.alt),
    meta: Boolean(binding?.meta),
  };
}

function isPrintableShortcutKey(key) {
  return Boolean(key) && key.length === 1;
}

function isFunctionShortcutKey(key) {
  return /^f\d{1,2}$/i.test(String(key || ""));
}

function isAllowedBareShortcut(binding) {
  const key = normalizeShortcutKeyValue(binding?.key);
  return BARE_ALLOWED_SHORTCUT_KEYS.has(key) || isFunctionShortcutKey(key);
}

function isShortcutBindingAllowed(bindingValue) {
  const binding = normalizeShortcutBindingValue(bindingValue);
  if (!binding) return false;
  const key = normalizeShortcutKeyValue(binding.key);
  const hasModifier = Boolean(binding.shift || binding.ctrl || binding.alt || binding.meta);
  if (!key || MODIFIER_ONLY_KEYS.has(key) || RESERVED_SHORTCUT_KEYS.has(key)) {
    return false;
  }
  if (!hasModifier && isPrintableShortcutKey(key)) {
    return false;
  }
  if (!hasModifier && !isAllowedBareShortcut(binding)) {
    return false;
  }
  return true;
}

function inferShortcutCodeFromKey(key) {
  const normalizedKey = normalizeShortcutKeyValue(key);
  if (normalizedKey === "space") return "Space";
  if (normalizedKey === "enter") return "Enter";
  if (normalizedKey === "arrowleft") return "ArrowLeft";
  if (normalizedKey === "arrowright") return "ArrowRight";
  if (normalizedKey === "arrowup") return "ArrowUp";
  if (normalizedKey === "arrowdown") return "ArrowDown";
  if (normalizedKey === "home") return "Home";
  if (normalizedKey === "end") return "End";
  if (normalizedKey === "pageup") return "PageUp";
  if (normalizedKey === "pagedown") return "PageDown";
  if (normalizedKey === "alt") return "AltLeft";
  if (isFunctionShortcutKey(normalizedKey)) return normalizedKey.toUpperCase();
  if (/^[a-z]$/.test(normalizedKey)) return `Key${normalizedKey.toUpperCase()}`;
  if (/^\d$/.test(normalizedKey)) return `Digit${normalizedKey}`;
  return SHORT_KEY_LABELS[normalizedKey] || "";
}

export function normalizeShortcutBindingValue(value) {
  if (!value) return null;
  if (typeof value === "string") {
    const legacyBinding = LEGACY_SHORTCUT_BINDINGS[String(value).trim().toLowerCase()];
    return legacyBinding ? cloneShortcutBinding(legacyBinding) : null;
  }
  if (typeof value !== "object") {
    return null;
  }
  const normalizedKey = normalizeShortcutKeyValue(value.key);
  const normalizedCode = normalizeShortcutCodeValue(value.code) || inferShortcutCodeFromKey(normalizedKey);
  if (!normalizedKey && !normalizedCode) {
    return null;
  }
  return {
    code: normalizedCode,
    key: normalizedKey,
    shift: Boolean(value.shift),
    ctrl: Boolean(value.ctrl),
    alt: Boolean(value.alt),
    meta: Boolean(value.meta),
  };
}

export function getShortcutSignature(bindingValue) {
  const binding = normalizeShortcutBindingValue(bindingValue);
  if (!binding) return "";
  const keyPart = binding.code || binding.key;
  return [
    binding.ctrl ? "ctrl" : "",
    binding.alt ? "alt" : "",
    binding.shift ? "shift" : "",
    binding.meta ? "meta" : "",
    keyPart,
  ]
    .filter(Boolean)
    .join("+");
}

export function areShortcutBindingsEqual(left, right) {
  const leftSignature = getShortcutSignature(left);
  const rightSignature = getShortcutSignature(right);
  return Boolean(leftSignature) && leftSignature === rightSignature;
}

function getShortcutKeyLabel(binding) {
  const normalizedCode = normalizeShortcutCodeValue(binding?.code);
  const normalizedKeyEarly = normalizeShortcutKeyValue(binding?.key);
  // 组合键里「主键」就是 Alt/Shift 等物理键时，修饰位已表达含义，避免显示成 Alt+Shift+Alt
  if (
    binding?.alt &&
    (normalizedCode === "AltLeft" ||
      normalizedCode === "AltRight" ||
      normalizedKeyEarly === "alt")
  ) {
    return "";
  }
  if (
    binding?.shift &&
    (normalizedCode === "ShiftLeft" ||
      normalizedCode === "ShiftRight" ||
      normalizedKeyEarly === "shift")
  ) {
    return "";
  }
  if (
    binding?.ctrl &&
    (normalizedCode === "ControlLeft" ||
      normalizedCode === "ControlRight" ||
      normalizedKeyEarly === "control" ||
      normalizedKeyEarly === "ctrl")
  ) {
    return "";
  }
  if (
    binding?.meta &&
    (normalizedCode === "MetaLeft" ||
      normalizedCode === "MetaRight" ||
      normalizedKeyEarly === "meta" ||
      normalizedKeyEarly === "os")
  ) {
    return "";
  }
  if (normalizedCode === "Space") return "Space";
  if (normalizedCode === "Enter") return "Enter";
  if (normalizedCode === "ArrowLeft") return "ArrowLeft";
  if (normalizedCode === "ArrowRight") return "ArrowRight";
  if (normalizedCode === "ArrowUp") return "ArrowUp";
  if (normalizedCode === "ArrowDown") return "ArrowDown";
  if (normalizedCode === "Home") return "Home";
  if (normalizedCode === "End") return "End";
  if (normalizedCode === "PageUp") return "PageUp";
  if (normalizedCode === "PageDown") return "PageDown";
  if (normalizedCode === "AltLeft" || normalizedCode === "AltRight") return "Alt";
  if (/^F\d{1,2}$/i.test(normalizedCode)) return normalizedCode.toUpperCase();
  if (/^Key[A-Z]$/.test(normalizedCode)) return normalizedCode.slice(3);
  if (/^Digit\d$/.test(normalizedCode)) return normalizedCode.slice(5);
  if (normalizedCode) return normalizedCode;

  const normalizedKey = normalizeShortcutKeyValue(binding?.key);
  if (SHORT_KEY_LABELS[normalizedKey]) {
    return SHORT_KEY_LABELS[normalizedKey];
  }
  if (isFunctionShortcutKey(normalizedKey)) {
    return normalizedKey.toUpperCase();
  }
  if (normalizedKey.length === 1) {
    return normalizedKey.toUpperCase();
  }
  return normalizedKey || "未设置";
}

export function getShortcutLabel(bindingValue) {
  const binding = normalizeShortcutBindingValue(bindingValue);
  if (!binding) return "未设置";
  const modifierLabels = [];
  if (binding.ctrl) modifierLabels.push("Ctrl");
  if (binding.alt) modifierLabels.push("Alt");
  if (binding.shift) modifierLabels.push("Shift");
  if (binding.meta) modifierLabels.push("Meta");
  const keyLabel = getShortcutKeyLabel(binding);
  const parts = keyLabel ? [...modifierLabels, keyLabel] : modifierLabels;
  return parts.length ? parts.join("+") : "未设置";
}

export function sanitizeShortcutMap(rawShortcutMap = {}) {
  const nextShortcutMap = {};
  const occupied = new Set();
  for (const action of SHORTCUT_ACTIONS) {
    const hasExplicitValue = Object.prototype.hasOwnProperty.call(rawShortcutMap, action.id);
    const rawValue = rawShortcutMap?.[action.id];
    if (hasExplicitValue && (rawValue == null || rawValue === "")) {
      nextShortcutMap[action.id] = null;
      continue;
    }

    const requestedRaw = normalizeShortcutBindingValue(rawValue);
    if (hasExplicitValue) {
      if (!isShortcutBindingAllowed(requestedRaw)) {
        nextShortcutMap[action.id] = null;
        continue;
      }
      const requestedSignature = getShortcutSignature(requestedRaw);
      if (!requestedSignature || occupied.has(requestedSignature)) {
        nextShortcutMap[action.id] = null;
        continue;
      }
      nextShortcutMap[action.id] = cloneShortcutBinding(requestedRaw);
      occupied.add(requestedSignature);
      continue;
    }

    nextShortcutMap[action.id] = null;
  }
  return nextShortcutMap;
}

export function getShortcutCompleteness(learningSettings) {
  const shortcuts = learningSettings?.shortcuts;
  const result = { complete: true, missingActions: [] };
  for (const action of SHORTCUT_ACTIONS) {
    const binding = shortcuts?.[action.id];
    if (!binding || !getShortcutSignature(binding)) {
      result.complete = false;
      result.missingActions.push(action);
    }
  }
  return result;
}

export function sanitizeLearningSettings(rawSettings = {}) {
  return {
    shortcuts: sanitizeShortcutMap(rawSettings?.shortcuts),
    uiPreferences: sanitizeUiPreferences(rawSettings?.uiPreferences),
    playbackPreferences: sanitizePlaybackPreferences(rawSettings?.playbackPreferences),
  };
}

export function readLearningSettings() {
  if (typeof window === "undefined") {
    return sanitizeLearningSettings();
  }
  try {
    const rawValue =
      window.localStorage.getItem(LEARNING_SETTINGS_STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_LEARNING_SETTINGS_STORAGE_KEY) ?? "{}";
    const parsed = JSON.parse(rawValue);
    return sanitizeLearningSettings(parsed);
  } catch (_) {
    return sanitizeLearningSettings();
  }
}

export function writeLearningSettings(settings) {
  if (typeof window === "undefined") return;
  const sanitized = sanitizeLearningSettings(settings);
  window.localStorage.setItem(LEARNING_SETTINGS_STORAGE_KEY, JSON.stringify(sanitized));
  window.localStorage.removeItem(LEGACY_LEARNING_SETTINGS_STORAGE_KEY);
  window.dispatchEvent(new CustomEvent(LEARNING_SETTINGS_UPDATED_EVENT, { detail: sanitized }));
}

export function resolveReplayAssistance() {
  return { revealLetterCount: 0, revealWordCount: 0 };
}

export function isShortcutPressed(event, shortcutValue) {
  const binding = normalizeShortcutBindingValue(shortcutValue);
  if (!binding) return false;
  const eventCode = normalizeShortcutCodeValue(event.code);
  const eventKey = normalizeShortcutKeyValue(event.key);
  const matchesKey = binding.code ? binding.code === eventCode : binding.key === eventKey;
  if (!matchesKey) return false;
  return (
    binding.shift === Boolean(event.shiftKey) &&
    binding.ctrl === Boolean(event.ctrlKey) &&
    binding.alt === Boolean(event.altKey) &&
    binding.meta === Boolean(event.metaKey)
  );
}

export function captureShortcutFromKeyboardEvent(event) {
  const key = normalizeShortcutKeyValue(event.key);
  const code = normalizeShortcutCodeValue(event.code) || inferShortcutCodeFromKey(key);
  const hasModifier = Boolean(event.shiftKey || event.ctrlKey || event.altKey || event.metaKey);

  if (MODIFIER_ONLY_KEYS.has(key)) {
    return { value: null, error: "请按一个完整快捷键，单独的修饰键不能保存。" };
  }
  if (RESERVED_SHORTCUT_KEYS.has(key)) {
    if (key === "escape") {
      return { value: null, error: "Esc 固定用于退出沉浸学习，不能分配给其他动作。" };
    }
    if (key === "tab") {
      return { value: null, error: "Tab 需要保留给焦点切换，不能设置为学习快捷键。" };
    }
    return { value: null, error: `${getShortcutKeyLabel({ code, key })} 会影响输入或焦点，不建议设置为学习快捷键。` };
  }

  if (!hasModifier && isPrintableShortcutKey(key)) {
    return {
      value: null,
      error: `「${key.toUpperCase()}」是单字母键，答题时会用到，容易误判。请改用 Shift+${key.toUpperCase()}、Ctrl+${key.toUpperCase()}、Alt+${key.toUpperCase()} 组合，或使用 F1-F12、功能键、方向键。`,
    };
  }
  if (!hasModifier && !isAllowedBareShortcut({ code, key })) {
    return {
      value: null,
      error: "该单键不在允许范围内。请改用 Space、Enter、方向键、Home/End、PageUp/PageDown、F1-F12 或媒体键。",
    };
  }

  return {
    value: {
      code,
      key,
      shift: Boolean(event.shiftKey),
      ctrl: Boolean(event.ctrlKey),
      alt: Boolean(event.altKey),
      meta: Boolean(event.metaKey),
    },
    error: "",
  };
}

export function sanitizeUiPreferences(rawPreferences = {}) {
  const rawTranslationMask = rawPreferences?.translationMask;
  const storedMaskLayoutVersion = Number(rawTranslationMask?.layoutVersion || 0);
  const shouldReuseStoredMaskRect = storedMaskLayoutVersion === TRANSLATION_MASK_LAYOUT_VERSION;
  const normalizeMaskValue = (value) => {
    if (value == null || value === "") return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    return Number(Math.min(1, Math.max(0, parsed)).toFixed(4));
  };
  return {
    showFullscreenPreviousSentence:
      typeof rawPreferences?.showFullscreenPreviousSentence === "boolean"
        ? rawPreferences.showFullscreenPreviousSentence
        : DEFAULT_UI_PREFERENCES.showFullscreenPreviousSentence,
    translationMask: {
      enabled:
        typeof rawTranslationMask?.enabled === "boolean"
          ? rawTranslationMask.enabled
          : DEFAULT_UI_PREFERENCES.translationMask.enabled,
      layoutVersion: TRANSLATION_MASK_LAYOUT_VERSION,
      x: shouldReuseStoredMaskRect ? normalizeMaskValue(rawTranslationMask?.x) : null,
      y: shouldReuseStoredMaskRect ? normalizeMaskValue(rawTranslationMask?.y) : null,
      width: shouldReuseStoredMaskRect ? normalizeMaskValue(rawTranslationMask?.width) : null,
      height: shouldReuseStoredMaskRect ? normalizeMaskValue(rawTranslationMask?.height) : null,
    },
  };
}

export function sanitizePlaybackPreferences(rawPreferences = {}) {
  return {
    autoReplayAnsweredSentence:
      typeof rawPreferences?.autoReplayAnsweredSentence === "boolean"
        ? rawPreferences.autoReplayAnsweredSentence
        : DEFAULT_PLAYBACK_PREFERENCES.autoReplayAnsweredSentence,
    singleSentenceLoopEnabled:
      typeof rawPreferences?.singleSentenceLoopEnabled === "boolean"
        ? rawPreferences.singleSentenceLoopEnabled
        : DEFAULT_PLAYBACK_PREFERENCES.singleSentenceLoopEnabled,
    lessonPlaybackRateOverrides: sanitizeLessonPlaybackRateOverrides(rawPreferences?.lessonPlaybackRateOverrides),
  };
}

export function getLessonPlaybackRateOverride(learningSettings, lessonId) {
  const safeLessonId = String(lessonId ?? "").trim();
  if (!safeLessonId) {
    return {
      pinned: false,
      rate: DEFAULT_IMMERSIVE_PLAYBACK_RATE,
    };
  }
  const lessonOverrides = sanitizePlaybackPreferences(learningSettings?.playbackPreferences).lessonPlaybackRateOverrides;
  const storedOverride = lessonOverrides[safeLessonId];
  if (storedOverride?.pinned === true) {
    return {
      pinned: true,
      rate: normalizePlaybackRate(storedOverride.rate),
    };
  }
  return {
    pinned: false,
    rate: DEFAULT_IMMERSIVE_PLAYBACK_RATE,
  };
}
