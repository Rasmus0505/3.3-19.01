import { useEffect } from "react";

export function useLearningShellPrefetch({
  accessToken,
  activePanel,
  immersiveLayoutActive,
  lessons,
  prefetchLessonMediaMeta,
  refreshSubtitleCacheMeta,
}) {
  useEffect(() => {
    if (!accessToken) {
      return;
    }
    if (!Array.isArray(lessons) || lessons.length === 0) {
      void prefetchLessonMediaMeta([]);
      void refreshSubtitleCacheMeta([]);
      return;
    }
    if (activePanel !== "history" || immersiveLayoutActive) {
      return;
    }
    void prefetchLessonMediaMeta(lessons);
    void refreshSubtitleCacheMeta(lessons);
  }, [accessToken, activePanel, immersiveLayoutActive, lessons, prefetchLessonMediaMeta, refreshSubtitleCacheMeta]);
}
