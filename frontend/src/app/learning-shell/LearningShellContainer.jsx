import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { AdminApp } from "../../AdminApp";
import { api, parseResponse, toErrorText } from "../../shared/api/client";
import { getLessonMediaPreview, readMediaDurationSeconds, requestPersistentStorage, saveLessonMedia } from "../../shared/media/localMediaStore";
import { getCachedLessonSubtitleVariant, getLessonSubtitleAvailability, getLessonSubtitleCache, saveLessonSubtitleCacheSeed, saveLessonSubtitleVariant, setActiveLessonSubtitleVariant } from "../../shared/media/localSubtitleStore.js";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Sidebar,
  SidebarInset,
  SidebarProvider,
  Skeleton,
} from "../../shared/ui";
import { resolveAdminNavItem } from "../../shared/lib/adminSearchParams";
import { useAppStore } from "../../store";
import { GettingStartedGuideOverlay } from "../../features/getting-started/GettingStartedGuideOverlay";
import { markGettingStartedCompleted, markGettingStartedHomeVisited, readGettingStartedProgress } from "../../features/getting-started/gettingStartedStorage";
import { getDefaultMediaPreview } from "../../store/slices/mediaSlice";
import { LearningShellHeader } from "./LearningShellHeader";
import { LearningShellPanelContent } from "./LearningShellPanelContent";
import { PANEL_ITEMS, SIDEBAR_STORAGE_KEY, LearningShellSidebar, getPanelItemByPathname, getPanelPath } from "./LearningShellSidebar";
import { UploadTaskFloatingCard } from "./UploadTaskFloatingCard";
import { useCurrentLessonMediaBinding } from "./hooks/useCurrentLessonMediaBinding";
import { useLearningShellBootstrap } from "./hooks/useLearningShellBootstrap";
import { useLearningShellPrefetch } from "./hooks/useLearningShellPrefetch";

