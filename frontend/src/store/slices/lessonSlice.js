import { api, parseResponse, toErrorText } from "../../shared/api/client";
import { getActiveLessonSubtitleVariant, getLessonSubtitleAvailability } from "../../shared/media/localSubtitleStore";

function buildProgressSnapshot(progressData = {}) {
  return {
    current_sentence_index: Number(progressData.current_sentence_index || 0),
    completed_sentence_indexes: Array.isArray(progressData.completed_sentence_indexes) ? progressData.completed_sentence_indexes : [],
    last_played_at_ms: Number(progressData.last_played_at_ms || 0),
  };
}

function buildCatalogProgressSnapshot(progressSummary = null) {
  if (!progressSummary || typeof progressSummary !== "object") {
    return buildProgressSnapshot();
  }
  return {
    current_sentence_index: Number(progressSummary.current_sentence_index || 0),
    completed_sentence_indexes: Array.from({ length: Number(progressSummary.completed_sentence_count || 0) }, (_, index) => index),
    last_played_at_ms: Number(progressSummary.last_played_at_ms || 0),
  };
}

function getSentenceCount(detailData, fallbackLesson) {
  if (Array.isArray(detailData?.sentences)) {
    return detailData.sentences.length;
  }
  const sentenceCount = Number(detailData?.sentence_count);
  if (Number.isFinite(sentenceCount) && sentenceCount > 0) {
    return sentenceCount;
  }
  if (Array.isArray(fallbackLesson?.sentences)) {
    return fallbackLesson.sentences.length;
  }
  return 0;
}

function mergeLessonWithSubtitleVariant(lesson, variant) {
  if (!lesson || !variant || !Array.isArray(variant.sentences) || variant.sentences.length === 0) {
    return lesson;
  }
  return {
    ...lesson,
    sentences: variant.sentences,
    subtitle_variant_state: {
      semantic_split_enabled: Boolean(variant.semantic_split_enabled),
      split_mode: String(variant.split_mode || ""),
      source_word_count: Number(variant.source_word_count || 0),
      local_only: true,
    },
  };
}

async function applyLocalSubtitleVariant(lesson) {
  if (!lesson?.id) return lesson;
  try {
    const activeVariant = await getActiveLessonSubtitleVariant(lesson.id);
    return mergeLessonWithSubtitleVariant(lesson, activeVariant);
  } catch (_) {
    return lesson;
  }
}

export const lessonInitialState = {
  lessons: [],
  lessonsPage: 1,
  lessonsPageSize: 20,
  lessonsTotal: 0,
  hasMoreLessons: false,
  lessonsQuery: "",
  loadingLessons: false,
  loadingMoreLessons: false,
  currentLesson: null,
  walletBalance: 0,
  billingRates: [],
  subtitleSettings: { semantic_split_default_enabled: false },
  lessonCardMetaMap: {},
  subtitleCacheMetaMap: {},
  subtitleRegenerateState: null,
};

