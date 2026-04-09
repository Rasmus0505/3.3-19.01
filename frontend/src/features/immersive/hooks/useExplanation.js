// 沉浸式学习讲解 Hook
// 管理句子讲解的显示和音频播放

import { useCallback, useEffect, useRef, useState } from "react";

export function useExplanation({ currentSentence }) {
  const [showExplanation, setShowExplanation] = useState(false);
  const [currentExplanation, setCurrentExplanation] = useState(null);
  const [explanationAudioUrl, setExplanationAudioUrl] = useState(null);

  const explanationAudioRef = useRef(null);

  // Check if current sentence needs explanation
  useEffect(() => {
    if (currentSentence) {
      if (currentSentence.needs_explanation) {
        setShowExplanation(true);

        // Build explanation object from separate fields
        const explanation = {
          simplified_sentence: currentSentence.simplified_sentence || null,
          key_explanations: currentSentence.key_explanations_json || [],
          listen_tips: currentSentence.explanation_text || "",
        };
        setCurrentExplanation(explanation);
        setExplanationAudioUrl(currentSentence.explanation_audio_url);
      } else {
        setShowExplanation(false);
        setCurrentExplanation(null);
        setExplanationAudioUrl(null);
      }
    }
  }, [currentSentence]);

  // Play explanation audio
  const playExplanationAudio = useCallback(
    (url) => {
      if (url && explanationAudioRef?.current) {
        explanationAudioRef.current.src = url;
        explanationAudioRef.current.play().catch(console.error);
      }
    },
    []
  );

  // Record that user has viewed explanation
  const markExplanationViewed = useCallback(() => {
    if (currentSentence) {
      localStorage.setItem(`explanation_viewed_${currentSentence.id}`, "true");
    }
  }, [currentSentence]);

  return {
    // State
    showExplanation,
    setShowExplanation,
    currentExplanation,
    setCurrentExplanation,
    explanationAudioUrl,
    setExplanationAudioUrl,
    // Refs
    explanationAudioRef,
    // Actions
    playExplanationAudio,
    markExplanationViewed,
  };
}
