import { api, parseResponse, toErrorText } from "../../shared/api/client";
import { deleteLessonMedia } from "../../shared/media/localMediaStore";
import { deleteLessonSubtitleCache, getActiveLessonSubtitleVariant, getLessonSubtitleAvailability, saveLessonSubtitleCacheSeed } from "../../shared/media/localSubtitleStore.js";

type Setter = (partial: Record<string, unknown> | ((state: any) => Record<string, unknown>)) => void;
type Getter = () => any;

function buildProgressSnapshot(progressData: any = {}) {
  return {
    current_sentence_index: Number(progressData.current_sentence_index || 0),
    completed_sentence_indexes: Array.isArray(progressData.completed_sentence_indexes) ? progressData.completed_sentence_indexes : [],
    last_played_at_ms: Number(progressData.last_played_at_ms || 0),
  };
}

function buildCatalogProgressSnapshot(progressSummary: any = null) {
  if (!progressSummary || typeof progressSummary !== "object") {
    return buildProgressSnapshot();
  }
  return {
    current_sentence_index: Number(progressSummary.current_sentence_index || 0),
    completed_sentence_indexes: Array.from({ length: Number(progressSummary.completed_sentence_count || 0) }, (_, index) => index),
    last_played_at_ms: Number(progressSummary.last_played_at_ms || 0),
  };
}

