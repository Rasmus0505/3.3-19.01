import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { api } from "../../../shared/api/client";
import {
  getLessonMediaPreview,
  readMediaDurationSeconds,
  requestPersistentStorage,
  saveLessonMedia,
} from "../../../shared/media/localMediaStore";
import {
  saveLessonSubtitleCacheSeed,
} from "../../../shared/media/localSubtitleStore.js";
import { resolveAdminNavItem } from "../../../shared/lib/adminSearchParams";
import { useAppStore } from "../../../store";
import { getDefaultMediaPreview } from "../../../store/slices/mediaSlice";
import { getShortcutCompleteness, readLearningSettings } from "../../../features/immersive/learningSettings";
import { PANEL_ITEMS } from "../LearningShellSidebar";
import { getPanelItemByPathname, getPanelPath } from "../panelRoutes";

const MOBILE_MEDIA_QUERY = "(max-width: 767px)";

function buildCreatedLessonMediaPreview(lesson, mediaPreview, mediaPersisted) {
  const rawLessonId = lesson?.id ?? mediaPreview?.lessonId ?? null;
  const lessonId =
    typeof rawLessonId === "number" ? rawLessonId : String(rawLessonId ?? "").trim() || 0;
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

export function useLearningShellController({
  accessToken,
  hasStoredToken,
  authStatus,
  authStatusMessage,
  currentLesson,
  currentUser,
  lessons,
  lessonsTotal,
  lessonsPage,
  lessonsQuery,
  hasMoreLessons,
  loadingLessons,
  loadingMoreLessons,
  walletBalance,
  billingRates,
  subtitleSettings,
  lessonCardMetaMap,
  lessonMediaMetaMap,
  currentLessonNeedsBinding,
  mediaRestoreTick,
  globalStatus,
  commandOpen,
  commandQuery,
  immersiveActive,
  loadCatalog,
  loadLessonDetail,
  loadWallet,
  refreshCurrentLesson,
  renameLesson,
  deleteLesson,
  deleteLessonsBulk,
  refreshSubtitleCacheMeta,
  mergeLessonMediaMeta,
  setCurrentLessonNeedsBinding,
  bumpMediaRestoreTick,
  setGlobalStatus,
  setCommandOpen,
  setCommandQuery,
  setMobileNavOpen,
  setImmersiveActive,
  setUploadTaskState,
  hydrateAccessToken,
  logout,
  detectAdmin,
  isAdminUser,
  adminAuthState,
  desktopSync,
}) {
  const location = useLocation();
  const navigate = useNavigate();

  const [adminNavExpanded, setAdminNavExpanded] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(MOBILE_MEDIA_QUERY).matches : false,
  );
  const [latestGeneratedLessonId, setLatestGeneratedLessonId] = useState(0);
  const [wordbookRefreshToken, setWordbookRefreshToken] = useState(0);
  const [announcements, setAnnouncements] = useState([]);
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false);

  const isAdminRoute = location.pathname.startsWith("/admin");
  const activeAdminItem = useMemo(
    () => resolveAdminNavItem(location.pathname, location.search),
    [location.pathname, location.search],
  );
  const activePanel = isAdminRoute ? null : getPanelItemByPathname(location.pathname).key;
  const immersiveLayoutActive = Boolean(accessToken && currentLesson?.id && immersiveActive);
  const lastNonImmersivePanelRef = useRef(getPanelItemByPathname(location.pathname).key);

  useEffect(() => {
    if (desktopSync.conflicts.length > 0 && !conflictDialogOpen) {
      setConflictDialogOpen(true);
    }
  }, [desktopSync.conflicts.length, conflictDialogOpen]);

  useEffect(() => {
    if (!immersiveLayoutActive && activePanel) {
      lastNonImmersivePanelRef.current = activePanel;
    }
  }, [activePanel, immersiveLayoutActive]);

  useEffect(() => {
    if (!isAdminRoute) return;
    setAdminNavExpanded(true);
  }, [isAdminRoute]);

  useEffect(() => {
    if (!accessToken || !isAdminRoute || adminAuthState !== "idle") return;
    void detectAdmin();
  }, [accessToken, adminAuthState, detectAdmin, isAdminRoute]);

  useEffect(() => {
    if (!accessToken) {
      setAnnouncements([]);
      return;
    }
    let canceled = false;
    async function loadAnnouncements() {
      try {
        const resp = await api("/api/announcements/active", {}, accessToken);
        if (canceled) return;
        if (resp.ok) {
          const data = await resp.json();
          if (!canceled) {
            setAnnouncements(Array.isArray(data) ? data : []);
          }
        }
      } catch (_) {
        // Ignore announcement fetch errors.
      }
    }
    void loadAnnouncements();
    return () => {
      canceled = true;
    };
  }, [accessToken]);

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

  async function persistLessonSubtitleCacheSeed(lesson) {
    if (!lesson?.id || !lesson?.subtitle_cache_seed) return;
    try {
      await saveLessonSubtitleCacheSeed(lesson.id, lesson.subtitle_cache_seed);
      await refreshSubtitleCacheMeta([{ id: lesson.id }], { merge: true });
    } catch (_) {
      // Ignore local subtitle cache write failures.
    }
  }

  const filteredLessons = useMemo(() => lessons, [lessons]);
  const currentPanel = isAdminRoute
    ? { title: activeAdminItem.label }
    : PANEL_ITEMS.find((item) => item.key === activePanel) || PANEL_ITEMS[0];

  function handleAuthed() {
    hydrateAccessToken();
    setGlobalStatus("");
    setUploadTaskState(null);
  }

  function handleGoToLogin() {
    navigate(getPanelPath("history"));
  }

  function handleGoToHistoryPanel() {
    navigate(getPanelPath("history"));
    setMobileNavOpen(false);
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

  function handleStartLesson(lessonId) {
    if (!lessonId) return;
    const { complete, missingActions } = getShortcutCompleteness(readLearningSettings());
    if (!complete) {
      const names = missingActions.map((a) => a.label).join("、");
      setGlobalStatus(`快捷键未配置完整：${names}。请先在下方「学习参数」区域配置好所有快捷键，再开始学习。`);
      return;
    }
    lastNonImmersivePanelRef.current = activePanel;
    navigate(`/immersive/${lessonId}`);
  }

  async function handleNavigateToGeneratedLesson(lessonId) {
    if (!lessonId) return;
    const { complete, missingActions } = getShortcutCompleteness(readLearningSettings());
    if (!complete) {
      const names = missingActions.map((a) => a.label).join("、");
      setGlobalStatus(`快捷键未配置完整：${names}。请先在下方「学习参数」区域配置好所有快捷键，再开始学习。`);
      return;
    }
    lastNonImmersivePanelRef.current = "history";
    navigate(getPanelPath("history"));
    await loadLessonDetail(lessonId, { autoEnterImmersive: true });
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
          return {
            ok: false,
            message: `恢复失败：文件时长差 ${delta.toFixed(3)} 秒，超过 0.5 秒阈值（本地 ${localDurationSec.toFixed(3)} 秒，课程 ${expectedSourceDurationSec.toFixed(3)} 秒）。`,
          };
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
      return { ok: false, message: `恢复失败：${String(error)}` };
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

  return {
    announcements,
    conflictDialogOpen,
    setConflictDialogOpen,
    currentPanel,
    filteredLessons,
    activeAdminItem,
    activePanel,
    adminNavExpanded,
    immersiveLayoutActive,
    isAdminRoute,
    isMobileViewport,
    latestGeneratedLessonId,
    wordbookRefreshToken,
    handleAdminSelect,
    handleAdminToggle,
    handleAuthed,
    handleBulkDeleteLessons,
    handleCommandSelect,
    handleDeleteLesson,
    handleExitImmersive,
    handleGoToHistoryPanel,
    handleGoToLogin,
    handleLessonCreated,
    handleLoadMoreLessons,
    handleLogout,
    handleNavigateToGeneratedLesson,
    handlePanelChange,
    handleRenameLesson,
    handleRestoreLessonMedia,
    handleStartImmersive,
    handleStartLesson,
    handleWordbookChanged,
    loadingLessons,
    loadingMoreLessons,
    walletBalance,
    billingRates,
    subtitleSettings,
    lessonCardMetaMap,
    lessonMediaMetaMap,
    currentLessonNeedsBinding,
    mediaRestoreTick,
    globalStatus,
    hasMoreLessons,
    lessons,
    lessonsTotal,
    accessToken,
    currentLesson,
    currentUser,
    hasStoredToken,
    authStatus,
    authStatusMessage,
    isAdminUser,
    adminAuthState,
  };
}


