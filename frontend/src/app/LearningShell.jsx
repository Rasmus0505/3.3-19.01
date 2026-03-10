import { Gift, History, LogOut, Menu, Search, Shield, Sparkles, UploadCloud } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { AuthPanel } from "../features/auth/AuthPanel";
import { ImmersiveLessonPage } from "../features/immersive/ImmersiveLessonPage";
import { LessonList } from "../features/lessons/LessonList";
import { UploadPanel } from "../features/upload/UploadPanel";
import { RedeemCodePanel } from "../features/wallet/RedeemCodePanel";
import { WalletBadge } from "../features/wallet/WalletBadge";
import { cn } from "../lib/utils";
import { api, parseResponse, toErrorText } from "../shared/api/client";
import {
  deleteLessonMedia,
  getLessonMediaPreview,
  hasLessonMedia,
  readMediaDurationSeconds,
  requestPersistentStorage,
  saveLessonMedia,
} from "../shared/media/localMediaStore";
import {
  deleteLessonSubtitleCache,
  getActiveLessonSubtitleVariant,
  getCachedLessonSubtitleVariant,
  getLessonSubtitleCache,
  getLessonSubtitleAvailability,
  saveLessonSubtitleCacheSeed,
  saveLessonSubtitleVariant,
  setActiveLessonSubtitleVariant,
} from "../shared/media/localSubtitleStore";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "../shared/ui";
import { clearAuthStorage, REFRESH_KEY, TOKEN_KEY } from "./authStorage";

const PANEL_ITEMS = [
  {
    key: "history",
    title: "历史记录",
    description: "查看课程、继续学习与管理历史素材。",
    icon: History,
    path: "/",
  },
  {
    key: "upload",
    title: "上传素材",
    description: "导入音视频并查看实时生成进度。",
    icon: UploadCloud,
    path: "/upload",
  },
  {
    key: "redeem",
    title: "兑换码充值",
    description: "输入兑换码，给当前账号补充点数。",
    icon: Gift,
    path: "/redeem",
  },
];

const SIDEBAR_STORAGE_KEY = "app-shell-sidebar-open";

function getPanelItemByPathname(pathname) {
  return PANEL_ITEMS.find((item) => item.path === pathname) || PANEL_ITEMS[0];
}

function getPanelPath(panelKey) {
  return PANEL_ITEMS.find((item) => item.key === panelKey)?.path || "/";
}

