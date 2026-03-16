const STORAGE_PREFIX = "english_asr_getting_started";

const DEFAULT_PROGRESS = Object.freeze({
  homeVisited: false,
  welcomeShown: false,
  completed: false,
});

function normalizeUserId(userId) {
  const value = Number(userId || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function getStorageKey(userId) {
  const normalizedUserId = normalizeUserId(userId);
  return normalizedUserId > 0 ? `${STORAGE_PREFIX}:${normalizedUserId}` : "";
}

function writeProgress(userId, patch) {
  const storageKey = getStorageKey(userId);
  if (!storageKey || typeof window === "undefined") {
    return { ...DEFAULT_PROGRESS };
  }

  const nextValue = {
    ...readGettingStartedProgress(userId),
    ...(patch || {}),
  };

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(nextValue));
  } catch (_) {
    // Ignore local storage write failures.
  }

  return nextValue;
}

export function readGettingStartedProgress(userId) {
  const storageKey = getStorageKey(userId);
  if (!storageKey || typeof window === "undefined") {
    return { ...DEFAULT_PROGRESS };
  }

  try {
    const rawValue = window.localStorage.getItem(storageKey);
    if (!rawValue) return { ...DEFAULT_PROGRESS };
    const parsed = JSON.parse(rawValue);
    return {
      homeVisited: Boolean(parsed?.homeVisited),
      welcomeShown: Boolean(parsed?.welcomeShown),
      completed: Boolean(parsed?.completed),
    };
  } catch (_) {
    return { ...DEFAULT_PROGRESS };
  }
}

export function markGettingStartedHomeVisited(userId) {
  return writeProgress(userId, {
    homeVisited: true,
    welcomeShown: true,
  });
}

export function markGettingStartedCompleted(userId) {
  return writeProgress(userId, {
    completed: true,
    homeVisited: true,
    welcomeShown: true,
  });
}
