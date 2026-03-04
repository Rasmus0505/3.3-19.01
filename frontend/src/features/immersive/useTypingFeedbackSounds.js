import { useCallback, useEffect, useRef } from "react";

function tryPlay(audio) {
  if (!audio) return;
  audio.currentTime = 0;
  audio.play().catch(() => {
    // Ignore playback errors (for autoplay and unsupported codecs).
  });
}

export function useTypingFeedbackSounds() {
  const keyRef = useRef(null);
  const wrongRef = useRef(null);
  const correctRef = useRef(null);

  useEffect(() => {
    const base = import.meta.env.BASE_URL;
    const key = new Audio(`${base}sounds/click.wav`);
    const wrong = new Audio(`${base}sounds/beep.wav`);
    const correct = new Audio(`${base}sounds/correct.wav`);

    key.preload = "auto";
    wrong.preload = "auto";
    correct.preload = "auto";

    keyRef.current = key;
    wrongRef.current = wrong;
    correctRef.current = correct;

    return () => {
      [key, wrong, correct].forEach((item) => {
        item.pause();
        item.src = "";
      });
      keyRef.current = null;
      wrongRef.current = null;
      correctRef.current = null;
    };
  }, []);

  const playKeySound = useCallback(() => {
    tryPlay(keyRef.current);
  }, []);

  const playWrongSound = useCallback(() => {
    tryPlay(wrongRef.current);
  }, []);

  const playCorrectSound = useCallback(() => {
    tryPlay(correctRef.current);
  }, []);

  return {
    playKeySound,
    playWrongSound,
    playCorrectSound,
  };
}
