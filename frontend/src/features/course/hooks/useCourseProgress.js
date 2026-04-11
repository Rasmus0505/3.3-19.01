/**
 * useCourseProgress — Tracks scene completion and persists to localStorage.
 *
 * Storage key: course_progress_v1_{courseId}
 * Schema: { completedScenes: number[], quizScores: {[idx]: {correct, total}},
 *           courseCompletedAt: string|null, lastUpdated: string }
 */
import { useState, useEffect, useCallback, useRef } from "react";

function loadFromStorage(courseId) {
  try {
    const raw = localStorage.getItem(`course_progress_v1_${courseId}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function useCourseProgress(courseId, totalScenes) {
  const [completedScenes, setCompletedScenes] = useState(() => {
    const data = loadFromStorage(courseId);
    return data ? new Set(data.completedScenes || []) : new Set();
  });

  const [quizScores, setQuizScores] = useState(() => {
    const data = loadFromStorage(courseId);
    return data?.quizScores || {};
  });

  const [isCourseCompleted, setIsCourseCompleted] = useState(() => {
    const data = loadFromStorage(courseId);
    return Boolean(data?.courseCompletedAt);
  });

  // Track the completion timestamp without re-reading localStorage on every render
  const completedAtRef = useRef(() => {
    const data = loadFromStorage(courseId);
    return data?.courseCompletedAt || null;
  });

  // Persist whenever state changes
  useEffect(() => {
    if (!courseId) return;
    const completedAt = isCourseCompleted
      ? (completedAtRef.current || new Date().toISOString())
      : null;
    if (isCourseCompleted && !completedAtRef.current) {
      completedAtRef.current = completedAt;
    }
    try {
      localStorage.setItem(
        `course_progress_v1_${courseId}`,
        JSON.stringify({
          completedScenes: [...completedScenes],
          quizScores,
          courseCompletedAt: completedAt,
          lastUpdated: new Date().toISOString(),
        })
      );
    } catch {
      // localStorage quota exceeded or unavailable — ignore silently
    }
  }, [completedScenes, quizScores, isCourseCompleted, courseId]);

  const markSceneComplete = useCallback((idx, meta = {}) => {
    if (meta.quizScore) {
      setQuizScores((prev) => ({ ...prev, [idx]: meta.quizScore }));
    }
    setCompletedScenes((prev) => new Set([...prev, idx]));
  }, []);

  const finishCourse = useCallback(() => {
    setIsCourseCompleted(true);
  }, []);

  const resetProgress = useCallback(() => {
    setCompletedScenes(new Set());
    setQuizScores({});
    setIsCourseCompleted(false);
    completedAtRef.current = null;
    try {
      localStorage.removeItem(`course_progress_v1_${courseId}`);
    } catch {
      // ignore
    }
  }, [courseId]);

  const progress =
    totalScenes > 0 ? Math.round((completedScenes.size / totalScenes) * 100) : 0;

  return {
    completedScenes,
    quizScores,
    isCourseCompleted,
    markSceneComplete,
    finishCourse,
    resetProgress,
    progress,
  };
}
