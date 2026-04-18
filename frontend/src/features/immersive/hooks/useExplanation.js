import { useCallback, useEffect, useRef, useState } from "react";

export function useExplanation({ currentSentence }) {
  const [showExplanation, setShowExplanation] = useState(false);
  const [currentExplanation, setCurrentExplanation] = useState(null);
  const [explanationAudioUrl, setExplanationAudioUrl] = useState(null);
  const explanationAudioRef = useRef(null);
  const [isExplanationPlaying, setIsExplanationPlaying] = useState(false);
  const [isExplanationPaused, setIsExplanationPaused] = useState(false);

  const resetExplanationPlaybackState = useCallback(() => {
    setIsExplanationPlaying(false);
    setIsExplanationPaused(false);
  }, []);

  const stopExplanationAudio = useCallback(
    ({ resetPosition = true, clearSource = false } = {}) => {
      const audio = explanationAudioRef.current;
      if (audio) {
        audio.pause();
        if (resetPosition) {
          try {
            audio.currentTime = 0;
          } catch (_) {
            // ignore currentTime reset failures from stale media state
          }
        }
        if (clearSource) {
          audio.removeAttribute("src");
          audio.load();
        }
      }
      resetExplanationPlaybackState();
    },
    [resetExplanationPlaybackState],
  );

  const ensureExplanationAudio = useCallback((url) => {
    const audio = explanationAudioRef.current;
    if (!audio || !url) return null;
    if (audio.getAttribute("src") !== url) {
      audio.src = url;
    }
    return audio;
  }, []);

  useEffect(() => {
    stopExplanationAudio({ resetPosition: true, clearSource: true });
    if (currentSentence?.needs_explanation) {
      setShowExplanation(true);
      setCurrentExplanation({
        simplified_sentence: currentSentence.simplified_sentence || null,
        key_explanations: Array.isArray(currentSentence.key_explanations_json)
          ? currentSentence.key_explanations_json
          : [],
        listen_tips: currentSentence.explanation_text || "",
      });
      setExplanationAudioUrl(currentSentence.explanation_audio_url || null);
      return;
    }
    setShowExplanation(false);
    setCurrentExplanation(null);
    setExplanationAudioUrl(null);
  }, [currentSentence, stopExplanationAudio]);

  const playExplanationAudio = useCallback(
    async (url = explanationAudioUrl) => {
      const audio = ensureExplanationAudio(url);
      if (!audio) {
        resetExplanationPlaybackState();
        return { ok: false, reason: "audio_unavailable" };
      }
      try {
        audio.currentTime = 0;
        await audio.play();
        return { ok: true, state: "playing" };
      } catch (error) {
        resetExplanationPlaybackState();
        return { ok: false, reason: "autoplay_blocked", detail: String(error) };
      }
    },
    [ensureExplanationAudio, explanationAudioUrl, resetExplanationPlaybackState],
  );

  const pauseExplanationAudio = useCallback(() => {
    const audio = explanationAudioRef.current;
    if (!audio || audio.paused) return { ok: false, reason: "audio_not_playing" };
    audio.pause();
    setIsExplanationPlaying(false);
    setIsExplanationPaused(audio.currentTime > 0 && !audio.ended);
    return { ok: true, state: "paused" };
  }, []);

  const resumeExplanationAudio = useCallback(async () => {
    const audio = explanationAudioRef.current;
    if (!audio) {
      resetExplanationPlaybackState();
      return { ok: false, reason: "audio_unavailable" };
    }
    try {
      await audio.play();
      return { ok: true, state: "playing" };
    } catch (error) {
      return { ok: false, reason: "autoplay_blocked", detail: String(error) };
    }
  }, []);

  useEffect(() => {
    const audio = explanationAudioRef.current;
    if (!audio) return undefined;

    const handlePlay = () => {
      setIsExplanationPlaying(true);
      setIsExplanationPaused(false);
    };
    const handlePause = () => {
      if (audio.ended || audio.currentTime <= 0) {
        resetExplanationPlaybackState();
        return;
      }
      setIsExplanationPlaying(false);
      setIsExplanationPaused(true);
    };
    const handleEnded = () => {
      resetExplanationPlaybackState();
      try {
        audio.currentTime = 0;
      } catch (_) {
        // ignore ended rewind failures
      }
    };

    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);
    return () => {
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [explanationAudioUrl, resetExplanationPlaybackState, showExplanation]);

  useEffect(
    () => () => {
      stopExplanationAudio({ resetPosition: false });
    },
    [stopExplanationAudio],
  );

  const markExplanationViewed = useCallback(() => {
    if (currentSentence) {
      localStorage.setItem(`explanation_viewed_${currentSentence.id}`, "true");
    }
  }, [currentSentence]);

  return {
    showExplanation,
    setShowExplanation,
    currentExplanation,
    setCurrentExplanation,
    explanationAudioUrl,
    setExplanationAudioUrl,
    isExplanationPlaying,
    isExplanationPaused,
    explanationAudioRef,
    playExplanationAudio,
    pauseExplanationAudio,
    resumeExplanationAudio,
    stopExplanationAudio,
    markExplanationViewed,
  };
}


