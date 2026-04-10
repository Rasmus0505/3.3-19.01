import { useCallback, useEffect } from "react";

import {
  getShortcutLabel,
  isShortcutPressed,
} from "../learningSettings";
import {
  countTokenInputErrors,
  isEditableShortcutTarget,
  normalizeComparableToken,
} from "../immersivePageHelpers";

export function useImmersiveKeyboard({
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
}) {
  const handleShortcutCommand = useCallback(
    (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        void exitImmersive("shortcut_esc");
        return true;
      }
      if (isShortcutPressed(event, learningSettings.shortcuts.replay_sentence)) {
        event.preventDefault();
        event.stopPropagation();
        requestReplayCurrentSentence(
          `shortcut_${getShortcutLabel(learningSettings.shortcuts.replay_sentence)}`,
        );
        return true;
      }
      if (isShortcutPressed(event, learningSettings.shortcuts.toggle_pause_playback)) {
        event.preventDefault();
        event.stopPropagation();
        requestTogglePausePlayback(
          `shortcut_${getShortcutLabel(learningSettings.shortcuts.toggle_pause_playback)}`,
        );
        return true;
      }
      if (isShortcutPressed(event, learningSettings.shortcuts.record_score)) {
        event.preventDefault();
        event.stopPropagation();
        audioRecorderRef.current?.trigger();
        return true;
      }
      if (isShortcutPressed(event, learningSettings.shortcuts.previous_sentence)) {
        event.preventDefault();
        event.stopPropagation();
        requestNavigateSentence({
          delta: -1,
          source: `shortcut_${getShortcutLabel(learningSettings.shortcuts.previous_sentence)}`,
        });
        return true;
      }
      if (isShortcutPressed(event, learningSettings.shortcuts.next_sentence)) {
        event.preventDefault();
        event.stopPropagation();
        requestNavigateSentence({
          delta: 1,
          source: `shortcut_${getShortcutLabel(learningSettings.shortcuts.next_sentence)}`,
        });
        return true;
      }
      if (isShortcutPressed(event, learningSettings.shortcuts.reveal_letter)) {
        event.preventDefault();
        event.stopPropagation();
        requestRevealLetter(
          `shortcut_${getShortcutLabel(learningSettings.shortcuts.reveal_letter)}`,
        );
        return true;
      }
      if (isShortcutPressed(event, learningSettings.shortcuts.reveal_word)) {
        event.preventDefault();
        event.stopPropagation();
        requestRevealWord(
          `shortcut_${getShortcutLabel(learningSettings.shortcuts.reveal_word)}`,
        );
        return true;
      }
      return false;
    },
    [
      audioRecorderRef,
      exitImmersive,
      learningSettings.shortcuts,
      requestNavigateSentence,
      requestReplayCurrentSentence,
      requestRevealLetter,
      requestRevealWord,
      requestTogglePausePlayback,
    ],
  );

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const onWindowKeyDown = (event) => {
      const fromTypingInput = event.target === typingInputRef.current;
      if (isEditableShortcutTarget(event.target) && !fromTypingInput) return;
      if (!immersiveActive) return;
      handleShortcutCommand(event);
    };

    window.addEventListener("keydown", onWindowKeyDown);
    return () => {
      window.removeEventListener("keydown", onWindowKeyDown);
    };
  }, [handleShortcutCommand, immersiveActive, typingInputRef]);

  const handleKeyDown = useCallback(
    (event) => {
      if (!currentSentence) return;
      setMediaError("");

      const key = event.key;
      if (
        showEntryHintOverlay &&
        (key === "Backspace" ||
          (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey))
      ) {
        setShowEntryHintOverlay(false);
      }
      if (handleShortcutCommand(event)) {
        return;
      }

      if (!typingEnabled) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      // 句子已填完，不再处理输入
      if (activeWordIndexRef.current >= expectedTokens.length) return;

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

      if (key.length !== 1) return;

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
      if (normalizedInput.length < normalizedExpected.length) return;

      if (normalizedInput === normalizedExpected) {
        commitCorrectWord(nextInput);
      } else {
        commitWrongWord();
      }
    },
    [
      activeWordIndexRef,
      commitCorrectWord,
      commitWrongWord,
      currentSentence,
      currentWordInputRef,
      expectedTokens,
      handleShortcutCommand,
      playKeySound,
      setCurrentWordInput,
      setMediaError,
      setShowEntryHintOverlay,
      setWordInputs,
      setWordStatuses,
      showEntryHintOverlay,
      typingEnabled,
      wordInputsRef,
      wordStatusesRef,
    ],
  );

  return {
    handleKeyDown,
  };
}
