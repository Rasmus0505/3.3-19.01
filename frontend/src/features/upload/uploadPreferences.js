const STORAGE_KEY = "upload_panel_preferences_v1";

const DEFAULT_PREFERENCES = {
  selectedUploadModel: "",
  generationOptions: {
    core_subtitles: true,
    zh_translation: true,
    vocabulary_annotation: true,
    word_explanation: false,
    forced_alignment: false,
  },
};

function sanitizeGenerationOptions(value = {}) {
  const next = {
    ...DEFAULT_PREFERENCES.generationOptions,
    ...(value && typeof value === "object" ? value : {}),
  };
  next.core_subtitles = true;
  next.zh_translation = Boolean(next.zh_translation);
  next.vocabulary_annotation = Boolean(next.vocabulary_annotation);
  next.word_explanation = Boolean(next.word_explanation);
  next.forced_alignment = Boolean(next.forced_alignment);
  if (next.word_explanation) {
    next.vocabulary_annotation = true;
  }
  return next;
}

export function readUploadPreferences() {
  if (typeof window === "undefined" || !window.localStorage) {
    return { ...DEFAULT_PREFERENCES, generationOptions: { ...DEFAULT_PREFERENCES.generationOptions } };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      selectedUploadModel: String(parsed?.selectedUploadModel || ""),
      generationOptions: sanitizeGenerationOptions(parsed?.generationOptions),
    };
  } catch (_) {
    return { ...DEFAULT_PREFERENCES, generationOptions: { ...DEFAULT_PREFERENCES.generationOptions } };
  }
}

export function writeUploadPreferences(preferences = {}) {
  if (typeof window === "undefined" || !window.localStorage) return;
  const payload = {
    selectedUploadModel: String(preferences?.selectedUploadModel || ""),
    generationOptions: sanitizeGenerationOptions(preferences?.generationOptions),
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export { sanitizeGenerationOptions };