function getSentenceCount(detailData: any, fallbackLesson: any) {
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

function mergeLessonWithSubtitleVariant(lesson: any, variant: any) {
  if (!lesson || !variant || !Array.isArray(variant.sentences) || variant.sentences.length === 0) {
    return lesson;
  }
  return {
    ...lesson,
    sentences: variant.sentences,
    subtitle_variant_state: {
      semantic_split_enabled: false,
      split_mode: String(variant.split_mode || ""),
      source_word_count: Number(variant.source_word_count || 0),
      local_only: true,
    },
  };
}

async function applyLocalSubtitleVariant(lesson: any) {
  if (!lesson?.id) return lesson;
  try {
    const activeVariant = await getActiveLessonSubtitleVariant(lesson.id);
    return mergeLessonWithSubtitleVariant(lesson, activeVariant);
  } catch (_) {
    return lesson;
  }
}

function normalizeDeletedLessonIds(lessonIds: unknown[] = []) {
  return Array.from(new Set(listToNumberArray(lessonIds))).filter((item) => item > 0);
}

function listToNumberArray(items: unknown[] = []) {
  return (Array.isArray(items) ? items : []).map((item) => Number(item || 0)).filter((item) => Number.isInteger(item) && item > 0);
}

function removeDeletedLessonsFromState(state: any, deletedIds: unknown[]) {
  const deletedIdSet = new Set(listToNumberArray(deletedIds));
  const nextLessons = state.lessons.filter((item: any) => !deletedIdSet.has(Number(item.id || 0)));
  const nextLessonCardMetaMap = { ...state.lessonCardMetaMap };
  const nextSubtitleCacheMetaMap = { ...state.subtitleCacheMetaMap };
  for (const lessonId of deletedIdSet) {
    delete nextLessonCardMetaMap[lessonId];
    delete nextSubtitleCacheMetaMap[lessonId];
  }
  return {
    lessons: nextLessons,
    lessonCardMetaMap: nextLessonCardMetaMap,
    subtitleCacheMetaMap: nextSubtitleCacheMetaMap,
    currentLesson: deletedIdSet.has(Number(state.currentLesson?.id || 0)) ? null : state.currentLesson,
  };
}

async function cleanupDeletedLessonArtifacts(lessonIds: unknown[]) {
  const deletedIds = listToNumberArray(lessonIds);
  await Promise.all(
    deletedIds.flatMap((lessonId) => [
      deleteLessonMedia(lessonId).catch(() => null),
      deleteLessonSubtitleCache(lessonId).catch(() => null),
    ]),
  );
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
  subtitleSettings: { semantic_split_default_enabled: false, default_asr_model: "" },
  lessonCardMetaMap: {},
  subtitleCacheMetaMap: {},
};

export function createLessonSlice(set: Setter, get: Getter) {
  return {
    ...lessonInitialState,
    resetLessonState: () => set({ ...lessonInitialState }),
    setLessonsQuery: (lessonsQuery: unknown) => set({ lessonsQuery: String(lessonsQuery || "") }),
    setCurrentLesson: (currentLesson: unknown) => set({ currentLesson: currentLesson || null }),
    setLessonCardMetaMap: (lessonCardMetaMap: unknown) => set({ lessonCardMetaMap: lessonCardMetaMap || {} }),
    mergeLessonCardMeta: (lessonId: string | number, patch: unknown) =>
      set((state) => ({
        lessonCardMetaMap: {
          ...state.lessonCardMetaMap,
          [lessonId]: {
            ...(state.lessonCardMetaMap[lessonId] || {}),
            ...(patch || {}),
          },
        },
      })),
    setSubtitleCacheMetaMap: (subtitleCacheMetaMap: unknown) => set({ subtitleCacheMetaMap: subtitleCacheMetaMap || {} }),
    setWalletBalance: (walletBalance: unknown) => set({ walletBalance: Number(walletBalance || 0) }),
    setBillingRates: (billingRates: unknown) => set({ billingRates: Array.isArray(billingRates) ? billingRates : [] }),
    setSubtitleSettings: (subtitleSettings: any) =>
      set({
        subtitleSettings: {
          semantic_split_default_enabled: Boolean(subtitleSettings?.semantic_split_default_enabled),
          default_asr_model: String(subtitleSettings?.default_asr_model || ""),
        },
      }),
    async refreshSubtitleCacheMeta(lessonList: any, options: any = {}) {
      const sourceLessons = Array.isArray(lessonList) ? lessonList : get().lessons;
      if (!sourceLessons.length) {
        set({ subtitleCacheMetaMap: {} });
        return {};
      }
      const entries = await Promise.all(
        sourceLessons.map(async (lesson: any) => {
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
    async loadLessonDetail(lessonId: number, options: any = {}) {
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
        if (detailData?.subtitle_cache_seed) {
          try {
            await saveLessonSubtitleCacheSeed(lessonId, detailData.subtitle_cache_seed);
          } catch (_) {
            // Ignore local subtitle cache write failures.
          }
        }
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
    async loadCatalog(options: any = {}) {
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
          ? [...get().lessons, ...incoming.filter((item: any) => !get().lessons.some((lesson: any) => lesson.id === item.id))]
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
        const currentExists = currentLessonId && nextLessons.some((item: any) => item.id === currentLessonId);
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
          const walletBalance = Number(data.balance_amount_cents ?? data.balance_points ?? 0);
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
          subtitleSettings: { semantic_split_default_enabled: false, default_asr_model: "" },
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
              default_asr_model: String(data.subtitle_settings?.default_asr_model || ""),
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
    async refreshCurrentLesson(options: any = {}) {
      const lessonId = get().currentLesson?.id;
      if (!lessonId) return null;
      return get().loadLessonDetail(lessonId, { keepCurrentImmersiveState: true, ...options });
    },
    async renameLesson(lessonId: number, title: string) {
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
          lessons: state.lessons.map((item: any) => (item.id === lessonId ? { ...item, title: data.title } : item)),
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
    async deleteLesson(lessonId: number, options: any = {}) {
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
        const deletedIds = normalizeDeletedLessonIds([lessonId]);
        const deletingCurrentLesson = deletedIds.includes(Number(get().currentLesson?.id || 0));
        set((state) => {
          const nextState = removeDeletedLessonsFromState(state, deletedIds);
          const nextTotal = Math.max(0, Number(state.lessonsTotal || 0) - deletedIds.length);
          return {
            ...nextState,
            lessonsTotal: nextTotal,
            hasMoreLessons: nextTotal > nextState.lessons.length,
          };
        });
        await cleanupDeletedLessonArtifacts(deletedIds);
        if (deletingCurrentLesson) {
          get().setImmersiveActive(false);
        }
        get().setGlobalStatus("");
        return { ok: true, message: "删除历史成功", deletedIds, deletedCount: deletedIds.length, currentLessonDeleted: deletingCurrentLesson };
      } catch (error) {
        const message = `网络错误: ${String(error)}`;
        get().setGlobalStatus(message);
        return { ok: false, message };
      }
    },
    async deleteLessonsBulk({ lessonIds = [], deleteAll = false }: any = {}) {
      if (!get().accessToken) {
        return { ok: false, message: "请先登录" };
      }
      const normalizedIds = normalizeDeletedLessonIds(lessonIds);
      if (!deleteAll && !normalizedIds.length) {
        return { ok: false, message: "请先选择要删除的历史记录" };
      }
      try {
        const resp = await api(
          "/api/lessons/bulk-delete",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              lesson_ids: normalizedIds,
              delete_all: Boolean(deleteAll),
            }),
          },
          get().accessToken,
        );
        const data = await parseResponse(resp);
        if (!resp.ok) {
          const message = toErrorText(data, "批量删除历史失败");
          get().setGlobalStatus(message);
          return { ok: false, message, deletedIds: [], deletedCount: 0, failedIds: [] };
        }
        const deletedIds = normalizeDeletedLessonIds(data?.deleted_ids);
        const deletedCount = Math.max(0, Number(data?.deleted_count || deletedIds.length));
        const deletingCurrentLesson = deletedIds.includes(Number(get().currentLesson?.id || 0));
        set((state) => {
          if (deleteAll) {
            return {
              lessons: [],
              lessonsTotal: 0,
              hasMoreLessons: false,
              currentLesson: null,
              lessonCardMetaMap: {},
              subtitleCacheMetaMap: {},
            };
          }
          const nextState = removeDeletedLessonsFromState(state, deletedIds);
          const nextTotal = Math.max(0, Number(state.lessonsTotal || 0) - deletedCount);
          return {
            ...nextState,
            lessonsTotal: nextTotal,
            hasMoreLessons: nextTotal > nextState.lessons.length,
          };
        });
        await cleanupDeletedLessonArtifacts(deletedIds);
        if (deletingCurrentLesson || deleteAll) {
          get().setImmersiveActive(false);
        }
        get().setGlobalStatus("");
        return {
          ok: true,
          message: deletedCount > 0 ? `已删除 ${deletedCount} 条历史记录` : "没有可删除的历史记录",
          deletedIds,
          deletedCount,
          failedIds: listToNumberArray(data?.failed_ids),
          currentLessonDeleted: deletingCurrentLesson || deleteAll,
        };
      } catch (error) {
        const message = `网络错误: ${String(error)}`;
        get().setGlobalStatus(message);
        return { ok: false, message };
      }
    },
  };
}
