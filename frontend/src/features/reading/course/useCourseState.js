/**
 * useCourseState — Manages reading course progress via IndexedDB.
 *
 * Reads/writes courseData on the article's rewrite record.
 */
import { useState, useCallback, useEffect, useRef } from "react";
import { getRewriteRecord, saveCourseDataToRecord } from "../readingRewriteDB";

const INITIAL_PROGRESS = {
  scene1_completed: false,
  scene2_completed: false,
  scene3_completed: false,
  scene4_completed: false,
  scene5_completed: false,
  completedAt: null,
};

function createInitialCourseData() {
  return {
    discussion: null,
    progress: { ...INITIAL_PROGRESS },
    settings: { explanationLanguage: "zh" },
  };
}

export function useCourseState(articleId) {
  const [courseData, setCourseData] = useState(createInitialCourseData);
  const [activeScene, setActiveScene] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const savingRef = useRef(false);

  // Load from IndexedDB on mount
  useEffect(() => {
    if (!articleId) return;
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      const record = await getRewriteRecord(articleId);
      if (cancelled) return;
      if (record?.courseData) {
        setCourseData(record.courseData);
        // Resume at the first incomplete scene
        const p = record.courseData.progress || INITIAL_PROGRESS;
        if (p.completedAt) setActiveScene(6);
        else if (!p.scene1_completed) setActiveScene(1);
        else if (!p.scene2_completed) setActiveScene(2);
        else if (!p.scene3_completed) setActiveScene(3);
        else if (!p.scene4_completed) setActiveScene(4);
        else if (!p.scene5_completed) setActiveScene(5);
        else setActiveScene(6);
      }
      setIsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [articleId]);

  // Persist to IndexedDB whenever courseData changes (debounced)
  const persist = useCallback(async (data) => {
    if (!articleId || savingRef.current) return;
    savingRef.current = true;
    try {
      await saveCourseDataToRecord(articleId, data);
    } finally {
      savingRef.current = false;
    }
  }, [articleId]);

  const completeScene = useCallback((sceneNum) => {
    setCourseData((prev) => {
      const next = {
        ...prev,
        progress: { ...prev.progress, [`scene${sceneNum}_completed`]: true },
      };
      // Auto-set completedAt when all 5 scenes are done
      const p = next.progress;
      if (p.scene1_completed && p.scene2_completed && p.scene3_completed && p.scene4_completed && p.scene5_completed && !p.completedAt) {
        next.progress.completedAt = new Date().toISOString();
      }
      persist(next);
      return next;
    });
    // Advance to next scene
    if (sceneNum < 5) {
      setActiveScene(sceneNum + 1);
    } else {
      setActiveScene(6); // summary
    }
  }, [persist]);

  const goToScene = useCallback((num) => {
    setActiveScene(num);
  }, []);

  const setDiscussion = useCallback((discussion) => {
    setCourseData((prev) => {
      const next = { ...prev, discussion };
      persist(next);
      return next;
    });
  }, [persist]);

  const setWriting = useCallback((writing) => {
    setCourseData((prev) => {
      const next = { ...prev, writing };
      persist(next);
      return next;
    });
  }, [persist]);

  const setSettings = useCallback((settings) => {
    setCourseData((prev) => {
      const next = { ...prev, settings: { ...prev.settings, ...settings } };
      persist(next);
      return next;
    });
  }, [persist]);

  const resetCourse = useCallback(() => {
    const fresh = createInitialCourseData();
    setCourseData(fresh);
    setActiveScene(1);
    persist(fresh);
  }, [persist]);

  return {
    courseData,
    activeScene,
    isLoading,
    completeScene,
    goToScene,
    setDiscussion,
    setWriting,
    setSettings,
    resetCourse,
  };
}
