// 沉浸式学习输入控制 Hook
// 管理打字状态、单词输入和字符状态

import { useCallback, useEffect, useRef, useState } from "react";
import { useTypingFeedbackSounds } from "../useTypingFeedbackSounds";
import { normalizeToken } from "../tokenNormalize";

const APOSTROPHE_RE = /['']/g;

function normalizeComparableToken(token) {
  return normalizeToken(String(token || "")).replace(APOSTROPHE_RE, "");
}

function countTokenInputErrors(inputValue, expectedToken) {
  const actual = normalizeComparableToken(inputValue);
  const expected = normalizeComparableToken(expectedToken);
  const sameLength = Math.min(actual.length, expected.length);

  let mismatchCount = 0;
  for (let idx = 0; idx < sameLength; idx += 1) {
    if (actual[idx]?.toLowerCase() !== expected[idx]?.toLowerCase()) {
      mismatchCount += 1;
    }
  }

  if (actual.length > expected.length) {
    mismatchCount += actual.length - expected.length;
  }
  return mismatchCount;
}

function cloneWordSnapshot(activeWordIndex, currentWordInput, wordInputs, wordStatuses) {
  return {
    activeWordIndex: Math.max(0, Number(activeWordIndex || 0)),
    currentWordInput: String(currentWordInput || ""),
    wordInputs: Array.isArray(wordInputs) ? [...wordInputs] : [],
    wordStatuses: Array.isArray(wordStatuses) ? [...wordStatuses] : [],
  };
}

function createWordState(tokens) {
  const safeTokens = Array.isArray(tokens) ? tokens : [];
  return {
    activeWordIndex: 0,
    currentWordInput: "",
    wordInputs: safeTokens.map(() => ""),
    wordStatuses: safeTokens.map((_, idx) => (idx === 0 ? "active" : "pending")),
  };
}

export function useTypingController({
  lesson,
  currentSentenceIndex,
  phase,
  immersiveActive,
  expectedTokens = [],
  onTypingDone,
}) {
  const [activeWordIndex, setActiveWordIndex] = useState(0);
  const [currentWordInput, setCurrentWordInput] = useState("");
  const [wordInputs, setWordInputs] = useState([]);
  const [wordStatuses, setWordStatuses] = useState([]);
  const [wordRevealComparableIndices, setWordRevealComparableIndices] = useState([]);

  const activeWordIndexRef = useRef(0);
  const currentWordInputRef = useRef("");
  const wordInputsRef = useRef([]);
  const wordStatusesRef = useRef([]);

  const { playKeySound, playWrongSound, playCorrectSound } = useTypingFeedbackSounds();

  const typingEnabled =
    immersiveActive && Boolean(lesson?.sentences?.[currentSentenceIndex]) && phase !== "transition" && phase !== "lesson_completed";

  const applyWordSnapshot = useCallback((snapshot) => {
    activeWordIndexRef.current = snapshot.activeWordIndex;
    currentWordInputRef.current = snapshot.currentWordInput;
    wordInputsRef.current = snapshot.wordInputs;
    wordStatusesRef.current = snapshot.wordStatuses;
    setActiveWordIndex(snapshot.activeWordIndex);
    setCurrentWordInput(snapshot.currentWordInput);
    setWordInputs(snapshot.wordInputs);
    setWordStatuses(snapshot.wordStatuses);
  }, []);

  const resetWordTyping = useCallback(
    (sentence) => {
      const next = createWordState(sentence?.tokens || []);
      applyWordSnapshot(next);
      setWordRevealComparableIndices([]);
    },
    [applyWordSnapshot]
  );

  const clearActiveWordInput = useCallback(() => {
    const snapshot = cloneWordSnapshot(
      activeWordIndexRef.current,
      currentWordInputRef.current,
      wordInputsRef.current,
      wordStatusesRef.current
    );
    if (snapshot.activeWordIndex < snapshot.wordInputs.length) {
      snapshot.wordInputs[snapshot.activeWordIndex] = "";
      snapshot.wordStatuses[snapshot.activeWordIndex] = "active";
    }
    snapshot.currentWordInput = "";
    applyWordSnapshot(snapshot);
  }, [applyWordSnapshot]);

  const commitCorrectWord = useCallback(
    (typedWord) => {
      playCorrectSound();
      const snapshot = cloneWordSnapshot(
        activeWordIndexRef.current,
        currentWordInputRef.current,
        wordInputsRef.current,
        wordStatusesRef.current
      );
      const activeIndex = snapshot.activeWordIndex;
      const canonicalWord = expectedTokens[activeIndex] || typedWord.trim();
      if (activeIndex >= expectedTokens.length) {
        return activeIndex;
      }
      snapshot.wordInputs[activeIndex] = canonicalWord;
      snapshot.wordStatuses[activeIndex] = "correct";
      snapshot.currentWordInput = "";
      const nextActiveIndex = activeIndex + 1;
      if (nextActiveIndex < expectedTokens.length) {
        snapshot.wordStatuses[nextActiveIndex] = "active";
        snapshot.activeWordIndex = nextActiveIndex;
      } else {
        snapshot.activeWordIndex = expectedTokens.length;
        onTypingDone?.();
      }
      applyWordSnapshot(snapshot);
      return snapshot.activeWordIndex;
    },
    [applyWordSnapshot, expectedTokens, onTypingDone, playCorrectSound]
  );

  const commitWrongWord = useCallback(() => {
    playWrongSound();
    clearActiveWordInput();
  }, [clearActiveWordInput, playWrongSound]);

  // Sync refs with state
  useEffect(() => {
    activeWordIndexRef.current = activeWordIndex;
  }, [activeWordIndex]);

  useEffect(() => {
    wordInputsRef.current = wordInputs;
  }, [wordInputs]);

  useEffect(() => {
    wordStatusesRef.current = wordStatuses;
  }, [wordStatuses]);

  return {
    // State
    activeWordIndex,
    setActiveWordIndex,
    currentWordInput,
    setCurrentWordInput,
    wordInputs,
    setWordInputs,
    wordStatuses,
    setWordStatuses,
    wordRevealComparableIndices,
    setWordRevealComparableIndices,
    typingEnabled,
    // Refs
    activeWordIndexRef,
    currentWordInputRef,
    wordInputsRef,
    wordStatusesRef,
    // Actions
    applyWordSnapshot,
    resetWordTyping,
    clearActiveWordInput,
    commitCorrectWord,
    commitWrongWord,
    countTokenInputErrors,
  };
}


