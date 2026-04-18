import { useCallback, useEffect, useState } from "react";

import {
  LEARNING_SETTINGS_UPDATED_EVENT,
  readLearningSettings,
  writeLearningSettings,
} from "../learningSettings";
import {
  DEFAULT_IMMERSIVE_PLAYBACK_RATE,
  normalizePlaybackRate,
} from "../immersiveSessionMachine";
import {
  IMMERSIVE_PLAYBACK_RATE_STEP,
  buildTranslationMaskUiPreference,
  formatPlaybackRateInputValue,
  normalizeTranslationMaskRect,
} from "../immersivePageHelpers";

export function useImmersivePreferences({
  currentLessonId,
  singleSentenceLoopEnabled,
  playbackRatePinned,
  selectedPlaybackRate,
  setLoopEnabled,
  setSelectedPlaybackRate,
  setPlaybackRatePinned,
  mediaElementRef,
  clipAudioRef,
}) {
  const [learningSettings, setLearningSettings] = useState(() => readLearningSettings());
  const [showFullscreenPreviousSentence, setShowFullscreenPreviousSentence] = useState(
    () => readLearningSettings().uiPreferences?.showFullscreenPreviousSentence ?? false,
  );
  const [translationMaskEnabled, setTranslationMaskEnabled] = useState(
    () => readLearningSettings().uiPreferences?.translationMask?.enabled !== false,
  );
  const [translationMaskRect, setTranslationMaskRect] = useState(() =>
    normalizeTranslationMaskRect(readLearningSettings().uiPreferences?.translationMask),
  );
  const [playbackRateInputValue, setPlaybackRateInputValue] = useState(() =>
    formatPlaybackRateInputValue(DEFAULT_IMMERSIVE_PLAYBACK_RATE),
  );

  const syncLearningSettingsState = useCallback(
    (nextSettings) => {
      const resolvedSettings =
        nextSettings && typeof nextSettings === "object" ? nextSettings : readLearningSettings();
      setLearningSettings(resolvedSettings);
      setShowFullscreenPreviousSentence(
        resolvedSettings.uiPreferences?.showFullscreenPreviousSentence ?? false,
      );
      setTranslationMaskEnabled(resolvedSettings.uiPreferences?.translationMask?.enabled !== false);
      setTranslationMaskRect(
        normalizeTranslationMaskRect(resolvedSettings.uiPreferences?.translationMask),
      );
      setLoopEnabled(resolvedSettings.playbackPreferences?.singleSentenceLoopEnabled === true);
    },
    [setLoopEnabled],
  );

  const persistUiPreferences = useCallback(
    (updater) => {
      const currentSettings = readLearningSettings();
      const currentUiPreferences = currentSettings.uiPreferences || {};
      const nextUiPreferences =
        typeof updater === "function" ? updater(currentUiPreferences) : updater;
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

  const persistFullscreenPreviousSentencePreference = useCallback(
    (nextVisible) => {
      const safeVisible = Boolean(nextVisible);
      setShowFullscreenPreviousSentence(safeVisible);
      persistUiPreferences((currentUiPreferences) => ({
        ...currentUiPreferences,
        showFullscreenPreviousSentence: safeVisible,
      }));
    },
    [persistUiPreferences],
  );

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
    [
      clipAudioRef,
      mediaElementRef,
      persistLessonPlaybackRate,
      playbackRatePinned,
      setSelectedPlaybackRate,
    ],
  );

  const commitPlaybackRateInput = useCallback(
    (rawValue = playbackRateInputValue) => {
      const normalizedValue = String(rawValue ?? "").trim();
      if (!normalizedValue) {
        const resetRate = applyPlaybackRate(DEFAULT_IMMERSIVE_PLAYBACK_RATE);
        setPlaybackRateInputValue(formatPlaybackRateInputValue(resetRate));
        return;
      }
      const committedRate = applyPlaybackRate(normalizedValue);
      setPlaybackRateInputValue(formatPlaybackRateInputValue(committedRate));
    },
    [applyPlaybackRate, playbackRateInputValue],
  );

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
      const baseRate = Number.isFinite(parsedDraftValue)
        ? parsedDraftValue
        : selectedPlaybackRate;
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
  }, [
    persistLessonPlaybackRate,
    playbackRatePinned,
    selectedPlaybackRate,
    setPlaybackRatePinned,
  ]);

  useEffect(() => {
    setPlaybackRateInputValue(formatPlaybackRateInputValue(selectedPlaybackRate));
  }, [selectedPlaybackRate]);

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

  return {
    learningSettings,
    showFullscreenPreviousSentence,
    translationMaskEnabled,
    translationMaskRect,
    playbackRateInputValue,
    setTranslationMaskRect,
    syncLearningSettingsState,
    persistUiPreferences,
    persistPlaybackPreferences,
    persistFullscreenPreviousSentencePreference,
    persistTranslationMaskPreference,
    handleToggleSingleSentenceLoop,
    persistLessonPlaybackRate,
    applyPlaybackRate,
    commitPlaybackRateInput,
    handlePlaybackRateInputChange,
    handlePlaybackRateInputKeyDown,
    handlePlaybackRateInputBlur,
    adjustPlaybackRateByStep,
    handleResetPlaybackRate,
    handleTogglePlaybackRatePinned,
  };
}