async function requestOriginalSubtitleVariant(accessToken, lessonId, asrPayload) {
  const resp = await api(
    `/api/lessons/${lessonId}/subtitle-variants`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        asr_payload: asrPayload,
        semantic_split_enabled: false,
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

function mergeLessonWithSubtitleVariant(lesson, variant) {
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

function applyLessonSubtitleVariantToStore(lessonId, activeVariant) {
  useAppStore.setState((state) => ({
    currentLesson: state.currentLesson?.id === lessonId ? mergeLessonWithSubtitleVariant(state.currentLesson, activeVariant) : state.currentLesson,
    lessonCardMetaMap: {
      ...state.lessonCardMetaMap,
      [lessonId]: {
        ...(state.lessonCardMetaMap[lessonId] || {}),
        sentenceCount: Array.isArray(activeVariant?.sentences)
          ? activeVariant.sentences.length
          : Number(state.lessonCardMetaMap[lessonId]?.sentenceCount || 0),
      },
    },
  }));
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

const MOBILE_MEDIA_QUERY = "(max-width: 767px)";
const GETTING_STARTED_GUIDE_STEPS = [
  {
    id: "open-upload",
    targetId: "sidebar-upload",
    instruction: "请点左侧“上传素材”",
    advanceOnTargetClick: true,
  },
  {
    id: "pick-file",
    targetId: "upload-select-file",
    instruction: "请点“选择文件”并选中素材",
    advanceOnTargetClick: false,
  },
  {
    id: "submit-upload",
    targetId: "upload-submit",
    instruction: "请点“开始生成课程”",
    advanceOnTargetClick: false,
  },
  {
    id: "open-history",
    targetId: "sidebar-history",
    instruction: "请点左侧“历史记录”",
    advanceOnTargetClick: true,
  },
  {
    id: "start-lesson",
    targetId: "history-start-latest",
    instruction: "请点最新课程上的“开始学习”",
    advanceOnTargetClick: true,
  },
];

export function LearningShellContainer() {
  const location = useLocation();
  const navigate = useNavigate();

  const accessToken = useAppStore((state) => state.accessToken);
  const hasStoredToken = useAppStore((state) => state.hasStoredToken);
  const authStatus = useAppStore((state) => state.authStatus);
  const authStatusMessage = useAppStore((state) => state.authStatusMessage);
  const currentUser = useAppStore((state) => state.currentUser);
  const hydrateAccessToken = useAppStore((state) => state.hydrateAccessToken);
  const logout = useAppStore((state) => state.logout);
  const detectAdmin = useAppStore((state) => state.detectAdmin);
  const isAdminUser = useAppStore((state) => state.isAdminUser);
  const adminAuthState = useAppStore((state) => state.adminAuthState);

  const lessons = useAppStore((state) => state.lessons);
  const lessonsTotal = useAppStore((state) => state.lessonsTotal);
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
  const deleteLessonsBulk = useAppStore((state) => state.deleteLessonsBulk);
  const refreshSubtitleCacheMeta = useAppStore((state) => state.refreshSubtitleCacheMeta);

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

  const [adminNavExpanded, setAdminNavExpanded] = useState(false);
  const isAdminRoute = location.pathname.startsWith("/admin");
  const activeAdminItem = useMemo(() => resolveAdminNavItem(location.pathname, location.search), [location.pathname, location.search]);
  const activePanel = isAdminRoute ? null : getPanelItemByPathname(location.pathname).key;
  const immersiveLayoutActive = Boolean(accessToken && currentLesson?.id && immersiveActive);
  const lastNonImmersivePanelRef = useRef(getPanelItemByPathname(location.pathname).key);
  const currentUserId = Number(currentUser?.id || 0);
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(MOBILE_MEDIA_QUERY).matches : false,
  );
  const [gettingStartedProgress, setGettingStartedProgress] = useState(() => readGettingStartedProgress(currentUserId));
  const [showGettingStartedWelcome, setShowGettingStartedWelcome] = useState(false);
  const [gettingStartedGuideActive, setGettingStartedGuideActive] = useState(false);
  const [gettingStartedGuideStepIndex, setGettingStartedGuideStepIndex] = useState(0);
  const [latestGeneratedLessonId, setLatestGeneratedLessonId] = useState(0);
  const [wordbookRefreshToken, setWordbookRefreshToken] = useState(0);
  const originalSubtitleRecoveryRef = useRef(new Map());

  useLearningShellBootstrap({
    accessToken,
    loadCatalog,
    loadWallet,
    loadBillingRates,
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
      if (activePanel) {
        lastNonImmersivePanelRef.current = activePanel;
      }
    }
  }, [activeAdminItem.key, activePanel, immersiveLayoutActive, isAdminRoute, location.pathname]);

  useEffect(() => {
    if (!isAdminRoute) return;
    setAdminNavExpanded(true);
  }, [isAdminRoute]);

  useEffect(() => {
    if (!accessToken || !isAdminRoute || adminAuthState !== "idle") return;
    void detectAdmin();
  }, [accessToken, adminAuthState, detectAdmin, isAdminRoute]);

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

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const mediaQueryList = window.matchMedia(MOBILE_MEDIA_QUERY);
    const updateViewport = () => setIsMobileViewport(mediaQueryList.matches);
    updateViewport();
    if (typeof mediaQueryList.addEventListener === "function") {
      mediaQueryList.addEventListener("change", updateViewport);
      return () => mediaQueryList.removeEventListener("change", updateViewport);
    }
    mediaQueryList.addListener(updateViewport);
    return () => mediaQueryList.removeListener(updateViewport);
  }, []);

  useEffect(() => {
    setGettingStartedProgress(readGettingStartedProgress(currentUserId));
    setShowGettingStartedWelcome(false);
  }, [currentUserId]);

  useEffect(() => {
    if (!accessToken || !currentUserId || isAdminRoute || immersiveLayoutActive) return;
    if (gettingStartedProgress.homeVisited) return;
    const nextProgress = markGettingStartedHomeVisited(currentUserId);
    setGettingStartedProgress(nextProgress);
    setShowGettingStartedWelcome(true);
    navigate(getPanelPath("getting-started"));
  }, [accessToken, currentUserId, gettingStartedProgress.homeVisited, immersiveLayoutActive, isAdminRoute, navigate]);

  useEffect(() => {
    if (!gettingStartedGuideActive) return;
    if (!accessToken || !currentUserId || isMobileViewport || isAdminRoute || immersiveLayoutActive) {
      setGettingStartedGuideActive(false);
      setGettingStartedGuideStepIndex(0);
    }
  }, [accessToken, currentUserId, gettingStartedGuideActive, immersiveLayoutActive, isAdminRoute, isMobileViewport]);

  useEffect(() => {
    if (!gettingStartedGuideActive) return;
    const phase = String(uploadTaskState?.phase || "").toLowerCase();
    if (
      gettingStartedGuideStepIndex === 1 &&
      ["ready", "uploading", "processing", "success"].includes(phase)
    ) {
      setGettingStartedGuideStepIndex(2);
      return;
    }
    if (gettingStartedGuideStepIndex === 2 && phase === "success") {
      const nextLessonId = Number(uploadTaskState?.lessonId || latestGeneratedLessonId || 0);
      if (nextLessonId > 0) {
        setLatestGeneratedLessonId(nextLessonId);
      }
      setGettingStartedGuideStepIndex(3);
    }
  }, [gettingStartedGuideActive, gettingStartedGuideStepIndex, latestGeneratedLessonId, uploadTaskState?.lessonId, uploadTaskState?.phase]);

  const filteredLessons = useMemo(() => lessons, [lessons]);
  const currentPanel = isAdminRoute
    ? { title: activeAdminItem.label }
    : PANEL_ITEMS.find((item) => item.key === activePanel) || PANEL_ITEMS[0];
  const currentGettingStartedGuideStep = gettingStartedGuideActive ? GETTING_STARTED_GUIDE_STEPS[gettingStartedGuideStepIndex] || null : null;
  const gettingStartedGuideInstruction = useMemo(() => {
    if (!currentGettingStartedGuideStep) return "";
    if (currentGettingStartedGuideStep.id === "pick-file") {
      const phase = String(uploadTaskState?.phase || "").toLowerCase();
      if (phase === "ready") return "已选中文件，正在继续";
      if (phase === "probing") return "已选中文件，正在读取文件";
      return currentGettingStartedGuideStep.instruction;
    }
    if (currentGettingStartedGuideStep.id === "submit-upload") {
      const phase = String(uploadTaskState?.phase || "").toLowerCase();
      if (phase === "uploading" || phase === "processing") {
        return uploadTaskState?.headline || "等待生成完成…";
      }
      if (phase === "success") return "课程已生成，正在继续";
      if (phase === "error") return uploadTaskState?.statusText || "生成失败，请先看上传页";
      return currentGettingStartedGuideStep.instruction;
    }
    return currentGettingStartedGuideStep.instruction;
  }, [currentGettingStartedGuideStep, uploadTaskState?.headline, uploadTaskState?.phase, uploadTaskState?.statusText]);

  async function persistLessonSubtitleCacheSeed(lesson) {
    if (!lesson?.id || !lesson?.subtitle_cache_seed) return;
    try {
      await saveLessonSubtitleCacheSeed(lesson.id, lesson.subtitle_cache_seed);
      await refreshSubtitleCacheMeta([{ id: lesson.id }], { merge: true });
    } catch (_) {
      // Ignore local subtitle cache write failures.
    }
  }

  useEffect(() => {
    const lessonId = Number(currentLesson?.id || 0);
    if (!accessToken || lessonId <= 0) return;

    const recoveryState = originalSubtitleRecoveryRef.current.get(lessonId);
    if (recoveryState === "pending" || recoveryState === "done" || recoveryState === "missing") {
      return;
    }

    let canceled = false;
    originalSubtitleRecoveryRef.current.set(lessonId, "pending");

    async function ensureOriginalAsrLesson() {
      try {
        if (currentLesson?.subtitle_cache_seed) {
          await persistLessonSubtitleCacheSeed(currentLesson);
        }

        let activeVariant = await getCachedLessonSubtitleVariant(lessonId, false);
        if (activeVariant) {
          await setActiveLessonSubtitleVariant(lessonId, false);
        } else {
          const subtitleCacheMeta = await getLessonSubtitleAvailability(lessonId);
          if (!subtitleCacheMeta?.hasSource) {
            originalSubtitleRecoveryRef.current.set(lessonId, "missing");
            return;
          }
          const rawCache = await getLessonSubtitleCache(lessonId);
          const asrPayload = rawCache?.asr_payload || currentLesson?.subtitle_cache_seed?.asr_payload || null;
          if (!asrPayload || typeof asrPayload !== "object") {
            originalSubtitleRecoveryRef.current.set(lessonId, "missing");
            return;
          }
          const data = await requestOriginalSubtitleVariant(accessToken, lessonId, asrPayload);
          activeVariant = await saveLessonSubtitleVariant(lessonId, data);
        }

        if (!activeVariant) {
          originalSubtitleRecoveryRef.current.set(lessonId, "missing");
          return;
        }

        if (canceled) {
          originalSubtitleRecoveryRef.current.delete(lessonId);
          return;
        }
        applyLessonSubtitleVariantToStore(lessonId, activeVariant);
        await refreshSubtitleCacheMeta([{ id: lessonId }], { merge: true });
        originalSubtitleRecoveryRef.current.set(lessonId, "done");
      } catch (_) {
        originalSubtitleRecoveryRef.current.delete(lessonId);
      }
    }

    void ensureOriginalAsrLesson();
    return () => {
      canceled = true;
      if (originalSubtitleRecoveryRef.current.get(lessonId) === "pending") {
        originalSubtitleRecoveryRef.current.delete(lessonId);
      }
    };
  }, [accessToken, currentLesson, refreshSubtitleCacheMeta]);

  function handleAuthed() {
    hydrateAccessToken();
    setGlobalStatus("");
    setUploadTaskState(null);
  }

  function closeGettingStartedGuide() {
    setGettingStartedGuideActive(false);
    setGettingStartedGuideStepIndex(0);
  }

  function handleDismissGettingStartedWelcome() {
    setShowGettingStartedWelcome(false);
  }

  function handleGoToLogin() {
    navigate(getPanelPath("history"));
  }

  function handleGoToHistoryPanel() {
    navigate(getPanelPath("history"));
    setMobileNavOpen(false);
  }

  function handleStartGettingStartedGuide() {
    if (!accessToken || !currentUserId) {
      toast("请先登录后开始引导");
      navigate(getPanelPath("history"));
      return;
    }
    if (isMobileViewport) {
      toast("移动端本轮只保留图文教程，请在桌面端体验真实点选引导");
      return;
    }
    setShowGettingStartedWelcome(false);
    setLatestGeneratedLessonId(0);
    setUploadTaskState(null);
    navigate(getPanelPath("getting-started"));
    setGettingStartedGuideActive(true);
    setGettingStartedGuideStepIndex(0);
  }

  function handleGettingStartedGuideTargetAction(stepId) {
    if (stepId === "open-upload") {
      setGettingStartedGuideStepIndex(1);
      return;
    }
    if (stepId === "open-history") {
      setGettingStartedGuideStepIndex(4);
      return;
    }
    if (stepId === "start-lesson") {
      closeGettingStartedGuide();
      if (currentUserId > 0) {
        setGettingStartedProgress(markGettingStartedCompleted(currentUserId));
      }
      toast.success("新手引导已完成");
    }
  }

  function handleGettingStartedGuidePrevious() {
    setGettingStartedGuideStepIndex((currentIndex) => Math.max(0, currentIndex - 1));
  }

  function handlePanelChange(nextPanel) {
    if (immersiveLayoutActive) {
      setImmersiveActive(false);
    }
    navigate(getPanelPath(nextPanel));
    setMobileNavOpen(false);
  }

  function handleAdminToggle(nextExpanded) {
    setAdminNavExpanded((prev) => (typeof nextExpanded === "boolean" ? nextExpanded : !prev));
  }

  function handleAdminSelect(item) {
    setAdminNavExpanded(true);
    setMobileNavOpen(false);
    navigate(item.href);
  }

  function handleLogout() {
    closeGettingStartedGuide();
    setShowGettingStartedWelcome(false);
    logout();
    navigate("/");
  }

  function handleExitImmersive() {
    setImmersiveActive(false);
    navigate(getPanelPath(lastNonImmersivePanelRef.current));
  }

  function handleWordbookChanged() {
    setWordbookRefreshToken((current) => current + 1);
  }

  async function handleLessonCreated(payload) {
    const lesson = payload?.lesson || null;
    const lessonId = lesson?.id;
    if (!lessonId) return;
    setLatestGeneratedLessonId(Number(lessonId));

    const mediaPersisted = Boolean(payload?.mediaPersisted);
    const needsBinding = lesson.media_storage === "client_indexeddb" && !mediaPersisted;
    const mediaPreview = buildCreatedLessonMediaPreview(lesson, payload?.mediaPreview, mediaPersisted);

    lastNonImmersivePanelRef.current = "history";
    setImmersiveActive(false);
    navigate(getPanelPath("history"));
    mergeLessonMediaMeta({ [lessonId]: mediaPreview });
    await persistLessonSubtitleCacheSeed(lesson);
    await loadCatalog({ page: 1, query: "", preferredLessonId: lessonId, autoEnterImmersive: false });
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
    lastNonImmersivePanelRef.current = "history";
    setImmersiveActive(false);
    navigate(getPanelPath("history"));
    await loadLessonDetail(lessonId, { autoEnterImmersive: false });
  }

  async function handleRenameLesson(lessonId, title) {
    return renameLesson(lessonId, title);
  }

  async function handleDeleteLesson(lessonId) {
    const result = await deleteLesson(lessonId);
    if (result.ok) {
      toast.success("删除历史成功");
    }
    return result;
  }

  async function handleBulkDeleteLessons(payload = {}) {
    const result = await deleteLessonsBulk(payload);
    if (result.ok) {
      toast.success(result.message || `已删除 ${Number(result.deletedCount || 0)} 条历史记录`);
    }
    return result;
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

  function renderAdminContent() {
    if (!accessToken) {
      const expired = authStatus === "expired";
      return (
        <Card>
          <CardHeader>
            <CardTitle>{expired ? "登录已失效" : "未登录"}</CardTitle>
            <CardDescription>{expired ? authStatusMessage || "请返回学习页重新登录后再访问管理台。" : "请先登录后再访问管理台。"}</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Button onClick={() => navigate("/")}>返回学习页登录</Button>
            {hasStoredToken ? (
              <Button variant="outline" onClick={handleLogout}>
                退出登录
              </Button>
            ) : null}
          </CardContent>
        </Card>
      );
    }

    if (adminAuthState === "idle" || adminAuthState === "checking") {
      return (
        <Card>
          <CardContent className="space-y-3 p-6">
            <p className="text-sm text-muted-foreground">正在验证管理员权限...</p>
            <Skeleton className="h-4 w-52" />
          </CardContent>
        </Card>
      );
    }

    if (!isAdminUser) {
      return (
        <Card>
          <CardHeader>
            <CardTitle>权限不足</CardTitle>
            <CardDescription>需要管理员权限</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/")}>
              返回学习页
            </Button>
            <Button onClick={handleLogout}>退出登录</Button>
          </CardContent>
        </Card>
      );
    }

    return <AdminApp apiCall={(path, options = {}) => api(path, options, accessToken)} onLogout={handleLogout} />;
  }

  return (
    <SidebarProvider storageKey={SIDEBAR_STORAGE_KEY}>
      <div className="section-soft min-h-screen overflow-x-clip bg-background md:flex">
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
              isAdminRoute={isAdminRoute}
              activeAdminKey={activeAdminItem.key}
              adminNavExpanded={adminNavExpanded}
              onAdminToggle={handleAdminToggle}
              onAdminSelect={handleAdminSelect}
            />
          </Sidebar>
        ) : null}

        <SidebarInset className="min-w-0">
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
              isAdminRoute={isAdminRoute}
              activeAdminKey={activeAdminItem.key}
              adminNavExpanded={adminNavExpanded}
              onAdminToggle={handleAdminToggle}
              onAdminSelect={handleAdminSelect}
            />
          ) : null}

          <main className="container-wrapper min-w-0 py-3 md:py-6">
            <div className="container">
              {isAdminRoute ? (
                renderAdminContent()
              ) : (
                <LearningShellPanelContent
                  activePanel={activePanel}
                  accessToken={accessToken}
                  currentLesson={currentLesson}
                  currentUser={currentUser}
                  immersiveLayoutActive={immersiveLayoutActive}
                  mediaRestoreTick={mediaRestoreTick}
                  globalStatus={globalStatus}
                  onAuthed={handleAuthed}
                  onProgressSynced={refreshCurrentLesson}
                  onExitImmersive={handleExitImmersive}
                  onStartImmersive={handleStartImmersive}
                  lessons={lessons}
                  totalLessons={lessonsTotal}
                  currentLessonNeedsBinding={currentLessonNeedsBinding}
                  lessonCardMetaMap={lessonCardMetaMap}
                  lessonMediaMetaMap={lessonMediaMetaMap}
                  loadingLessons={loadingLessons}
                  hasMoreLessons={hasMoreLessons}
                  loadingMoreLessons={loadingMoreLessons}
                  onLoadMoreLessons={handleLoadMoreLessons}
                  onStartLesson={handleStartLesson}
                  onRenameLesson={handleRenameLesson}
                  onDeleteLesson={handleDeleteLesson}
                  onBulkDeleteLessons={handleBulkDeleteLessons}
                  onRestoreLessonMedia={handleRestoreLessonMedia}
                  onSwitchToUpload={() => handlePanelChange("upload")}
                  walletBalance={walletBalance}
                  billingRates={billingRates}
                  subtitleSettings={subtitleSettings}
                  onCreatedLesson={handleLessonCreated}
                  onWalletChanged={loadWallet}
                  onTaskStateChange={setUploadTaskState}
                  onNavigateToGeneratedLesson={handleNavigateToGeneratedLesson}
                  apiCall={(path, options = {}) => api(path, options, accessToken)}
                  isMobileViewport={isMobileViewport}
                  gettingStartedProgress={gettingStartedProgress}
                  showGettingStartedWelcome={showGettingStartedWelcome}
                  onDismissGettingStartedWelcome={handleDismissGettingStartedWelcome}
                  onStartGettingStartedGuide={handleStartGettingStartedGuide}
                  onGoToLogin={handleGoToLogin}
                  onGoToHistory={handleGoToHistoryPanel}
                  guideTargetLessonId={latestGeneratedLessonId}
                  wordbookRefreshToken={wordbookRefreshToken}
                  onWordbookChanged={handleWordbookChanged}
                />
              )}
            </div>
          </main>

          {!isAdminRoute ? (
            <UploadTaskFloatingCard
              activePanel={activePanel}
              accessToken={accessToken}
              uploadTaskState={uploadTaskState}
              onOpenUpload={() => handlePanelChange("upload")}
            />
          ) : null}

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

          {!isAdminRoute ? (
            <GettingStartedGuideOverlay
              active={gettingStartedGuideActive}
              step={currentGettingStartedGuideStep}
              stepIndex={gettingStartedGuideStepIndex}
              instructionText={gettingStartedGuideInstruction}
              onPrevious={handleGettingStartedGuidePrevious}
              onExit={closeGettingStartedGuide}
              onTargetAction={handleGettingStartedGuideTargetAction}
            />
          ) : null}
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