export function createLessonSlice(set, get) {
  return {
    ...lessonInitialState,
    resetLessonState: () => set({ ...lessonInitialState }),
    setLessonsQuery: (lessonsQuery) => set({ lessonsQuery: String(lessonsQuery || "") }),
    setCurrentLesson: (currentLesson) => set({ currentLesson: currentLesson || null }),
    setLessonCardMetaMap: (lessonCardMetaMap) => set({ lessonCardMetaMap: lessonCardMetaMap || {} }),
    mergeLessonCardMeta: (lessonId, patch) =>
      set((state) => ({
        lessonCardMetaMap: {
          ...state.lessonCardMetaMap,
          [lessonId]: {
            ...(state.lessonCardMetaMap[lessonId] || {}),
            ...(patch || {}),
          },
        },
      })),
    setSubtitleCacheMetaMap: (subtitleCacheMetaMap) => set({ subtitleCacheMetaMap: subtitleCacheMetaMap || {} }),
    setSubtitleRegenerateState: (subtitleRegenerateState) => set({ subtitleRegenerateState: subtitleRegenerateState || null }),
    setWalletBalance: (walletBalance) => set({ walletBalance: Number(walletBalance || 0) }),
    setBillingRates: (billingRates) => set({ billingRates: Array.isArray(billingRates) ? billingRates : [] }),
    setSubtitleSettings: (subtitleSettings) =>
      set({
        subtitleSettings: {
          semantic_split_default_enabled: Boolean(subtitleSettings?.semantic_split_default_enabled),
        },
      }),
    async refreshSubtitleCacheMeta(lessonList, options = {}) {
      const sourceLessons = Array.isArray(lessonList) ? lessonList : get().lessons;
      if (!sourceLessons.length) {
        set({ subtitleCacheMetaMap: {} });
        return {};
      }
      const entries = await Promise.all(
        sourceLessons.map(async (lesson) => {
          try {
            return [lesson.id, await getLessonSubtitleAvailability(lesson.id)];
          } catch (_) {
            return [
              lesson.id,
              {
                lessonId: lesson.id,
                hasSource: false,
                canRegenerate: false,
                currentVariantKey: "",
                currentSemanticSplitEnabled: null,
                hasPlainVariant: false,
                hasSemanticVariant: false,
              },
            ];
          }
        }),
      );
      const nextMap = Object.fromEntries(entries);
      set((state) => ({
        subtitleCacheMetaMap: options.merge ? { ...state.subtitleCacheMetaMap, ...nextMap } : nextMap,
      }));
      return nextMap;
    },
    async loadLessonDetail(lessonId, options = {}) {
      if (!lessonId || !get().accessToken) return null;
      const { autoEnterImmersive = false, keepCurrentImmersiveState = false } = options;
      try {
        const [detailResp, progressResp] = await Promise.all([
          api(`/api/lessons/${lessonId}`, {}, get().accessToken),
          api(`/api/lessons/${lessonId}/progress`, {}, get().accessToken),
        ]);
        const detailData = await parseResponse(detailResp);
        const progressData = await parseResponse(progressResp);
        if (!detailResp.ok) {
          const message = toErrorText(detailData, "加载课程详情失败");
          if (detailResp.status === 401 || detailResp.status === 403) {
            console.debug("[DEBUG] lesson detail auth failed", { lessonId, status: detailResp.status });
            get().markAuthExpired(message);
          }
          get().setGlobalStatus(message);
          return null;
        }
        if (progressResp.status === 401 || progressResp.status === 403) {
          const message = toErrorText(progressData, "登录已失效，请重新登录");
          console.debug("[DEBUG] lesson progress auth failed", { lessonId, status: progressResp.status });
          get().markAuthExpired(message);
          get().setGlobalStatus(message);
          return null;
        }
        const progress = progressResp.ok ? buildProgressSnapshot(progressData) : buildProgressSnapshot();
        const merged = await applyLocalSubtitleVariant({ ...detailData, progress });
        set((state) => ({
          currentLesson: merged,
          lessonCardMetaMap: {
            ...state.lessonCardMetaMap,
            [lessonId]: {
              sentenceCount: Array.isArray(merged?.sentences) ? merged.sentences.length : getSentenceCount(detailData, merged),
              progress,
            },
          },
        }));
        if (!keepCurrentImmersiveState) {
          get().setImmersiveActive(Boolean(autoEnterImmersive));
        }
        get().setGlobalStatus("");
        return merged;
      } catch (error) {
        get().setGlobalStatus(`网络错误: ${String(error)}`);
        return null;
      }
    },
    async loadCatalog(options = {}) {
      const {
        page = 1,
        pageSize = get().lessonsPageSize || 20,
        query = get().lessonsQuery || "",
        append = false,
        preferredLessonId = null,
        autoEnterImmersive = false,
      } = options;
      const accessToken = get().accessToken;
      if (!accessToken) {
        get().resetLessonState();
        get().resetMediaState();
        get().resetUiState();
        return [];
      }
      set(append ? { loadingMoreLessons: true } : { loadingLessons: true });
      try {
        const params = new URLSearchParams({
          page: String(page),
          page_size: String(pageSize),
        });
        if (String(query || "").trim()) {
          params.set("q", String(query || "").trim());
        }
        const resp = await api(`/api/lessons/catalog?${params.toString()}`, {}, accessToken);
        const data = await parseResponse(resp);
        if (!resp.ok) {
          const message = toErrorText(data, "加载课程失败");
          if (resp.status === 401 || resp.status === 403) {
            console.debug("[DEBUG] lesson catalog auth failed", { status: resp.status, page, query: String(query || "") });
            get().markAuthExpired(message);
          }
          get().setGlobalStatus(message);
          return [];
        }
        const incoming = Array.isArray(data.items) ? data.items : [];
        const nextLessons = append
          ? [...get().lessons, ...incoming.filter((item) => !get().lessons.some((lesson) => lesson.id === item.id))]
          : incoming;
        const nextCardMetaMap = append ? { ...get().lessonCardMetaMap } : {};
        for (const lesson of nextLessons) {
          nextCardMetaMap[lesson.id] = {
            ...(nextCardMetaMap[lesson.id] || {}),
            sentenceCount: Number(lesson.sentence_count || 0),
            progress: buildCatalogProgressSnapshot(lesson.progress_summary),
          };
        }
        set({
          lessons: nextLessons,
          lessonsPage: Number(data.page || page),
          lessonsPageSize: Number(data.page_size || pageSize),
          lessonsTotal: Number(data.total || 0),
          hasMoreLessons: Boolean(data.has_more),
          lessonsQuery: String(query || ""),
          lessonCardMetaMap: nextCardMetaMap,
        });
        get().ensureLessonMediaPlaceholders(nextLessons);
        const currentLessonId = get().currentLesson?.id;
        const currentExists = currentLessonId && nextLessons.some((item) => item.id === currentLessonId);
        const targetLessonId = preferredLessonId || (!append && !currentExists ? nextLessons[0]?.id : null);
        if (!nextLessons.length && !targetLessonId) {
          if (!String(query || "").trim()) {
            set({ currentLesson: null });
            get().setImmersiveActive(false);
          }
          get().setGlobalStatus("");
          return nextLessons;
        }
        if (targetLessonId) {
          await get().loadLessonDetail(targetLessonId, { autoEnterImmersive });
        }
        get().setGlobalStatus("");
        return nextLessons;
      } catch (error) {
        get().setGlobalStatus(`网络错误: ${String(error)}`);
        return [];
      } finally {
        set({ loadingLessons: false, loadingMoreLessons: false });
      }
    },
    async loadWallet() {
      if (!get().accessToken) {
        set({ walletBalance: 0 });
        return 0;
      }
      try {
        const resp = await api("/api/wallet/me", {}, get().accessToken);
        const data = await parseResponse(resp);
        if (resp.ok) {
          const walletBalance = Number(data.balance_points || 0);
          set({ walletBalance });
          return walletBalance;
        }
        if (resp.status === 401 || resp.status === 403) {
          const message = toErrorText(data, "登录已失效，请重新登录");
          console.debug("[DEBUG] wallet auth failed", { status: resp.status });
          get().markAuthExpired(message);
          get().setGlobalStatus(message);
        }
      } catch (_) {
        // noop
      }
      return 0;
    },
    async loadBillingRates() {
      if (!get().accessToken) {
        set({
          billingRates: [],
          subtitleSettings: { semantic_split_default_enabled: false },
        });
        return [];
      }
      try {
        const resp = await api("/api/billing/rates", {}, get().accessToken);
        const data = await parseResponse(resp);
        if (resp.ok) {
          set({
            billingRates: Array.isArray(data.rates) ? data.rates : [],
            subtitleSettings: {
              semantic_split_default_enabled: Boolean(data.subtitle_settings?.semantic_split_default_enabled),
            },
          });
          return Array.isArray(data.rates) ? data.rates : [];
        }
        if (resp.status === 401 || resp.status === 403) {
          const message = toErrorText(data, "登录已失效，请重新登录");
          console.debug("[DEBUG] billing rates auth failed", { status: resp.status });
          get().markAuthExpired(message);
          get().setGlobalStatus(message);
        }
      } catch (_) {
        // noop
      }
      return [];
    },
    async refreshCurrentLesson(options = {}) {
      const lessonId = get().currentLesson?.id;
      if (!lessonId) return null;
      return get().loadLessonDetail(lessonId, { keepCurrentImmersiveState: true, ...options });
    },
    async renameLesson(lessonId, title) {
      if (!get().accessToken) {
        return { ok: false, message: "请先登录" };
      }
      try {
        const resp = await api(
          `/api/lessons/${lessonId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title }),
          },
          get().accessToken,
        );
        const data = await parseResponse(resp);
        if (!resp.ok) {
          const message = toErrorText(data, "重命名课程失败");
          get().setGlobalStatus(message);
          return { ok: false, message };
        }
        set((state) => ({
          lessons: state.lessons.map((item) => (item.id === lessonId ? { ...item, title: data.title } : item)),
          currentLesson: state.currentLesson?.id === lessonId ? { ...state.currentLesson, title: data.title } : state.currentLesson,
        }));
        get().setGlobalStatus("");
        return { ok: true };
      } catch (error) {
        const message = `网络错误: ${String(error)}`;
        get().setGlobalStatus(message);
        return { ok: false, message };
      }
    },
    async deleteLesson(lessonId, options = {}) {
      if (!get().accessToken) {
        return { ok: false, message: "请先登录" };
      }
      try {
        const resp = await api(`/api/lessons/${lessonId}`, { method: "DELETE" }, get().accessToken);
        const data = await parseResponse(resp);
        if (!resp.ok) {
          const message = toErrorText(data, "删除课程失败");
          get().setGlobalStatus(message);
          return { ok: false, message };
        }
        const currentSnapshot = get().lessons;
        const removedIndex = currentSnapshot.findIndex((item) => item.id === lessonId);
        const nextLessons = currentSnapshot.filter((item) => item.id !== lessonId);
        const deletingCurrentLesson = get().currentLesson?.id === lessonId;
        set((state) => {
          const nextLessonCardMetaMap = { ...state.lessonCardMetaMap };
          const nextSubtitleCacheMetaMap = { ...state.subtitleCacheMetaMap };
          delete nextLessonCardMetaMap[lessonId];
          delete nextSubtitleCacheMetaMap[lessonId];
          return {
            lessons: nextLessons,
            currentLesson: deletingCurrentLesson ? null : state.currentLesson,
            lessonCardMetaMap: nextLessonCardMetaMap,
            subtitleCacheMetaMap: nextSubtitleCacheMetaMap,
          };
        });
        if (deletingCurrentLesson) {
          if (!nextLessons.length) {
            get().setImmersiveActive(false);
          } else {
            const fallbackIndex = removedIndex >= 0 ? Math.min(removedIndex, nextLessons.length - 1) : 0;
            const nextLessonId = nextLessons[fallbackIndex]?.id;
            if (nextLessonId) {
              await get().loadLessonDetail(nextLessonId, {
                autoEnterImmersive: Boolean(options.keepImmersiveAfterFallback),
              });
            }
          }
        }
        get().setGlobalStatus("");
        return { ok: true, message: "删除历史成功" };
      } catch (error) {
        const message = `网络错误: ${String(error)}`;
        get().setGlobalStatus(message);
        return { ok: false, message };
      }
    },
  };
}