function LearningSidebarNavigation({
  activePanel,
  onPanelSelect,
  accessToken,
  hasLessons,
  onOpenSearch,
  onLogout,
  isAdminUser,
  onAdminNavigate,
  mobile = false,
}) {
  const { open } = useSidebar();
  const expanded = mobile || open;

  return (
    <>
      <SidebarHeader className="justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border bg-primary/10 text-primary">
            <Sparkles className="size-5" />
          </div>
          {expanded ? (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">English Trainer</p>
              <p className="truncate text-xs text-muted-foreground">学习、上传、充值统一入口</p>
            </div>
          ) : null}
        </div>
        {expanded ? <Badge variant="outline">{accessToken ? "已登录" : "未登录"}</Badge> : null}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          {expanded ? <SidebarGroupLabel>学习导航</SidebarGroupLabel> : null}
          <SidebarGroupContent>
            <SidebarMenu>
              {PANEL_ITEMS.map((item) => {
                const Icon = item.icon;
                const selected = activePanel === item.key;
                return (
                  <SidebarMenuItem key={item.key}>
                    <SidebarMenuButton active={selected} collapsed={!expanded} onClick={() => onPanelSelect(item.key)}>
                      <Icon className="size-5 shrink-0" />
                      {expanded ? (
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-foreground">{item.title}</span>
                          <span className="block truncate text-xs text-muted-foreground">{item.description}</span>
                        </span>
                      ) : null}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="space-y-2">
        {expanded ? <p className="text-xs text-muted-foreground">桌面端支持折叠记忆，手机端通过左侧抽屉切换面板。</p> : null}
        {mobile ? (
          <div className="grid gap-2">
            {hasLessons ? (
              <Button variant="outline" className="justify-start" onClick={onOpenSearch}>
                <Search className="size-4" />
                查找课程
              </Button>
            ) : null}
            {isAdminUser ? (
              <Button variant="outline" className="justify-start" onClick={onAdminNavigate}>
                <Shield className="size-4" />
                管理后台
              </Button>
            ) : null}
            {accessToken ? (
              <Button className="justify-start" onClick={onLogout}>
                <LogOut className="size-4" />
                退出登录
              </Button>
            ) : null}
          </div>
        ) : null}
      </SidebarFooter>
    </>
  );
}

function buildProgressSnapshot(progressData = {}) {
  return {
    current_sentence_index: Number(progressData.current_sentence_index || 0),
    completed_sentence_indexes: Array.isArray(progressData.completed_sentence_indexes)
      ? progressData.completed_sentence_indexes
      : [],
    last_played_at_ms: Number(progressData.last_played_at_ms || 0),
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

function getDefaultMediaPreview(lessonId) {
  return {
    lessonId,
    hasMedia: false,
    mediaType: "",
    coverDataUrl: "",
    aspectRatio: 0,
    fileName: "",
  };
}

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

export function LearningShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const [accessToken, setAccessToken] = useState(() => localStorage.getItem(TOKEN_KEY) || "");
  const [lessons, setLessons] = useState([]);
  const [currentLesson, setCurrentLesson] = useState(null);
  const [loadingLessons, setLoadingLessons] = useState(false);
  const [globalStatus, setGlobalStatus] = useState("");
  const [walletBalance, setWalletBalance] = useState(0);
  const [billingRates, setBillingRates] = useState([]);
  const [subtitleSettings, setSubtitleSettings] = useState({ semantic_split_default_enabled: false });
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [currentLessonNeedsBinding, setCurrentLessonNeedsBinding] = useState(false);
  const [immersiveActive, setImmersiveActive] = useState(false);
  const [mediaRestoreTick, setMediaRestoreTick] = useState(0);
  const [lessonCardMetaMap, setLessonCardMetaMap] = useState({});
  const [lessonMediaMetaMap, setLessonMediaMetaMap] = useState({});
  const [subtitleCacheMetaMap, setSubtitleCacheMetaMap] = useState({});
  const [subtitleRegenerateState, setSubtitleRegenerateState] = useState(null);
  const [uploadTaskState, setUploadTaskState] = useState(null);
  const lastNonImmersivePanelRef = useRef(getPanelItemByPathname(location.pathname).key);

  const activePanel = getPanelItemByPathname(location.pathname).key;

  const immersiveLayoutActive = Boolean(accessToken && currentLesson?.id && immersiveActive);

  const filteredLessons = useMemo(() => {
    const keyword = commandQuery.trim().toLowerCase();
    if (!keyword) return lessons;
    return lessons.filter((item) => `${item.title || ""} ${item.asr_model || ""}`.toLowerCase().includes(keyword));
  }, [commandQuery, lessons]);

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

  async function refreshSubtitleCacheMeta(lessonList, options = {}) {
    const sourceLessons = Array.isArray(lessonList) ? lessonList : lessons;
    if (!sourceLessons.length) {
      setSubtitleCacheMetaMap({});
      return;
    }
    const entries = await Promise.all(
      sourceLessons.map(async (lesson) => {
        try {
          const meta = await getLessonSubtitleAvailability(lesson.id);
          return [lesson.id, meta];
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
    if (options.merge) {
      setSubtitleCacheMetaMap((prev) => ({ ...prev, ...nextMap }));
      return;
    }
    setSubtitleCacheMetaMap(nextMap);
  }

  async function persistLessonSubtitleCacheSeed(lesson) {
    if (!lesson?.id || !lesson?.subtitle_cache_seed) return;
    try {
      await saveLessonSubtitleCacheSeed(lesson.id, lesson.subtitle_cache_seed);
      await refreshSubtitleCacheMeta([{ id: lesson.id }], { merge: true });
    } catch (_) {
      // Ignore local subtitle cache write failures.
    }
  }

  async function loadLessonDetail(lessonId, options = {}) {
    if (!lessonId || !accessToken) return;
    const { autoEnterImmersive = false, keepCurrentImmersiveState = false } = options;
    try {
      const [detailResp, progressResp] = await Promise.all([
        api(`/api/lessons/${lessonId}`, {}, accessToken),
        api(`/api/lessons/${lessonId}/progress`, {}, accessToken),
      ]);
      const detailData = await parseResponse(detailResp);
      const progressData = await parseResponse(progressResp);
      if (!detailResp.ok) {
        setGlobalStatus(toErrorText(detailData, "加载课程详情失败"));
        return;
      }

      const progress = progressResp.ok ? buildProgressSnapshot(progressData) : buildProgressSnapshot();
      const merged = {
        ...detailData,
        progress,
      };
      const mergedWithLocalVariant = await applyLocalSubtitleVariant(merged);

      setCurrentLesson(mergedWithLocalVariant);
      setLessonCardMetaMap((prev) => ({
        ...prev,
        [lessonId]: {
          sentenceCount: Array.isArray(mergedWithLocalVariant?.sentences)
            ? mergedWithLocalVariant.sentences.length
            : getSentenceCount(detailData, mergedWithLocalVariant),
          progress,
        },
      }));
      setImmersiveActive((prev) => (keepCurrentImmersiveState ? prev : Boolean(autoEnterImmersive)));
      setGlobalStatus("");
    } catch (error) {
      setGlobalStatus(`网络错误: ${String(error)}`);
    }
  }

  async function loadLessons(options = {}) {
    const { preferredLessonId = null, autoEnterImmersive = false } = options;
    if (!accessToken) {
      setLessons([]);
      setCurrentLesson(null);
      setCurrentLessonNeedsBinding(false);
      setImmersiveActive(false);
      setLessonCardMetaMap({});
      setLessonMediaMetaMap({});
      setSubtitleCacheMetaMap({});
      setSubtitleRegenerateState(null);
      return;
    }

    setLoadingLessons(true);
    try {
      const listResp = await api("/api/lessons", {}, accessToken);
      const listData = await parseResponse(listResp);
      if (!listResp.ok) {
        setGlobalStatus(toErrorText(listData, "加载课程失败"));
        return;
      }

      const nextLessons = Array.isArray(listData) ? listData : [];
      setLessons(nextLessons);
      await refreshSubtitleCacheMeta(nextLessons);
      setLessonCardMetaMap((prev) => {
        const next = {};
        nextLessons.forEach((lesson) => {
          next[lesson.id] = prev[lesson.id] || {
            sentenceCount: Array.isArray(lesson.sentences) ? lesson.sentences.length : 0,
            progress: null,
          };
        });
        return next;
      });
      setLessonMediaMetaMap((prev) => {
        const next = {};
        nextLessons.forEach((lesson) => {
          next[lesson.id] = prev[lesson.id] || getDefaultMediaPreview(lesson.id);
        });
        return next;
      });

      const currentExists = currentLesson?.id && nextLessons.some((item) => item.id === currentLesson.id);
      const targetLessonId = preferredLessonId || (!currentExists ? nextLessons[0]?.id : null);
      if (!nextLessons.length && !targetLessonId) {
        setCurrentLesson(null);
        setImmersiveActive(false);
        setGlobalStatus("");
        return;
      }

      if (targetLessonId) {
        await loadLessonDetail(targetLessonId, { autoEnterImmersive });
      }
      setGlobalStatus("");
    } catch (error) {
      setGlobalStatus(`网络错误: ${String(error)}`);
    } finally {
      setLoadingLessons(false);
    }
  }

  async function loadWallet() {
    if (!accessToken) {
      setWalletBalance(0);
      return;
    }
    try {
      const resp = await api("/api/wallet/me", {}, accessToken);
      const data = await parseResponse(resp);
      if (resp.ok) {
        setWalletBalance(Number(data.balance_points || 0));
      }
    } catch (_) {}
  }

  async function loadBillingRates() {
    if (!accessToken) {
      setBillingRates([]);
      setSubtitleSettings({ semantic_split_default_enabled: false });
      return;
    }
    try {
      const resp = await api("/api/billing/rates", {}, accessToken);
      const data = await parseResponse(resp);
      if (resp.ok) {
        setBillingRates(Array.isArray(data.rates) ? data.rates : []);
        setSubtitleSettings({
          semantic_split_default_enabled: Boolean(data.subtitle_settings?.semantic_split_default_enabled),
        });
      }
    } catch (_) {}
  }

  async function detectAdmin() {
    if (!accessToken) {
      setIsAdminUser(false);
      return;
    }
    try {
      const resp = await api("/api/admin/billing-rates", {}, accessToken);
      setIsAdminUser(resp.ok);
    } catch (_) {
      setIsAdminUser(false);
    }
  }

  useEffect(() => {
    void loadLessons();
    void loadWallet();
    void loadBillingRates();
    void detectAdmin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) {
      setLessonCardMetaMap({});
      setLessonMediaMetaMap({});
      setSubtitleCacheMetaMap({});
      return;
    }
    if (lessons.length === 0) {
      setLessonCardMetaMap({});
      setLessonMediaMetaMap({});
      setSubtitleCacheMetaMap({});
      return;
    }
    if (activePanel !== "history" || immersiveLayoutActive) {
      return;
    }

    let canceled = false;

    setLessonCardMetaMap((prev) => {
      const next = {};
      lessons.forEach((lesson) => {
        next[lesson.id] = prev[lesson.id] || {
          sentenceCount: Array.isArray(lesson.sentences) ? lesson.sentences.length : 0,
          progress: null,
        };
      });
      return next;
    });
    setLessonMediaMetaMap((prev) => {
      const next = {};
      lessons.forEach((lesson) => {
        next[lesson.id] = prev[lesson.id] || getDefaultMediaPreview(lesson.id);
      });
      return next;
    });

    void Promise.allSettled(
      lessons.map(async (lesson) => {
        const [detailResult, progressResult, mediaResult, subtitleVariantResult] = await Promise.allSettled([
          (async () => {
            const resp = await api(`/api/lessons/${lesson.id}`, {}, accessToken);
            const data = await parseResponse(resp);
            return { ok: resp.ok, data };
          })(),
          (async () => {
            const resp = await api(`/api/lessons/${lesson.id}/progress`, {}, accessToken);
            const data = await parseResponse(resp);
            return { ok: resp.ok, data };
          })(),
          getLessonMediaPreview(lesson.id),
          getActiveLessonSubtitleVariant(lesson.id),
        ]);

        if (detailResult.status === "rejected") {
          // Ignore detail prefetch failures; the card will fall back to existing summary data.
        }

        const activeSubtitleVariant = subtitleVariantResult.status === "fulfilled" ? subtitleVariantResult.value : null;
        const sentenceCount = Array.isArray(activeSubtitleVariant?.sentences)
          ? activeSubtitleVariant.sentences.length
          : detailResult.status === "fulfilled" && detailResult.value.ok
            ? getSentenceCount(detailResult.value.data, lesson)
            : Array.isArray(lesson.sentences)
              ? lesson.sentences.length
              : 0;

        return {
          lessonId: lesson.id,
          cardMeta: {
            sentenceCount,
            progress:
              progressResult.status === "fulfilled" && progressResult.value.ok
                ? buildProgressSnapshot(progressResult.value.data)
                : null,
          },
          mediaMeta: mediaResult.status === "fulfilled" ? mediaResult.value : getDefaultMediaPreview(lesson.id),
        };
      }),
    ).then((results) => {
      if (canceled) return;

      setLessonCardMetaMap((prev) => {
        const next = {};
        lessons.forEach((lesson) => {
          next[lesson.id] = prev[lesson.id] || {
            sentenceCount: Array.isArray(lesson.sentences) ? lesson.sentences.length : 0,
            progress: null,
          };
        });
        results.forEach((result) => {
          if (result.status === "fulfilled") {
            next[result.value.lessonId] = result.value.cardMeta;
          }
        });
        return next;
      });

      setLessonMediaMetaMap((prev) => {
        const next = {};
        lessons.forEach((lesson) => {
          next[lesson.id] = prev[lesson.id] || getDefaultMediaPreview(lesson.id);
        });
        results.forEach((result) => {
          if (result.status === "fulfilled") {
            next[result.value.lessonId] = result.value.mediaMeta;
          }
        });
        return next;
      });
    });

    return () => {
      canceled = true;
    };
  }, [accessToken, activePanel, immersiveLayoutActive, lessons]);

  useEffect(() => {
    let canceled = false;

    async function detectCurrentLessonMediaStatus() {
      if (!currentLesson?.id) {
        setCurrentLessonNeedsBinding(false);
        return;
      }
      if (currentLesson.media_storage !== "client_indexeddb") {
        setCurrentLessonNeedsBinding(false);
        return;
      }
      try {
        const bound = await hasLessonMedia(currentLesson.id);
        if (canceled) return;
        setCurrentLessonNeedsBinding(!bound);
      } catch (_) {
        if (canceled) return;
        setCurrentLessonNeedsBinding(true);
      }
    }

    void detectCurrentLessonMediaStatus();
    return () => {
      canceled = true;
    };
  }, [currentLesson?.id, currentLesson?.media_storage]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  function handleAuthed() {
    setAccessToken(localStorage.getItem(TOKEN_KEY) || "");
    setGlobalStatus("");
    setUploadTaskState(null);
  }

  function handlePanelChange(nextPanel) {
    navigate(getPanelPath(nextPanel));
    setMobileNavOpen(false);
  }

  function handleLogout() {
    clearAuthStorage();
    setAccessToken("");
    setLessons([]);
    setCurrentLesson(null);
    setGlobalStatus("");
    setWalletBalance(0);
    setIsAdminUser(false);
    setMobileNavOpen(false);
    setCommandOpen(false);
    setCommandQuery("");
    setCurrentLessonNeedsBinding(false);
    setImmersiveActive(false);
    setLessonCardMetaMap({});
    setLessonMediaMetaMap({});
    setSubtitleCacheMetaMap({});
    setSubtitleRegenerateState(null);
    setUploadTaskState(null);
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

    setLessonMediaMetaMap((prev) => ({
      ...prev,
      [lessonId]: mediaPreview,
    }));
    await persistLessonSubtitleCacheSeed(lesson);
    await loadLessons({ preferredLessonId: lessonId, autoEnterImmersive: shouldAutoEnterImmersive });
    await loadWallet();
    setCurrentLessonNeedsBinding(needsBinding);
  }

  async function refreshCurrentLesson() {
    if (!currentLesson?.id) return;
    await loadLessonDetail(currentLesson.id, { keepCurrentImmersiveState: true });
  }

  async function handleCommandSelect(lessonId) {
    if (!lessonId) return;
    setCommandOpen(false);
    setCommandQuery("");
    navigate("/");
    if (lessonId !== currentLesson?.id) {
      await loadLessonDetail(lessonId, { autoEnterImmersive: false });
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
    if (!accessToken) {
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
        accessToken,
      );
      const data = await parseResponse(resp);
      if (!resp.ok) {
        const message = toErrorText(data, "重命名课程失败");
        setGlobalStatus(message);
        return { ok: false, message };
      }

      setLessons((prev) => prev.map((item) => (item.id === lessonId ? { ...item, title: data.title } : item)));
      setCurrentLesson((prev) => (prev?.id === lessonId ? { ...prev, title: data.title } : prev));
      setGlobalStatus("");
      return { ok: true };
    } catch (error) {
      const message = `网络错误: ${String(error)}`;
      setGlobalStatus(message);
      return { ok: false, message };
    }
  }

  async function handleDeleteLesson(lessonId) {
    if (!accessToken) {
      return { ok: false, message: "请先登录" };
    }

    try {
      const resp = await api(`/api/lessons/${lessonId}`, { method: "DELETE" }, accessToken);
      const data = await parseResponse(resp);
      if (!resp.ok) {
        const message = toErrorText(data, "删除课程失败");
        setGlobalStatus(message);
        return { ok: false, message };
      }

      const currentSnapshot = lessons;
      const removedIndex = currentSnapshot.findIndex((item) => item.id === lessonId);
      const nextLessons = currentSnapshot.filter((item) => item.id !== lessonId);
      const deletingCurrentLesson = currentLesson?.id === lessonId;
      const keepImmersiveAfterFallback = immersiveActive;
      setLessons(nextLessons);
      setLessonCardMetaMap((prev) => {
        const next = { ...prev };
        delete next[lessonId];
        return next;
      });
      setLessonMediaMetaMap((prev) => {
        const next = { ...prev };
        delete next[lessonId];
        return next;
      });
      setSubtitleCacheMetaMap((prev) => {
        const next = { ...prev };
        delete next[lessonId];
        return next;
      });

      void deleteLessonMedia(lessonId).catch(() => {
        // Ignore local cache cleanup errors.
      });
      void deleteLessonSubtitleCache(lessonId).catch(() => {
        // Ignore local subtitle cache cleanup errors.
      });

      if (deletingCurrentLesson) {
        if (!nextLessons.length) {
          setCurrentLesson(null);
          setImmersiveActive(false);
        } else {
          const fallbackIndex = removedIndex >= 0 ? Math.min(removedIndex, nextLessons.length - 1) : 0;
          const nextLessonId = nextLessons[fallbackIndex]?.id;
          if (nextLessonId) {
            void loadLessonDetail(nextLessonId, { autoEnterImmersive: keepImmersiveAfterFallback });
          } else {
            setCurrentLesson(null);
          }
        }
      }

      setGlobalStatus("");
      toast.success("删除历史成功");
      return { ok: true, message: "删除历史成功" };
    } catch (error) {
      const message = `网络错误: ${String(error)}`;
      setGlobalStatus(message);
      return { ok: false, message };
    }
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
      setSubtitleRegenerateState(
        buildSubtitleRegenerateState(
          lessonId,
          {
            stage: "prepare",
            message: "正在连接流式反馈",
            translate_done: 0,
            translate_total: 0,
            semantic_split_enabled: Boolean(semanticSplitEnabled),
          },
          "streaming",
        ),
      );
      const resp = await api(
        `/api/lessons/${lessonId}/subtitle-variants/stream`,
        {
          method: "POST",
          headers: {
            Accept: "text/event-stream",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            asr_payload: asrPayload,
            semantic_split_enabled: Boolean(semanticSplitEnabled),
          }),
        },
        accessToken,
      );
      if (!resp.ok || !resp.body) {
        let message = "流式反馈不可用";
        try {
          const data = await parseResponse(resp);
          message = toErrorText(data, message);
        } catch (_) {
          // Ignore non-JSON stream failures and fall back below.
        }
        const error = new Error(message);
        error.userMessage = message;
        throw error;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let resultPayload = null;

      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const normalized = buffer.replace(/\r\n/g, "\n");
        const blocks = normalized.split("\n\n");
        buffer = blocks.pop() || "";

        for (const block of blocks) {
          const parsed = parseSseEventBlock(block);
          if (!parsed) continue;
          if (parsed.event === "progress") {
            setSubtitleRegenerateState(buildSubtitleRegenerateState(lessonId, parsed.data, "streaming"));
            continue;
          }
          if (parsed.event === "result") {
            resultPayload = parsed.data;
            continue;
          }
          if (parsed.event === "error") {
            const message = toErrorText(parsed.data || {}, "重新生成字幕失败");
            const error = new Error(message);
            error.userMessage = message;
            throw error;
          }
        }

        if (done) {
          break;
        }
      }

      if (buffer.trim()) {
        const parsed = parseSseEventBlock(buffer);
        if (parsed?.event === "progress") {
          setSubtitleRegenerateState(buildSubtitleRegenerateState(lessonId, parsed.data, "streaming"));
        }
        if (parsed?.event === "result") {
          resultPayload = parsed.data;
        }
        if (parsed?.event === "error") {
          const message = toErrorText(parsed.data || {}, "重新生成字幕失败");
          const error = new Error(message);
          error.userMessage = message;
          throw error;
        }
      }

      if (!resultPayload) {
        const error = new Error("流式反馈未返回结果，已自动改走普通请求");
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

      setCurrentLesson((prev) => {
        if (!prev || prev.id !== lessonId) return prev;
        return mergeLessonWithSubtitleVariant(prev, activeVariant);
      });
      setLessonCardMetaMap((prev) => ({
        ...prev,
        [lessonId]: {
          ...(prev[lessonId] || {}),
          sentenceCount: Array.isArray(activeVariant.sentences) ? activeVariant.sentences.length : Number(prev[lessonId]?.sentenceCount || 0),
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
      setLessonMediaMetaMap((prev) => ({
        ...prev,
        [lesson.id]: mediaPreview,
      }));
      if (currentLesson?.id === lesson.id) {
        setCurrentLessonNeedsBinding(false);
      }
      setMediaRestoreTick((value) => value + 1);
      return { ok: true, message: "恢复视频成功" };
    } catch (error) {
      const message = `恢复失败：${String(error)}`;
      return { ok: false, message };
    }
  }

  const currentPanel = PANEL_ITEMS.find((item) => item.key === activePanel) || PANEL_ITEMS[0];

  return (
    <SidebarProvider storageKey={SIDEBAR_STORAGE_KEY}>
      <div className="section-soft min-h-screen bg-background md:flex">
        {!immersiveLayoutActive ? (
          <Sidebar className="bg-background/95">
            <LearningSidebarNavigation
              activePanel={activePanel}
              onPanelSelect={handlePanelChange}
              accessToken={accessToken}
              hasLessons={lessons.length > 0}
              onOpenSearch={() => setCommandOpen(true)}
              onLogout={handleLogout}
              isAdminUser={isAdminUser}
              onAdminNavigate={() => navigate("/admin/ops")}
            />
          </Sidebar>
        ) : null}

        <SidebarInset>
          {!immersiveLayoutActive ? (
            <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
              <div className="container-wrapper">
                <div className="container flex min-h-16 items-center gap-3 py-3">
                  <SidebarTrigger />
                  <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
                    <SheetTrigger asChild>
                      <Button variant="outline" size="icon-sm" className="md:hidden" aria-label="open-learning-sidebar">
                        <Menu className="size-4" />
                      </Button>
                    </SheetTrigger>
                    <SheetContent side="left" className="w-[320px] p-0">
                      <SheetHeader className="sr-only">
                        <SheetTitle>{currentPanel.title}</SheetTitle>
                        <SheetDescription>在移动端切换学习面板、课程跳转与账号操作。</SheetDescription>
                      </SheetHeader>
                      <div className="flex h-full flex-col">
                        <LearningSidebarNavigation
                          activePanel={activePanel}
                          onPanelSelect={handlePanelChange}
                          accessToken={accessToken}
                          hasLessons={lessons.length > 0}
                          onOpenSearch={() => {
                            setCommandOpen(true);
                            setMobileNavOpen(false);
                          }}
                          onLogout={handleLogout}
                          isAdminUser={isAdminUser}
                          onAdminNavigate={() => {
                            setMobileNavOpen(false);
                            navigate("/admin/ops");
                          }}
                          mobile
                        />
                      </div>
                    </SheetContent>
                  </Sheet>

                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">学习中心</p>
                    <div className="flex min-w-0 items-center gap-2">
                      <h1 className="truncate text-sm font-semibold">{currentPanel.title}</h1>
                      <Badge variant="outline">{accessToken ? "已登录" : "未登录"}</Badge>
                      {accessToken ? <Badge variant="outline">{lessons.length} 门课程</Badge> : null}
                    </div>
                    <p className="hidden text-xs text-muted-foreground md:block">{currentPanel.description}</p>
                  </div>

                  <div className="ml-auto flex items-center gap-2">
                    {accessToken ? (
                      <div className="hidden md:block">
                        <WalletBadge accessToken={accessToken} balancePoints={walletBalance} />
                      </div>
                    ) : null}
                    {accessToken && lessons.length > 0 ? (
                      <Button variant="outline" size="sm" className="hidden md:inline-flex" onClick={() => setCommandOpen(true)}>
                        <Search className="size-4" />
                        找课程
                      </Button>
                    ) : null}
                    {accessToken && isAdminUser ? (
                      <Button variant="outline" size="sm" className="hidden md:inline-flex" onClick={() => navigate("/admin/ops")}>
                        <Shield className="size-4" />
                        管理后台
                      </Button>
                    ) : null}
                    {accessToken ? (
                      <Button variant="outline" size="sm" className="hidden md:inline-flex" onClick={handleLogout}>
                        <LogOut className="size-4" />
                        退出登录
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            </header>
          ) : null}

          <main className={cn("container-wrapper transition-all duration-300", immersiveLayoutActive ? "pb-0" : "pb-6")}>
            <div className={cn("container transition-all duration-300", immersiveLayoutActive ? "pt-2" : "pt-4")}>
              {immersiveLayoutActive ? (
                <section className="min-w-0 space-y-4">
                  {globalStatus ? (
                    <Alert variant="destructive">
                      <AlertTitle>系统消息</AlertTitle>
                      <AlertDescription>{globalStatus}</AlertDescription>
                    </Alert>
                  ) : null}
                  <ImmersiveLessonPage
                    lesson={currentLesson}
                    accessToken={accessToken}
                    apiClient={api}
                    onProgressSynced={refreshCurrentLesson}
                    immersiveActive={immersiveLayoutActive}
                    onExitImmersive={handleExitImmersive}
                    onStartImmersive={handleStartImmersive}
                    externalMediaReloadToken={mediaRestoreTick}
                  />
                </section>
              ) : (
                <section className="min-w-0 space-y-4">
                  {globalStatus ? (
                    <Alert variant="destructive">
                      <AlertTitle>系统消息</AlertTitle>
                      <AlertDescription>{globalStatus}</AlertDescription>
                    </Alert>
                  ) : null}

                  {!accessToken ? (
                    <div className="mx-auto max-w-md">
                      <AuthPanel onAuthed={handleAuthed} tokenKey={TOKEN_KEY} refreshKey={REFRESH_KEY} />
                    </div>
                  ) : (
                    <>
                      <div className={activePanel === "history" ? "block" : "hidden"}>
                        <LessonList
                          lessons={lessons}
                          currentLessonId={currentLesson?.id}
                          currentLessonNeedsBinding={currentLessonNeedsBinding}
                          lessonCardMetaMap={lessonCardMetaMap}
                          lessonMediaMetaMap={lessonMediaMetaMap}
                          subtitleCacheMetaMap={subtitleCacheMetaMap}
                          subtitleRegenerateState={subtitleRegenerateState}
                          onSelect={(lessonId) => loadLessonDetail(lessonId, { autoEnterImmersive: false })}
                          onStartLesson={handleStartLesson}
                          onRename={handleRenameLesson}
                          onDelete={handleDeleteLesson}
                          onRestoreMedia={handleRestoreLessonMedia}
                          onRegenerateSubtitles={handleRegenerateSubtitles}
                          onSwitchToUpload={() => handlePanelChange("upload")}
                          loading={loadingLessons}
                        />
                      </div>
                      <div className={activePanel === "upload" ? "block" : "hidden"}>
                        <UploadPanel
                          accessToken={accessToken}
                          onCreated={handleLessonCreated}
                          balancePoints={walletBalance}
                          billingRates={billingRates}
                          subtitleSettings={subtitleSettings}
                          onWalletChanged={loadWallet}
                          onTaskStateChange={setUploadTaskState}
                          onNavigateToLesson={handleNavigateToGeneratedLesson}
                        />
                      </div>
                      <div className={activePanel === "redeem" ? "block" : "hidden"}>
                        <RedeemCodePanel
                          apiCall={(path, options = {}) => api(path, options, accessToken)}
                          onWalletChanged={loadWallet}
                        />
                      </div>
                    </>
                  )}
                </section>
              )}
            </div>
          </main>

          {accessToken && activePanel !== "upload" && uploadTaskState ? (
            <div className="fixed bottom-5 right-5 z-50 w-[min(360px,calc(100vw-24px))]">
              <button
                type="button"
                className="w-full rounded-3xl border bg-background/95 p-4 text-left shadow-lg backdrop-blur transition hover:border-primary/40"
                onClick={() => handlePanelChange("upload")}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold">{uploadTaskState.headline}</p>
                    <p className="text-xs text-muted-foreground">
                      {uploadTaskState.phase === "success"
                        ? "已生成完成，点此回到上传页"
                        : uploadTaskState.phase === "error"
                          ? uploadTaskState.resumeAvailable
                            ? "生成中断，可继续处理"
                            : "生成失败，点此查看原因"
                          : "正在生成，点此回到上传页"}
                    </p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-muted-foreground">{uploadTaskState.progressPercent}%</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${uploadTaskState.progressPercent}%` }} />
                </div>
              </button>
            </div>
          ) : null}

          <CommandDialog
            open={commandOpen}
            onOpenChange={(open) => {
              setCommandOpen(open);
              if (!open) {
                setCommandQuery("");
              }
            }}
          >
            <CommandInput placeholder="搜索课程名或模型..." value={commandQuery} onValueChange={setCommandQuery} />
            <CommandList>
              <CommandEmpty>没有找到匹配的课程</CommandEmpty>
              <CommandGroup heading="课程">
                {filteredLessons.map((lesson) => (
                  <CommandItem
                    key={lesson.id}
                    value={`${lesson.title || ""} ${lesson.asr_model || ""} ${lesson.id}`}
                    onSelect={() => {
                      void handleCommandSelect(lesson.id);
                    }}
                  >
                    <div className="flex w-full flex-col">
                      <span>{lesson.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {lesson.asr_model || "-"} · {Number(lessonCardMetaMap[lesson.id]?.sentenceCount || lesson.sentences?.length || 0)} 句
                      </span>
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
