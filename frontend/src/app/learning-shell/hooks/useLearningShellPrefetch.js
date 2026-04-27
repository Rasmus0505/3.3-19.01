import { useEffect } from "react";

export function useLearningShellPrefetch({
  accessToken,
  activePanel,
  immersiveLayoutActive,
  lessons,
  prefetchLessonMediaMeta,
}) {
  useEffect(() => {
    if (!accessToken) {
      return;
    }
    if (!Array.isArray(lessons) || lessons.length === 0) {
      void prefetchLessonMediaMeta([]);
      return;
    }
    if (activePanel !== "history" || immersiveLayoutActive) {
      return;
    }
    void prefetchLessonMediaMeta(lessons);
  }, [accessToken, activePanel, immersiveLayoutActive, lessons, prefetchLessonMediaMeta]);
}


