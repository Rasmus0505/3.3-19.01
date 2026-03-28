import { useCallback } from "react";

function normalizeSource(source, fallback) {
  return String(source || fallback || "").trim() || fallback;
}

export function useImmersiveSessionController({
  canInteract = true,
  currentSentenceIndex = 0,
  sentenceCount = 0,
  onReplayCurrentSentence,
  onTogglePausePlayback,
  onNavigateSentence,
  onRevealLetter,
  onRevealWord,
  onHandleSentencePassed,
  onInterruptCurrentSentencePlayback,
  onPlayPreviousSentence,
}) {
  const requestReplayCurrentSentence = useCallback(
    (source = "manual_replay") => {
      if (!canInteract) return false;
      onReplayCurrentSentence?.(normalizeSource(source, "manual_replay"));
      return true;
    },
    [canInteract, onReplayCurrentSentence],
  );

  const requestTogglePausePlayback = useCallback(
    (source = "button_toggle_pause") => {
      if (!canInteract) return false;
      onTogglePausePlayback?.(normalizeSource(source, "button_toggle_pause"));
      return true;
    },
    [canInteract, onTogglePausePlayback],
  );

  const requestNavigateSentence = useCallback(
    ({ targetIndex, delta = 0, source = "manual_navigation" } = {}) => {
      if (!canInteract || sentenceCount <= 0) return false;
      const preferredIndex = Number.isFinite(Number(targetIndex))
        ? Number(targetIndex)
        : currentSentenceIndex + Number(delta || 0);
      const safeTargetIndex = Math.max(0, Math.min(sentenceCount - 1, Math.trunc(preferredIndex)));
      if (safeTargetIndex === currentSentenceIndex) return false;
      onNavigateSentence?.({
        targetIndex: safeTargetIndex,
        source: normalizeSource(source, safeTargetIndex > currentSentenceIndex ? "button_next" : "button_prev"),
      });
      return true;
    },
    [canInteract, currentSentenceIndex, onNavigateSentence, sentenceCount],
  );

  const requestRevealLetter = useCallback(
    (source = "button_reveal_letter") => {
      if (!canInteract) return false;
      onRevealLetter?.(normalizeSource(source, "button_reveal_letter"));
      return true;
    },
    [canInteract, onRevealLetter],
  );

  const requestRevealWord = useCallback(
    (source = "button_reveal_word") => {
      if (!canInteract) return false;
      onRevealWord?.(normalizeSource(source, "button_reveal_word"));
      return true;
    },
    [canInteract, onRevealWord],
  );

  const requestHandleSentencePassed = useCallback(() => {
    if (!canInteract) return false;
    onHandleSentencePassed?.();
    return true;
  }, [canInteract, onHandleSentencePassed]);

  const interruptCurrentSentencePlayback = useCallback(
    (source = "interrupt") => {
      if (!canInteract) return false;
      onInterruptCurrentSentencePlayback?.(normalizeSource(source, "interrupt"));
      return true;
    },
    [canInteract, onInterruptCurrentSentencePlayback],
  );

  const requestPlayPreviousSentence = useCallback(
    (source = "previous_sentence_speaker") => {
      if (!canInteract) return false;
      onPlayPreviousSentence?.(normalizeSource(source, "previous_sentence_speaker"));
      return true;
    },
    [canInteract, onPlayPreviousSentence],
  );

  return {
    requestReplayCurrentSentence,
    requestTogglePausePlayback,
    requestNavigateSentence,
    requestRevealLetter,
    requestRevealWord,
    requestHandleSentencePassed,
    interruptCurrentSentencePlayback,
    requestPlayPreviousSentence,
  };
}
