const LEARNING_SETTINGS_STORAGE_KEY = "immersive_learning_settings_v1";

export const SHORTCUT_OPTIONS = [
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

export const SHORTCUT_ACTIONS = [
  { id: "reveal_letter", label: "揭示字母" },
  { id: "reveal_word", label: "揭示单词" },
  { id: "previous_sentence", label: "上一句" },
  { id: "next_sentence", label: "下一句" },
  { id: "replay_sentence", label: "重播" },
];

export const DEFAULT_SHORTCUTS = {
  reveal_letter: "space",
  reveal_word: "shift+space",
  previous_sentence: "arrowleft",
  next_sentence: "enter",
  replay_sentence: "shift+r",
};

export const REPLAY_PRESET_OPTIONS = [
  { id: "hard", label: "高难" },
  { id: "standard", label: "标准" },
  { id: "assist", label: "辅助" },
  { id: "custom", label: "自定义" },
];

export const DEFAULT_CUSTOM_REPLAY_CONFIG = {
  tailSpeedStep: 0.1,
  minimumTailSpeed: 0.75,
  revealLetterAt: 2,
  revealWordAt: 3,
  extraRevealWordsPerReplay: 1,
};

function clampNumber(value, min, max, fallback, { integer = false } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const clamped = Math.min(max, Math.max(min, parsed));
  return integer ? Math.round(clamped) : Number(clamped.toFixed(2));
}

export function normalizeShortcutValue(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return SHORTCUT_OPTIONS.some((item) => item.value === normalized) ? normalized : "";
}

export function getShortcutLabel(shortcutValue) {
  return SHORTCUT_OPTIONS.find((item) => item.value === shortcutValue)?.label || shortcutValue;
}

function getFirstAvailableShortcut(excluded = new Set(), preferred = "") {
  const normalizedPreferred = normalizeShortcutValue(preferred);
  if (normalizedPreferred && !excluded.has(normalizedPreferred)) {
    return normalizedPreferred;
  }
  return SHORTCUT_OPTIONS.find((item) => !excluded.has(item.value))?.value || SHORTCUT_OPTIONS[0].value;
}

export function sanitizeShortcutMap(rawShortcutMap = {}) {
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

export function sanitizeCustomReplayConfig(rawConfig = {}) {
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

export function sanitizeLearningSettings(rawSettings = {}) {
  const legacyPresetId = rawSettings?.presetId === "recall" ? "hard" : rawSettings?.presetId;
  const presetId = REPLAY_PRESET_OPTIONS.some((item) => item.id === legacyPresetId) ? legacyPresetId : "standard";
  return {
    presetId,
    shortcuts: sanitizeShortcutMap(rawSettings?.shortcuts),
    customConfig: sanitizeCustomReplayConfig(rawSettings?.customConfig),
  };
}

export function readLearningSettings() {
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

export function writeLearningSettings(settings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LEARNING_SETTINGS_STORAGE_KEY, JSON.stringify(sanitizeLearningSettings(settings)));
}

export function getPresetSummaryLines(learningSettings) {
  const presetId = learningSettings?.presetId || "standard";
  if (presetId === "standard") {
    return [
      "第1次：未答尾段 0.95x",
      "第2次：未答尾段 0.85x，揭示当前词 1 个字母",
      "第3次：未答尾段 0.75x，揭示当前词 1 个完整单词",
      "第4次起：保持 0.75x，每次额外多揭示 1 个单词",
    ];
  }
  if (presetId === "hard") {
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

export function resolveReplayAssistance(learningSettings, stage) {
  const safeStage = Math.max(1, Number(stage || 1));
  const presetId = learningSettings?.presetId || "standard";
  if (presetId === "standard") {
    return {
      tailRate: safeStage === 1 ? 0.95 : safeStage === 2 ? 0.85 : 0.75,
      revealLetterCount: safeStage === 2 ? 1 : 0,
      revealWordCount: safeStage >= 3 ? 1 + Math.max(0, safeStage - 3) : 0,
    };
  }
  if (presetId === "hard") {
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

export function isShortcutPressed(event, shortcutValue) {
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

export function getShortcutFromKeyboardEvent(event) {
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return { value: "", error: "暂不支持 Ctrl / Alt / Command 组合键，请改用单键或 Shift 组合。" };
  }
  const key = String(event.key || "");
  const lowered = key.toLowerCase();
  let candidate = "";
  if (key === " ") {
    candidate = event.shiftKey ? "shift+space" : "space";
  } else if (lowered === "enter") {
    candidate = event.shiftKey ? "shift+enter" : "enter";
  } else if (lowered === "arrowleft") {
    candidate = event.shiftKey ? "shift+arrowleft" : "arrowleft";
  } else if (lowered === "arrowright") {
    candidate = event.shiftKey ? "shift+arrowright" : "arrowright";
  } else if (["r", "n", "p"].includes(lowered) && event.shiftKey) {
    candidate = `shift+${lowered}`;
  }

  if (!candidate) {
    return {
      value: "",
      error: "仅支持 Space、Enter、方向键，以及 Shift+R / Shift+N / Shift+P 这类安全快捷键。",
    };
  }
  return { value: candidate, error: "" };
}
