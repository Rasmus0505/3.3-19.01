import { useEffect, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { api, parseResponse, toErrorText } from "../../shared/api/client";
import {
  deleteLessonMedia,
  getLessonMediaPreview,
  readMediaDurationSeconds,
  requestPersistentStorage,
  saveLessonMedia,
} from "../../shared/media/localMediaStore";
import {
  deleteLessonSubtitleCache,
  getCachedLessonSubtitleVariant,
  getLessonSubtitleAvailability,
  getLessonSubtitleCache,
  saveLessonSubtitleCacheSeed,
  saveLessonSubtitleVariant,
  setActiveLessonSubtitleVariant,
} from "../../shared/media/localSubtitleStore";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Sidebar,
  SidebarInset,
  SidebarProvider,
} from "../../shared/ui";
import { useAppStore } from "../../store";
import { getDefaultMediaPreview } from "../../store/slices/mediaSlice";
import { LearningShellHeader } from "./LearningShellHeader";
import { LearningShellPanelContent } from "./LearningShellPanelContent";
import { PANEL_ITEMS, SIDEBAR_STORAGE_KEY, LearningShellSidebar, getPanelItemByPathname, getPanelPath } from "./LearningShellSidebar";
import { UploadTaskFloatingCard } from "./UploadTaskFloatingCard";
import { useCurrentLessonMediaBinding } from "./hooks/useCurrentLessonMediaBinding";
import { useLearningShellBootstrap } from "./hooks/useLearningShellBootstrap";
import { useLearningShellPrefetch } from "./hooks/useLearningShellPrefetch";

function parseSseEventBlock(block) {
  if (!block) return null;
  const lines = String(block)
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean);
  if (!lines.length) return null;
  let event = "message";
  const dataLines = [];
  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim() || "message";
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trim());
    }
  }
  if (!dataLines.length) return null;
  try {
    return { event, data: JSON.parse(dataLines.join("\n")) };
  } catch (_) {
    return null;
  }
}

