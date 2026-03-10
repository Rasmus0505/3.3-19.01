import { getLessonMediaPreview, hasLessonMedia } from "../../shared/media/localMediaStore";

export function getDefaultMediaPreview(lessonId) {
  return {
    lessonId,
    hasMedia: false,
    mediaType: "",
    coverDataUrl: "",
    aspectRatio: 0,
    fileName: "",
  };
}

export const mediaInitialState = {
  lessonMediaMetaMap: {},
  currentLessonNeedsBinding: false,
  mediaRestoreTick: 0,
};

export function createMediaSlice(set, get) {
  return {
    ...mediaInitialState,
    resetMediaState: () => set({ ...mediaInitialState }),
    setLessonMediaMetaMap: (lessonMediaMetaMap) => set({ lessonMediaMetaMap: lessonMediaMetaMap || {} }),
    mergeLessonMediaMeta: (patch) =>
      set((state) => ({
        lessonMediaMetaMap: {
          ...state.lessonMediaMetaMap,
          ...(patch || {}),
        },
      })),
    ensureLessonMediaPlaceholders: (lessons = []) =>
      set((state) => {
        const next = { ...state.lessonMediaMetaMap };
        for (const lesson of lessons) {
          if (!lesson?.id || next[lesson.id]) continue;
          next[lesson.id] = getDefaultMediaPreview(lesson.id);
        }
        return { lessonMediaMetaMap: next };
      }),
    setCurrentLessonNeedsBinding: (currentLessonNeedsBinding) => set({ currentLessonNeedsBinding: Boolean(currentLessonNeedsBinding) }),
    bumpMediaRestoreTick: () => set((state) => ({ mediaRestoreTick: Number(state.mediaRestoreTick || 0) + 1 })),
    async prefetchLessonMediaMeta(lessons = []) {
      if (!Array.isArray(lessons) || lessons.length === 0) {
        set({ lessonMediaMetaMap: {} });
        return {};
      }
      get().ensureLessonMediaPlaceholders(lessons);
      const entries = await Promise.all(
        lessons.map(async (lesson) => {
          try {
            return [lesson.id, await getLessonMediaPreview(lesson.id)];
          } catch (_) {
            return [lesson.id, getDefaultMediaPreview(lesson.id)];
          }
        }),
      );
      const nextMap = Object.fromEntries(entries);
      set((state) => ({
        lessonMediaMetaMap: {
          ...state.lessonMediaMetaMap,
          ...nextMap,
        },
      }));
      return nextMap;
    },
    async detectCurrentLessonMediaBinding(currentLesson) {
      if (!currentLesson?.id || currentLesson.media_storage !== "client_indexeddb") {
        set({ currentLessonNeedsBinding: false });
        return false;
      }
      try {
        const bound = await hasLessonMedia(currentLesson.id);
        set({ currentLessonNeedsBinding: !bound });
        return !bound;
      } catch (_) {
        set({ currentLessonNeedsBinding: true });
        return true;
      }
    },
  };
}
