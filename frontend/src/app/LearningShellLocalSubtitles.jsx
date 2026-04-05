import { LogOut, Menu, Search, Shield, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { AuthPanel } from "../features/auth/components/AuthPanel";
import { ImmersiveLessonPage } from "../features/immersive/ImmersiveLessonPage";
import { LessonListLocalSubtitles } from "../features/lessons/LessonListLocalSubtitles";
import { UploadPanel } from "../features/upload/UploadPanel";
import { RedeemCodePanel } from "../features/wallet/components/RedeemCodePanel";
import { WalletBadge } from "../features/wallet/components/WalletBadge";
import { api, parseResponse, toErrorText } from "../shared/api/client";
import {
  deleteLessonMedia,
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
} from "../shared/media/localSubtitleStore.js";
import { getShortcutCompleteness, readLearningSettings } from "../features/immersive/learningSettings";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
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
  Separator,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "../shared/ui";
import { clearAuthStorage, REFRESH_KEY, restoreCachedAuthSession, TOKEN_KEY } from "./authStorage";

function toAsrSentenceOnlyPayload(asrPayload) {
  if (!asrPayload || typeof asrPayload !== "object") {
    return null;
  }
  const transcripts = Array.isArray(asrPayload.transcripts)
    ? asrPayload.transcripts.map((transcript) => {
        if (!transcript || typeof transcript !== "object") {
          return transcript;
        }
        const nextTranscript = { ...transcript };
        if (Array.isArray(nextTranscript.sentences)) {
          delete nextTranscript.words;
          return nextTranscript;
        }
        return transcript;
      })
    : [];
  return {
    ...asrPayload,
    transcripts,
  };
}

function toOriginalSubtitleVariant(data) {
  return {
    ...data,
    semantic_split_enabled: false,
    split_mode: "asr_sentences",
    strategy_version: 2,
  };
}

export function LearningShellLocalSubtitles() {
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
  const [subtitleCacheMetaMap, setSubtitleCacheMetaMap] = useState({});

  const immersiveLayoutActive = Boolean(accessToken && currentLesson?.id && immersiveActive);

  const filteredLessons = useMemo(() => {
    const keyword = commandQuery.trim().toLowerCase();
    if (!keyword) return lessons;
    return lessons.filter((item) => `${item.title || ""} ${item.asr_model || ""}`.toLowerCase().includes(keyword));
  }, [commandQuery, lessons]);

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

  async function loadLessons() {
    if (!accessToken) {
      setLessons([]);
      setCurrentLesson(null);
      setImmersiveActive(false);
      setSubtitleCacheMetaMap({});
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
      if (!nextLessons.length) {
        setCurrentLesson(null);
        setImmersiveActive(false);
        return;
      }

      const currentExists = currentLesson?.id && nextLessons.some((item) => item.id === currentLesson.id);
      if (!currentExists) {
        await loadLessonDetail(nextLessons[0].id, { autoEnterImmersive: false });
      }
    } catch (error) {
      setGlobalStatus(`网络错误: ${String(error)}`);
    } finally {
      setLoadingLessons(false);
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
      const merged = {
        ...detailData,
        progress: progressResp.ok
          ? {
              current_sentence_index: progressData.current_sentence_index || 0,
              completed_sentence_indexes: progressData.completed_sentence_indexes || [],
              last_played_at_ms: progressData.last_played_at_ms || 0,
            }
          : {
              current_sentence_index: 0,
              completed_sentence_indexes: [],
              last_played_at_ms: 0,
            },
      };
      const mergedWithLocalVariant = await applyLocalSubtitleVariant(merged);
      setCurrentLesson(mergedWithLocalVariant);
      console.debug("[DEBUG] loadLessonDetail immersive policy", {
        lessonId,
        autoEnterImmersive,
        keepCurrentImmersiveState,
      });
      setImmersiveActive((prev) => (keepCurrentImmersiveState ? prev : Boolean(autoEnterImmersive)));
    } catch (error) {
      setGlobalStatus(`网络错误: ${String(error)}`);
    }
  }

  async function loadWallet() {
    if (!accessToken) {
      setWalletBalance(0);
      return;
    }
    const resp = await api("/api/wallet/me", {}, accessToken);
    const data = await parseResponse(resp);
    if (resp.ok) {
      setWalletBalance(Number(data.balance_amount_cents ?? data.balance_points ?? 0));
    }
  }

  async function loadBillingRates() {
    if (!accessToken) {
      setBillingRates([]);
      setSubtitleSettings({ semantic_split_default_enabled: false });
      return;
    }
    const resp = await api("/api/billing/rates", {}, accessToken);
    const data = await parseResponse(resp);
    if (resp.ok) {
      setBillingRates(Array.isArray(data.rates) ? data.rates : []);
      setSubtitleSettings({
        semantic_split_default_enabled: Boolean(data.subtitle_settings?.semantic_split_default_enabled),
      });
    }
  }

  async function detectAdmin() {
    if (!accessToken) {
      setIsAdminUser(false);
      return;
    }
    const resp = await api("/api/admin/billing-rates", {}, accessToken);
    setIsAdminUser(resp.ok);
  }

  useEffect(() => {
    loadLessons();
    loadWallet();
    loadBillingRates();
    detectAdmin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  useEffect(() => {
    let canceled = false;

    async function restoreAuth(forceRefresh = false) {
      try {
        const result = await restoreCachedAuthSession({ forceRefresh });
        if (canceled) {
          return;
        }
        setAccessToken(localStorage.getItem(TOKEN_KEY) || "");
        if (result?.status === "expired") {
          setGlobalStatus(result.message || "登录状态已过期，请联网重新登录");
          return;
        }
        setGlobalStatus("");
      } catch (error) {
        if (canceled) {
          return;
        }
        setGlobalStatus(`登录恢复失败: ${String(error)}`);
      }
    }

    void restoreAuth(false);
    const handleOnline = () => {
      void restoreAuth(true);
    };
    window.addEventListener("online", handleOnline);
    return () => {
      canceled = true;
      window.removeEventListener("online", handleOnline);
    };
  }, []);

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

    detectCurrentLessonMediaStatus();
    return () => {
      canceled = true;
    };
  }, [currentLesson?.id, currentLesson?.media_storage]);

  function handleAuthed() {
    setAccessToken(localStorage.getItem(TOKEN_KEY) || "");
    setGlobalStatus("");
  }

  async function handleLogout() {
    await clearAuthStorage();
    setAccessToken("");
    setLessons([]);
    setCurrentLesson(null);
    setGlobalStatus("");
    setWalletBalance(0);
    setIsAdminUser(false);
    setMobileNavOpen(false);
    setCommandOpen(false);
    setImmersiveActive(false);
    setSubtitleCacheMetaMap({});
  }

  function handleExitImmersive(_source = "button") {
    setImmersiveActive((prev) => {
      if (!prev) return prev;
      return false;
    });
  }

  async function handleLessonCreated(lesson) {
    await persistLessonSubtitleCacheSeed(lesson);
    await loadLessons();
    await loadLessonDetail(lesson.id, { autoEnterImmersive: false });
    if (lesson?.subtitle_cache_seed?.semantic_split_enabled === false) {
      await handleRegenerateSubtitles(lesson, false, { silent: true });
    }
    await loadWallet();
  }

  async function refreshCurrentLesson() {
    if (!currentLesson?.id) return;
    await loadLessonDetail(currentLesson.id, { keepCurrentImmersiveState: true });
  }

  async function handleCommandSelect(lessonId) {
    if (!lessonId) return;
    setCommandOpen(false);
    setCommandQuery("");
    if (lessonId !== currentLesson?.id) {
      await loadLessonDetail(lessonId, { autoEnterImmersive: false });
    }
  }

  async function handleStartLesson(lessonId) {
    if (!lessonId) return;
    const { complete, missingActions } = getShortcutCompleteness(readLearningSettings());
    if (!complete) {
      const names = missingActions.map((a) => a.label).join("、");
      toast.error(`快捷键未配置完整：${names}。请先在「学习参数」区域配置好所有快捷键，再开始学习。`);
      return;
    }
    if (lessonId !== currentLesson?.id) {
      await loadLessonDetail(lessonId, { autoEnterImmersive: false });
    }
    setImmersiveActive(true);
  }

  function handleStartImmersive() {
    if (!currentLesson?.id) return;
    setImmersiveActive(true);
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

  async function handleRegenerateSubtitles(lesson, semanticSplitEnabled, options = {}) {
    const lessonId = Number(lesson?.id || 0);
    if (!lessonId || !accessToken) {
      return { ok: false, message: "请先登录" };
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
        const requestPayload = semanticSplitEnabled ? asrPayload : toAsrSentenceOnlyPayload(asrPayload);
        const resp = await api(
          `/api/lessons/${lessonId}/subtitle-variants`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              asr_payload: requestPayload,
              semantic_split_enabled: Boolean(semanticSplitEnabled),
            }),
          },
          accessToken,
        );
        const data = await parseResponse(resp);
        if (!resp.ok) {
          const message = toErrorText(data, "重新生成字幕失败");
          setGlobalStatus(message);
          return { ok: false, message };
        }
        const normalizedVariant = semanticSplitEnabled ? data : toOriginalSubtitleVariant(data);
        activeVariant = await saveLessonSubtitleVariant(lessonId, normalizedVariant);
      }

      if (!activeVariant) {
        return { ok: false, message: "未找到可切换的字幕版本" };
      }

      setCurrentLesson((prev) => {
        if (!prev || prev.id !== lessonId) return prev;
        return mergeLessonWithSubtitleVariant(prev, activeVariant);
      });
      await refreshSubtitleCacheMeta([{ id: lessonId }], { merge: true });
      setGlobalStatus("");
      const message = semanticSplitEnabled ? "已切换为语义分句" : "已切换为原始字幕";
      if (!options.silent) {
        toast.success(message);
      }
      return { ok: true, message };
    } catch (error) {
      const message = `网络错误: ${String(error)}`;
      setGlobalStatus(message);
      return { ok: false, message };
    }
  }

  async function handleRestoreLessonMedia(lesson, file) {
    if (!lesson?.id || !file) {
      return { ok: false, message: "恢复视频参数无效" };
    }
    console.debug("[DEBUG] lessons.restore_media.start", { lessonId: lesson.id, fileName: file.name, fileSize: file.size });
    try {
      const expectedSourceDurationSec = Math.max(0, Number(lesson.source_duration_ms || 0) / 1000);
      if (expectedSourceDurationSec > 0) {
        const localDurationSec = await readMediaDurationSeconds(file, file.name || lesson.source_filename || "");
        const delta = Math.abs(localDurationSec - expectedSourceDurationSec);
        if (delta > 0.5) {
          const message = `恢复失败：文件时长差 ${delta.toFixed(3)} 秒，超过 0.5 秒阈值（本地 ${localDurationSec.toFixed(
            3,
          )} 秒，课程 ${expectedSourceDurationSec.toFixed(3)} 秒）。`;
          console.debug("[DEBUG] lessons.restore_media.duration_mismatch", { lessonId: lesson.id, deltaSec: delta });
          return { ok: false, message };
        }
      }

      await requestPersistentStorage();
      await saveLessonMedia(lesson.id, file);
      if (currentLesson?.id === lesson.id) {
        setCurrentLessonNeedsBinding(false);
      }
      setMediaRestoreTick((value) => value + 1);
      console.debug("[DEBUG] lessons.restore_media.success", { lessonId: lesson.id });
      return { ok: true, message: "恢复视频成功" };
    } catch (error) {
      const message = `恢复失败：${String(error)}`;
      console.debug("[DEBUG] lessons.restore_media.failed", { lessonId: lesson.id, error: String(error) });
      return { ok: false, message };
    }
  }

  return (
    <div className="section-soft min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur transition-all duration-500 ease-out supports-[backdrop-filter]:bg-background/80">
        <div className="container-wrapper">
          <div className="container flex h-14 items-center gap-2">
            <Button size="icon-sm" variant="ghost" aria-label="logo">
              <Sparkles className="size-4" />
            </Button>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">Unlock Anything</span>
              <Badge variant="outline">{accessToken ? "已登录" : "未登录"}</Badge>
            </div>
            <Separator orientation="vertical" className="mx-1 hidden h-4 md:block" />
            <div className="hidden items-center gap-2 md:flex">
              {accessToken ? <Badge variant="outline">{lessons.length} 门课程</Badge> : null}
              <WalletBadge accessToken={accessToken} balancePoints={walletBalance} />
            </div>
            <div className="ml-auto flex items-center gap-2">
              {accessToken && lessons.length > 0 ? (
                <Button variant="outline" size="sm" className="hidden md:inline-flex" onClick={() => setCommandOpen(true)}>
                  <Search className="size-4" />
                  快速跳转
                </Button>
              ) : null}
              {accessToken && isAdminUser ? (
                <Button variant="outline" size="sm" className="hidden md:inline-flex" onClick={() => navigate("/admin/health")}>
                  <Shield className="size-4" />
                  管理后台
                </Button>
              ) : null}
              {accessToken ? (
                <Button variant="outline" size="sm" className="hidden md:inline-flex" onClick={handleLogout}>
                  <LogOut className="size-4" />
                  退出
                </Button>
              ) : null}

              {accessToken ? (
                <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
                  <SheetTrigger asChild>
                    <Button variant="outline" size="icon-sm" className="md:hidden" aria-label="open-menu">
                      <Menu className="size-4" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="right" className="w-[280px] sm:w-[320px]">
                    <SheetHeader>
                      <SheetTitle>快捷操作</SheetTitle>
                      <SheetDescription>移动端导航、课程切换与账号操作。</SheetDescription>
                    </SheetHeader>
                    <div className="mt-4 space-y-2">
                      <Badge variant="outline">{lessons.length} 门课程</Badge>
                      <WalletBadge accessToken={accessToken} balancePoints={walletBalance} />
                      {lessons.length > 0 ? (
                        <Button
                          variant="outline"
                          className="w-full justify-start"
                          onClick={() => {
                            setMobileNavOpen(false);
                            setCommandOpen(true);
                          }}
                        >
                          <Search className="size-4" />
                          快速跳转课程
                        </Button>
                      ) : null}
                      {isAdminUser ? (
                        <Button
                          variant="outline"
                          className="w-full justify-start"
                          onClick={() => {
                            setMobileNavOpen(false);
                            navigate("/admin/health");
                          }}
                        >
                          <Shield className="size-4" />
                          管理后台
                        </Button>
                      ) : null}
                      <Button className="w-full justify-start" onClick={handleLogout}>
                        <LogOut className="size-4" />
                        退出登录
                      </Button>
                    </div>
                  </SheetContent>
                </Sheet>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <main className={`container-wrapper transition-all duration-500 ease-out ${immersiveLayoutActive ? "pb-0" : "pb-6"}`}>
        <div
          className={`container grid gap-4 transition-all duration-500 ease-out ${
            immersiveLayoutActive ? "pt-2 xl:grid-cols-1" : "pt-4 xl:grid-cols-[320px_minmax(0,1fr)_360px]"
          }`}
        >
          {!immersiveLayoutActive ? (
            <aside className="space-y-4 transition-all duration-500 ease-out">
              <LessonListLocalSubtitles
                lessons={lessons}
                currentLessonId={currentLesson?.id}
                currentLessonNeedsBinding={currentLessonNeedsBinding}
                subtitleCacheMetaMap={subtitleCacheMetaMap}
                onSelect={loadLessonDetail}
                onStartLesson={handleStartLesson}
                onRename={handleRenameLesson}
                onDelete={handleDeleteLesson}
                onRestoreMedia={handleRestoreLessonMedia}
                onRegenerateSubtitles={handleRegenerateSubtitles}
                loading={loadingLessons}
              />
              <Card size="sm">
                <CardHeader>
                  <CardTitle className="text-base">状态</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p className="text-muted-foreground">课程加载：{loadingLessons ? "进行中" : "空闲"}</p>
                  <p className="text-muted-foreground">当前课程：{currentLesson?.title || "未选择"}</p>
                  <p className="text-muted-foreground">学习模式：沉浸模式</p>
                  {currentLessonNeedsBinding ? <p className="text-amber-600">待绑定本地媒体：课程可见，但播放受限</p> : null}
                </CardContent>
              </Card>
            </aside>
          ) : null}

          <section className={`min-w-0 space-y-4 transition-all duration-500 ease-out ${immersiveLayoutActive ? "xl:col-span-1" : ""}`}>
            {accessToken ? (
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
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Preview</CardTitle>
                  <CardDescription>登录后可在中间区域进入沉浸模式学习。</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">请在右侧先完成登录或注册。</p>
                </CardContent>
              </Card>
            )}

            {globalStatus ? (
              <Alert variant="destructive">
                <AlertTitle>系统消息</AlertTitle>
                <AlertDescription>{globalStatus}</AlertDescription>
              </Alert>
            ) : null}
          </section>

          {!immersiveLayoutActive ? (
            <aside className="space-y-4 transition-all duration-500 ease-out">
              {!accessToken ? (
                <AuthPanel onAuthed={handleAuthed} tokenKey={TOKEN_KEY} refreshKey={REFRESH_KEY} />
              ) : (
                <>
                  <RedeemCodePanel
                    apiCall={(path, options = {}) => api(path, options, accessToken)}
                    onWalletChanged={loadWallet}
                  />
                  <UploadPanel
                    accessToken={accessToken}
                    onCreated={handleLessonCreated}
                    onNavigateToLesson={handleStartLesson}
                    balancePoints={walletBalance}
                    billingRates={billingRates}
                    subtitleSettings={subtitleSettings}
                    onWalletChanged={loadWallet}
                  />
                </>
              )}
            </aside>
          ) : null}
        </div>
      </main>

      <CommandDialog
        open={commandOpen}
        onOpenChange={(open) => {
          setCommandOpen(open);
          if (!open) {
            setCommandQuery("");
          }
        }}
      >
        <CommandInput placeholder="搜索课程标题或模型..." value={commandQuery} onValueChange={setCommandQuery} />
        <CommandList>
          <CommandEmpty>没有匹配的课程</CommandEmpty>
          <CommandGroup heading="课程列表">
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
                    {lesson.asr_model || "-"} · {lesson.sentences?.length || 0} 句
                  </span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </div>
  );
}

