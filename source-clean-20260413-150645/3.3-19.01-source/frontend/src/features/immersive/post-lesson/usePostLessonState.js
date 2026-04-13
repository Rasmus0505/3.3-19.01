/**
 * usePostLessonState — Manages post-lesson progress via localStorage.
 *
 * Mirrors useCourseState.js pattern but uses localStorage for simplicity.
 */
import { useState, useCallback, useEffect } from "react";

const INITIAL_PROGRESS = {
  scene1_completed: false,
  scene2_completed: false,
  scene3_completed: false,
  completedAt: null,
};

function createInitialData() {
  return {
    progress: { ...INITIAL_PROGRESS },
    vocabResults: null,
    quizResults: null,
    shadowingResults: null,
  };
}

function storageKey(lessonId) {
  return `post_lesson_v1_${lessonId}`;
}

function loadFromStorage(lessonId) {
  try {
    const raw = localStorage.getItem(storageKey(lessonId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveToStorage(lessonId, data) {
  try {
    localStorage.setItem(storageKey(lessonId), JSON.stringify(data));
  } catch {
    /* localStorage full — silently ignore */
  }
}

function resolveActiveScene(progress) {
  if (!progress) return 1;
  if (progress.completedAt) return 4;
  if (!progress.scene1_completed) return 1;
  if (!progress.scene2_completed) return 2;
  if (!progress.scene3_completed) return 3;
  return 4;
}

export function usePostLessonState(lessonId) {
  const [postLessonData, setPostLessonData] = useState(createInitialData);
  const [activeScene, setActiveScene] = useState(1);
  const [isLoading, setIsLoading] = useState(true);

  // Load from localStorage on mount
  useEffect(() => {
    if (!lessonId) {
      setIsLoading(false);
      return;
    }
    const saved = loadFromStorage(lessonId);
    if (saved) {
      setPostLessonData(saved);
      setActiveScene(resolveActiveScene(saved.progress));
    }
    setIsLoading(false);
  }, [lessonId]);

  const persist = useCallback(
    (data) => {
      if (lessonId) saveToStorage(lessonId, data);
    },
    [lessonId],
  );

  const completeScene = useCallback(
    (sceneNum) => {
      setPostLessonData((prev) => {
        const next = {
          ...prev,
          progress: { ...prev.progress, [`scene${sceneNum}_completed`]: true },
        };
        const p = next.progress;
        if (p.scene1_completed && p.scene2_completed && p.scene3_completed && !p.completedAt) {
          next.progress = { ...next.progress, completedAt: new Date().toISOString() };
        }
        persist(next);
        return next;
      });
      setActiveScene(sceneNum < 3 ? sceneNum + 1 : 4);
    },
    [persist],
  );

  const goToScene = useCallback((num) => {
    setActiveScene(num);
  }, []);

  const setVocabResults = useCallback(
    (results) => {
      setPostLessonData((prev) => {
        const next = { ...prev, vocabResults: results };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const setQuizResults = useCallback(
    (results) => {
      setPostLessonData((prev) => {
        const next = { ...prev, quizResults: results };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const setShadowingResults = useCallback(
    (results) => {
      setPostLessonData((prev) => {
        const next = { ...prev, shadowingResults: results };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const resetPostLesson = useCallback(() => {
    const fresh = createInitialData();
    setPostLessonData(fresh);
    setActiveScene(1);
    persist(fresh);
    // Also clear cached quiz
    try {
      localStorage.removeItem(`post_lesson_quiz_v1_${lessonId}`);
    } catch {
      /* ignore */
    }
  }, [lessonId, persist]);

  return {
    postLessonData,
    activeScene,
    isLoading,
    completeScene,
    goToScene,
    setVocabResults,
    setQuizResults,
    setShadowingResults,
    resetPostLesson,
  };
}