function buildSubtitleRegenerateState(lessonId, payload = {}, status = "streaming") {
  return {
    lessonId,
    stage: String(payload.stage || "prepare"),
    message: String(payload.message || "正在重切分句"),
    done: Number(payload.translate_done || 0),
    total: Number(payload.translate_total || 0),
    status,
    semanticSplitEnabled: Boolean(payload.semantic_split_enabled),
  };
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

function buildCreatedLessonMediaPreview(lesson, mediaPreview, mediaPersisted) {
  const lessonId = Number(lesson?.id || mediaPreview?.lessonId || 0);
  return {
    ...getDefaultMediaPreview(lessonId),
    ...(mediaPreview || {}),
    lessonId,
    hasMedia: Boolean(mediaPersisted && (mediaPreview?.hasMedia ?? true)),
    mediaType: String(mediaPreview?.mediaType || ""),
    coverDataUrl: String(mediaPreview?.coverDataUrl || ""),
    aspectRatio: Number(mediaPreview?.aspectRatio || 0),
    fileName: String(mediaPreview?.fileName || lesson?.source_filename || ""),
  };
}

export function LearningShellContainer() {
  const location = useLocation();
  const navigate = useNavigate();

  const accessToken = useAppStore((state) => state.accessToken);
  const hasStoredToken = useAppStore((state) => state.hasStoredToken);
  const authStatus = useAppStore((state) => state.authStatus);
  const authStatusMessage = useAppStore((state) => state.authStatusMessage);
  const hydrateAccessToken = useAppStore((state) => state.hydrateAccessToken);
  const logout = useAppStore((state) => state.logout);
  const detectAdmin = useAppStore((state) => state.detectAdmin);
  const isAdminUser = useAppStore((state) => state.isAdminUser);

  const lessons = useAppStore((state) => state.lessons);
  const lessonsPage = useAppStore((state) => state.lessonsPage);
  const lessonsQuery = useAppStore((state) => state.lessonsQuery);
  const hasMoreLessons = useAppStore((state) => state.hasMoreLessons);
  const loadingLessons = useAppStore((state) => state.loadingLessons);
  const loadingMoreLessons = useAppStore((state) => state.loadingMoreLessons);
  const currentLesson = useAppStore((state) => state.currentLesson);
  const walletBalance = useAppStore((state) => state.walletBalance);
  const billingRates = useAppStore((state) => state.billingRates);
  const subtitleSettings = useAppStore((state) => state.subtitleSettings);
  const lessonCardMetaMap = useAppStore((state) => state.lessonCardMetaMap);
  const subtitleCacheMetaMap = useAppStore((state) => state.subtitleCacheMetaMap);
  const subtitleRegenerateState = useAppStore((state) => state.subtitleRegenerateState);

  const lessonMediaMetaMap = useAppStore((state) => state.lessonMediaMetaMap);
  const currentLessonNeedsBinding = useAppStore((state) => state.currentLessonNeedsBinding);
  const mediaRestoreTick = useAppStore((state) => state.mediaRestoreTick);

  const globalStatus = useAppStore((state) => state.globalStatus);
  const commandOpen = useAppStore((state) => state.commandOpen);
  const commandQuery = useAppStore((state) => state.commandQuery);
  const mobileNavOpen = useAppStore((state) => state.mobileNavOpen);
  const immersiveActive = useAppStore((state) => state.immersiveActive);
  const uploadTaskState = useAppStore((state) => state.uploadTaskState);

  const loadCatalog = useAppStore((state) => state.loadCatalog);
  const loadLessonDetail = useAppStore((state) => state.loadLessonDetail);
  const loadWallet = useAppStore((state) => state.loadWallet);
  const loadBillingRates = useAppStore((state) => state.loadBillingRates);
  const refreshCurrentLesson = useAppStore((state) => state.refreshCurrentLesson);
  const renameLesson = useAppStore((state) => state.renameLesson);
  const deleteLesson = useAppStore((state) => state.deleteLesson);
  const refreshSubtitleCacheMeta = useAppStore((state) => state.refreshSubtitleCacheMeta);
  const setSubtitleRegenerateState = useAppStore((state) => state.setSubtitleRegenerateState);

  const prefetchLessonMediaMeta = useAppStore((state) => state.prefetchLessonMediaMeta);
  const detectCurrentLessonMediaBinding = useAppStore((state) => state.detectCurrentLessonMediaBinding);
  const mergeLessonMediaMeta = useAppStore((state) => state.mergeLessonMediaMeta);
  const setCurrentLessonNeedsBinding = useAppStore((state) => state.setCurrentLessonNeedsBinding);
  const bumpMediaRestoreTick = useAppStore((state) => state.bumpMediaRestoreTick);

  const setGlobalStatus = useAppStore((state) => state.setGlobalStatus);
  const setCommandOpen = useAppStore((state) => state.setCommandOpen);
  const setCommandQuery = useAppStore((state) => state.setCommandQuery);
  const setMobileNavOpen = useAppStore((state) => state.setMobileNavOpen);
  const setImmersiveActive = useAppStore((state) => state.setImmersiveActive);
  const setUploadTaskState = useAppStore((state) => state.setUploadTaskState);

  const activePanel = getPanelItemByPathname(location.pathname).key;
  const immersiveLayoutActive = Boolean(accessToken && currentLesson?.id && immersiveActive);
  const lastNonImmersivePanelRef = useRef(getPanelItemByPathname(location.pathname).key);

  useLearningShellBootstrap({
    accessToken,
    loadCatalog,
    loadWallet,
    loadBillingRates,
    detectAdmin,
  });
  useLearningShellPrefetch({
    accessToken,
    activePanel,
    immersiveLayoutActive,
    lessons,
    prefetchLessonMediaMeta,
    refreshSubtitleCacheMeta,
  });
  useCurrentLessonMediaBinding({
    currentLesson,
    detectCurrentLessonMediaBinding,
  });

  useEffect(() => {
    if (!immersiveLayoutActive) {
      lastNonImmersivePanelRef.current = activePanel;
    }
    console.debug("[DEBUG] learning sidebar route synced", {
      pathname: location.pathname,
      panel: activePanel,
      immersiveLayoutActive,
    });
  }, [activePanel, immersiveLayoutActive, location.pathname]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname, setMobileNavOpen]);

  useEffect(() => {
    if (!accessToken || !commandOpen) return undefined;
    const timer = setTimeout(() => {
      void loadCatalog({
        page: 1,
        query: commandQuery,
        preferredLessonId: currentLesson?.id || null,
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [accessToken, commandOpen, commandQuery, currentLesson?.id, loadCatalog]);

  const filteredLessons = useMemo(() => lessons, [lessons]);
  const currentPanel = PANEL_ITEMS.find((item) => item.key === activePanel) || PANEL_ITEMS[0];

  async function persistLessonSubtitleCacheSeed(lesson) {
    if (!lesson?.id || !lesson?.subtitle_cache_seed) return;
    try {
      await saveLessonSubtitleCacheSeed(lesson.id, lesson.subtitle_cache_seed);
      await refreshSubtitleCacheMeta([{ id: lesson.id }], { merge: true });
    } catch (_) {
      // Ignore local subtitle cache write failures.
    }
  }

  function handleAuthed() {
    hydrateAccessToken();
    setGlobalStatus("");
    setUploadTaskState(null);
  }

  function handlePanelChange(nextPanel) {
    navigate(getPanelPath(nextPanel));
    setMobileNavOpen(false);
  }

  function handleLogout() {
    logout();
    navigate("/");
  }

  function handleExitImmersive() {
    setImmersiveActive(false);
    navigate(getPanelPath(lastNonImmersivePanelRef.current));
  }

  async function handleLessonCreated(payload) {
    const lesson = payload?.lesson || null;
    const lessonId = lesson?.id;
    if (!lessonId) return;

    const mediaPersisted = Boolean(payload?.mediaPersisted);
    const needsBinding = lesson.media_storage === "client_indexeddb" && !mediaPersisted;
    const shouldAutoEnterImmersive = lesson.media_storage !== "client_indexeddb" || mediaPersisted;
    const mediaPreview = buildCreatedLessonMediaPreview(lesson, payload?.mediaPreview, mediaPersisted);

    mergeLessonMediaMeta({ [lessonId]: mediaPreview });
    await persistLessonSubtitleCacheSeed(lesson);
    await loadCatalog({ page: 1, query: "", preferredLessonId: lessonId, autoEnterImmersive: shouldAutoEnterImmersive });
    await loadWallet();
    setCurrentLessonNeedsBinding(needsBinding);
  }

  async function handleCommandSelect(lessonId) {
    if (!lessonId) return;
    setCommandOpen(false);
    setCommandQuery("");
    navigate("/");
    if (lessonId !== currentLesson?.id) {
      await loadLessonDetail(lessonId, { autoEnterImmersive: false });
    }
    if (lessonsQuery) {
      void loadCatalog({ page: 1, query: "" });
    }
  }

  function handleStartImmersive() {
    if (!currentLesson?.id) return;
    lastNonImmersivePanelRef.current = activePanel;
    setImmersiveActive(true);
  }

  async function handleStartLesson(lessonId) {
    if (!lessonId) return;
    lastNonImmersivePanelRef.current = activePanel;
    await loadLessonDetail(lessonId, { autoEnterImmersive: true });
  }

  async function handleNavigateToGeneratedLesson(lessonId) {
    if (!lessonId) return;
    lastNonImmersivePanelRef.current = activePanel;
    await loadLessonDetail(lessonId, { autoEnterImmersive: true });
  }

  async function handleRenameLesson(lessonId, title) {
    return renameLesson(lessonId, title);
  }

  async function handleDeleteLesson(lessonId) {
    const result = await deleteLesson(lessonId, { keepImmersiveAfterFallback: immersiveActive });
    if (result.ok) {
      void deleteLessonMedia(lessonId).catch(() => {
        // Ignore local cache cleanup errors.
      });
      void deleteLessonSubtitleCache(lessonId).catch(() => {
        // Ignore local subtitle cache cleanup errors.
      });
      useAppStore.setState((state) => {
        const nextLessonMediaMetaMap = { ...state.lessonMediaMetaMap };
        delete nextLessonMediaMetaMap[lessonId];
        return { lessonMediaMetaMap: nextLessonMediaMetaMap };
      });
      toast.success("删除历史成功");
    }
    return result;
  }

  async function handleRegenerateSubtitles(lesson, semanticSplitEnabled) {
    const lessonId = Number(lesson?.id || 0);
    if (!lessonId || !accessToken) {
      return { ok: false, message: "请先登录" };
    }

    async function requestSubtitleVariantOnce(asrPayload) {
      const resp = await api(
        `/api/lessons/${lessonId}/subtitle-variants`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            asr_payload: asrPayload,
            semantic_split_enabled: Boolean(semanticSplitEnabled),
          }),
        },
        accessToken,
      );
      const data = await parseResponse(resp);
      if (!resp.ok) {
        const message = toErrorText(data, "重新生成字幕失败");
        const error = new Error(message);
        error.userMessage = message;
        throw error;
      }
      return data;
    }

    async function requestSubtitleVariantStream(asrPayload) {
      const resp = await api(
        `/api/lessons/${lessonId}/subtitle-variants/stream`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            asr_payload: asrPayload,
            semantic_split_enabled: Boolean(semanticSplitEnabled),
          }),
        },
        accessToken,
      );
      if (!resp.ok || !resp.body) {
        const data = await parseResponse(resp);
        const message = toErrorText(data, "重新生成字幕失败");
        const error = new Error(message);
        error.userMessage = message;
        throw error;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let resultPayload = null;

      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const blocks = buffer.split("\n\n");
        buffer = done ? "" : blocks.pop() || "";
        for (const block of blocks) {
          const parsed = parseSseEventBlock(block);
          if (!parsed) continue;
          if (parsed.event === "progress") {
            setSubtitleRegenerateState(buildSubtitleRegenerateState(lessonId, parsed.data, "streaming"));
            continue;
          }
          if (parsed.event === "error") {
            const message = toErrorText(parsed.data || {}, "重新生成字幕失败");
            const error = new Error(message);
            error.userMessage = message;
            throw error;
          }
          if (parsed.event === "result") {
            resultPayload = parsed.data;
          }
        }
        if (done) break;
      }

      if (!resultPayload) {
        const error = new Error("流式结果为空，自动改走普通请求");
        error.userMessage = error.message;
        throw error;
      }
      return resultPayload;
    }

    try {
      const cachedVariant = await getCachedLessonSubtitleVariant(lessonId, semanticSplitEnabled);
      let activeVariant = cachedVariant;
      if (cachedVariant) {
        await setActiveLessonSubtitleVariant(lessonId, semanticSplitEnabled);
      } else {
        const subtitleCacheMeta = await getLessonSubtitleAvailability(lessonId);
        if (!subtitleCacheMeta?.hasSource) {
          return { ok: false, message: "当前浏览器缺少原始 ASR 缓存，仅改造后新上传课程支持重新生成字幕" };
        }
        const rawCache = await getLessonSubtitleCache(lessonId);
        const asrPayload = rawCache?.asr_payload || lesson?.subtitle_cache_seed?.asr_payload || null;
        if (!asrPayload || typeof asrPayload !== "object") {
          return { ok: false, message: "当前浏览器缺少原始 ASR 缓存，仅改造后新上传课程支持重新生成字幕" };
        }
        let data = null;
        try {
          data = await requestSubtitleVariantStream(asrPayload);
        } catch (_) {
          setSubtitleRegenerateState(
            buildSubtitleRegenerateState(
              lessonId,
              {
                stage: "fallback",
                message: "流式反馈中断，正在切回普通请求",
                translate_done: 0,
                translate_total: 0,
                semantic_split_enabled: Boolean(semanticSplitEnabled),
              },
              "fallback",
            ),
          );
          data = await requestSubtitleVariantOnce(asrPayload);
        }
        activeVariant = await saveLessonSubtitleVariant(lessonId, data);
      }

      if (!activeVariant) {
        return { ok: false, message: "未找到可切换的字幕版本" };
      }

      useAppStore.setState((state) => ({
        currentLesson: state.currentLesson?.id === lessonId ? mergeLessonWithSubtitleVariant(state.currentLesson, activeVariant) : state.currentLesson,
        lessonCardMetaMap: {
          ...state.lessonCardMetaMap,
          [lessonId]: {
            ...(state.lessonCardMetaMap[lessonId] || {}),
            sentenceCount: Array.isArray(activeVariant.sentences)
              ? activeVariant.sentences.length
              : Number(state.lessonCardMetaMap[lessonId]?.sentenceCount || 0),
          },
        },
      }));
      await refreshSubtitleCacheMeta([{ id: lessonId }], { merge: true });
      setGlobalStatus("");
      const message = semanticSplitEnabled ? "已切换为语义分句" : "已切换为原始字幕";
      toast.success(message);
      return { ok: true, message };
    } catch (error) {
      const message = error?.userMessage || `网络错误: ${String(error)}`;
      setGlobalStatus(message);
      return { ok: false, message };
    } finally {
      setSubtitleRegenerateState(null);
    }
  }

  async function handleRestoreLessonMedia(lesson, file) {
    if (!lesson?.id || !file) {
      return { ok: false, message: "恢复视频参数无效" };
    }
    try {
      const expectedSourceDurationSec = Math.max(0, Number(lesson.source_duration_ms || 0) / 1000);
      if (expectedSourceDurationSec > 0) {
        const localDurationSec = await readMediaDurationSeconds(file, file.name || lesson.source_filename || "");
        const delta = Math.abs(localDurationSec - expectedSourceDurationSec);
        if (delta > 0.5) {
          const message = `恢复失败：文件时长差 ${delta.toFixed(3)} 秒，超过 0.5 秒阈值（本地 ${localDurationSec.toFixed(
            3,
          )} 秒，课程 ${expectedSourceDurationSec.toFixed(3)} 秒）。`;
          return { ok: false, message };
        }
      }

      await requestPersistentStorage();
      await saveLessonMedia(lesson.id, file);
      const mediaPreview = await getLessonMediaPreview(lesson.id);
      mergeLessonMediaMeta({ [lesson.id]: mediaPreview });
      if (currentLesson?.id === lesson.id) {
        setCurrentLessonNeedsBinding(false);
      }
      bumpMediaRestoreTick();
      return { ok: true, message: "恢复视频成功" };
    } catch (error) {
      const message = `恢复失败：${String(error)}`;
      return { ok: false, message };
    }
  }

  async function handleLoadMoreLessons() {
    if (loadingMoreLessons || !hasMoreLessons) return;
    await loadCatalog({
      page: lessonsPage + 1,
      query: lessonsQuery,
      append: true,
    });
  }

  return (
    <SidebarProvider storageKey={SIDEBAR_STORAGE_KEY}>
      <div className="section-soft min-h-screen bg-background md:flex">
        {!immersiveLayoutActive ? (
          <Sidebar className="bg-background/95">
            <LearningShellSidebar
              activePanel={activePanel}
              onPanelSelect={handlePanelChange}
              accessToken={accessToken}
              walletBalance={walletBalance}
              hasLessons={lessons.length > 0}
              onOpenSearch={() => setCommandOpen(true)}
              onLogout={handleLogout}
              hasStoredToken={hasStoredToken}
              authStatus={authStatus}
              authStatusMessage={authStatusMessage}
              isAdminUser={isAdminUser}
              onAdminNavigate={() => navigate("/admin/monitoring?tab=health&panel=overview")}
            />
          </Sidebar>
        ) : null}

        <SidebarInset>
          {!immersiveLayoutActive ? (
            <LearningShellHeader
              currentPanel={currentPanel}
              accessToken={accessToken}
              lessonsCount={lessons.length}
              walletBalance={walletBalance}
              mobileNavOpen={mobileNavOpen}
              setMobileNavOpen={setMobileNavOpen}
              activePanel={activePanel}
              onPanelSelect={handlePanelChange}
              onOpenSearch={() => setCommandOpen(true)}
              onLogout={handleLogout}
              hasStoredToken={hasStoredToken}
              authStatus={authStatus}
              authStatusMessage={authStatusMessage}
              isAdminUser={isAdminUser}
              onAdminNavigate={() => navigate("/admin/monitoring?tab=health&panel=overview")}
            />
          ) : null}

          <main className="container-wrapper py-4 md:py-6">
            <div className="container">
              <LearningShellPanelContent
                activePanel={activePanel}
                accessToken={accessToken}
                currentLesson={currentLesson}
                immersiveLayoutActive={immersiveLayoutActive}
                mediaRestoreTick={mediaRestoreTick}
                globalStatus={globalStatus}
                onAuthed={handleAuthed}
                onProgressSynced={refreshCurrentLesson}
                onExitImmersive={handleExitImmersive}
                onStartImmersive={handleStartImmersive}
                lessons={lessons}
                currentLessonNeedsBinding={currentLessonNeedsBinding}
                lessonCardMetaMap={lessonCardMetaMap}
                lessonMediaMetaMap={lessonMediaMetaMap}
                subtitleCacheMetaMap={subtitleCacheMetaMap}
                subtitleRegenerateState={subtitleRegenerateState}
                loadingLessons={loadingLessons}
                hasMoreLessons={hasMoreLessons}
                loadingMoreLessons={loadingMoreLessons}
                onLoadMoreLessons={handleLoadMoreLessons}
                onSelectLesson={(lessonId) => loadLessonDetail(lessonId, { autoEnterImmersive: false })}
                onStartLesson={handleStartLesson}
                onRenameLesson={handleRenameLesson}
                onDeleteLesson={handleDeleteLesson}
                onRestoreLessonMedia={handleRestoreLessonMedia}
                onRegenerateSubtitles={handleRegenerateSubtitles}
                onSwitchToUpload={() => handlePanelChange("upload")}
                walletBalance={walletBalance}
                billingRates={billingRates}
                subtitleSettings={subtitleSettings}
                onCreatedLesson={handleLessonCreated}
                onWalletChanged={loadWallet}
                onTaskStateChange={setUploadTaskState}
                onNavigateToGeneratedLesson={handleNavigateToGeneratedLesson}
                apiCall={(path, options = {}) => api(path, options, accessToken)}
              />
            </div>
          </main>

          <UploadTaskFloatingCard
            activePanel={activePanel}
            accessToken={accessToken}
            uploadTaskState={uploadTaskState}
            onOpenUpload={() => handlePanelChange("upload")}
          />

          <CommandDialog
            open={commandOpen}
            onOpenChange={(open) => {
              setCommandOpen(open);
              if (!open) {
                setCommandQuery("");
                if (lessonsQuery) {
                  void loadCatalog({ page: 1, query: "" });
                }
              }
            }}
          >
            <CommandInput placeholder="搜索课程名或模型..." value={commandQuery} onValueChange={setCommandQuery} />
            <CommandList>
              <CommandEmpty>没有找到匹配的课程</CommandEmpty>
              <CommandGroup heading="课程">
                {filteredLessons.map((lesson) => (
                  <CommandItem key={lesson.id} value={`${lesson.title || ""} ${lesson.asr_model || ""} ${lesson.id}`} onSelect={() => void handleCommandSelect(lesson.id)}>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{lesson.title || `课程 ${lesson.id}`}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {lesson.asr_model || "未记录模型"} · {lesson.source_filename || "未知文件"}
                      </p>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </CommandDialog>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
