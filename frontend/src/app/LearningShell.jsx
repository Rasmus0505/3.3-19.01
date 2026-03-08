import { LogOut, Menu, Search, Shield, Sparkles } from "lucide-react";
import { ArrowRight, CirclePlay, Command as CommandIcon, LibraryBig, WandSparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { AuthPanel } from "../features/auth/AuthPanel";
import { ImmersiveLessonPage } from "../features/immersive/ImmersiveLessonPage";
import { LessonList } from "../features/lessons/LessonList";
import { UploadPanel } from "../features/upload/UploadPanel";
import { RedeemCodePanel } from "../features/wallet/RedeemCodePanel";
import { WalletBadge } from "../features/wallet/WalletBadge";
import { api, parseResponse, toErrorText } from "../shared/api/client";
import {
  deleteLessonMedia,
  hasLessonMedia,
  readMediaDurationSeconds,
  requestPersistentStorage,
  saveLessonMedia,
} from "../shared/media/localMediaStore";
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
import { clearAuthStorage, REFRESH_KEY, TOKEN_KEY } from "./authStorage";

export function LearningShell() {
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

  const immersiveLayoutActive = Boolean(accessToken && currentLesson?.id && immersiveActive);

  const filteredLessons = useMemo(() => {
    const keyword = commandQuery.trim().toLowerCase();
    if (!keyword) return lessons;
    return lessons.filter((item) => `${item.title || ""} ${item.asr_model || ""}`.toLowerCase().includes(keyword));
  }, [commandQuery, lessons]);

  async function loadLessons() {
    if (!accessToken) {
      setLessons([]);
      setCurrentLesson(null);
      setImmersiveActive(false);
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
      setCurrentLesson(merged);
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
      setWalletBalance(Number(data.balance_points || 0));
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
    setImmersiveActive(false);
  }

  function handleExitImmersive(_source = "button") {
    setImmersiveActive((prev) => {
      if (!prev) return prev;
      return false;
    });
  }

  async function handleLessonCreated(lesson) {
    await loadLessons();
    await loadLessonDetail(lesson.id, { autoEnterImmersive: false });
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

      void deleteLessonMedia(lessonId).catch(() => {
        // Ignore local cache cleanup errors.
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

  const totalSentenceCount = lessons.reduce((sum, item) => sum + Number(item.sentences?.length || 0), 0);
  const generatedLessonCount = lessons.filter((item) => Number(item.sentences?.length || 0) > 0).length;
  const currentLessonSentenceCount = Number(currentLesson?.sentences?.length || 0);
  const heroStats = [
    {
      label: "课程库",
      value: `${lessons.length} 节`,
      note: accessToken ? "自动接续你的历史进度" : "登录后自动同步",
    },
    {
      label: "可练句子",
      value: `${totalSentenceCount} 句`,
      note: totalSentenceCount > 0 ? "可直接进入逐句训练" : "上传后自动生成",
    },
    {
      label: "账户积分",
      value: accessToken ? `${walletBalance} 点` : "登录后可见",
      note: accessToken ? "用于上传与转写" : "可通过兑换码补充",
    },
  ];

  return (
    <div className="section-soft min-h-screen bg-background">
      <header className="container-wrapper py-3">
        <div className="container">
          <div className="apple-shell-header flex min-h-16 items-center gap-2 px-4 py-2 md:px-5">
            <Button size="icon-sm" variant="ghost" aria-label="logo" className="bg-white/45">
              <Sparkles className="size-4" />
            </Button>
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold tracking-tight text-slate-950">English Trainer</p>
                <p className="hidden text-xs text-slate-500 md:block">上传素材、自动生成课程、进入沉浸式学习舞台。</p>
              </div>
              <Badge variant="outline" className="hidden md:inline-flex">Apple inspired UI</Badge>
            </div>
            <Separator orientation="vertical" className="mx-1 hidden h-5 border-white/70 md:block" />
            <div className="hidden items-center gap-2 md:flex">
              <Badge variant="outline">{accessToken ? "已登录" : "未登录"}</Badge>
              <Badge variant="outline">{generatedLessonCount} 节可学课程</Badge>
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
                <Button variant="outline" size="sm" className="hidden md:inline-flex" onClick={() => navigate("/admin/users")}>
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

              <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="icon-sm" className="md:hidden" aria-label="open-menu">
                    <Menu className="size-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-[300px] border-white/70 bg-white/88 sm:w-[340px]">
                  <SheetHeader>
                    <SheetTitle>快捷操作</SheetTitle>
                    <SheetDescription>移动端切换课程、查看积分与进入管理后台。</SheetDescription>
                  </SheetHeader>
                  <div className="mt-6 space-y-3">
                    <Badge variant="outline" className="w-fit">{lessons.length} 节课程</Badge>
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
                    {accessToken ? (
                      <Button
                        variant="outline"
                        className="w-full justify-start"
                        onClick={() => {
                          setMobileNavOpen(false);
                          document.getElementById("learning-workbench")?.scrollIntoView({ behavior: "smooth", block: "start" });
                        }}
                      >
                        <LibraryBig className="size-4" />
                        查看学习工作台
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        className="w-full justify-start"
                        onClick={() => {
                          setMobileNavOpen(false);
                          document.getElementById("auth-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
                        }}
                      >
                        <Sparkles className="size-4" />
                        前往登录
                      </Button>
                    )}
                    {isAdminUser ? (
                      <Button
                        variant="outline"
                        className="w-full justify-start"
                        onClick={() => {
                          setMobileNavOpen(false);
                          navigate("/admin/users");
                        }}
                      >
                        <Shield className="size-4" />
                        管理后台
                      </Button>
                    ) : null}
                    {accessToken ? (
                      <Button className="w-full justify-start" onClick={handleLogout}>
                        <LogOut className="size-4" />
                        退出登录
                      </Button>
                    ) : null}
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </header>

      <main className={`container-wrapper ${immersiveLayoutActive ? "pb-4" : "pb-8"}`}>
        <div className="container space-y-6">
          <section className={`apple-panel p-6 md:p-8 ${immersiveLayoutActive ? "pt-6" : "pt-7 lg:pt-8"}`}>
            <div className={`apple-hero-grid ${immersiveLayoutActive ? "" : "apple-hero-grid--main"} items-start`}>
              <div className="space-y-7">
                <div className="space-y-5">
                  <div className="apple-kicker w-fit">
                    <WandSparkles className="size-3.5" />
                    Premium Learning Workspace
                  </div>
                  <div className="space-y-2.5">
                    <h1 className={immersiveLayoutActive ? "text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl" : "apple-title"}>
                      把英语学习做得更像产品，而不是更像后台。
                    </h1>
                    <p className="apple-copy">
                      先把首屏留出呼吸感，再把课程、上传、积分和沉浸学习自然收进一个安静的工作台。
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3 pt-1">
                  {!accessToken ? (
                    <>
                      <Button
                        size="lg"
                        onClick={() => document.getElementById("auth-panel")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                      >
                        立即开始
                        <ArrowRight className="size-4" />
                      </Button>
                      <Button
                        size="lg"
                        variant="outline"
                        onClick={() => document.getElementById("learning-workbench")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                      >
                        先看工作台
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="lg"
                        onClick={() => {
                          if (currentLesson?.id) {
                            if (!immersiveLayoutActive) {
                              handleStartImmersive();
                            }
                            document.getElementById("learning-workbench")?.scrollIntoView({ behavior: "smooth", block: "start" });
                            return;
                          }
                          document.getElementById("upload-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
                        }}
                      >
                        {currentLesson?.id ? (immersiveLayoutActive ? "回到学习舞台" : "开始当前课程") : "上传第一份素材"}
                        <CirclePlay className="size-4" />
                      </Button>
                      {lessons.length > 0 ? (
                        <Button size="lg" variant="outline" onClick={() => setCommandOpen(true)}>
                          <CommandIcon className="size-4" />
                          快速切换课程
                        </Button>
                      ) : (
                        <Button
                          size="lg"
                          variant="outline"
                          onClick={() => document.getElementById("upload-panel")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                        >
                          前往导入素材
                        </Button>
                      )}
                    </>
                  )}
                </div>

                <div className="grid gap-2.5 sm:grid-cols-3">
                  {heroStats.map((item) => (
                    <div key={item.label} className="apple-stat-card">
                      <p className="apple-stat-title">{item.label}</p>
                      <p className="apple-stat-value">{item.value}</p>
                      <p className="mt-1.5 text-sm leading-6 text-slate-500">{item.note}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="apple-preview-stack">
                <div className="apple-preview-tile space-y-4 md:p-6">
                  <p className="apple-eyebrow">Current Session</p>
                  <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                    <div className="space-y-2">
                      <p className="text-[1.35rem] font-semibold tracking-tight text-slate-950">{currentLesson?.title || "尚未选择课程"}</p>
                      <p className="text-sm leading-6 text-slate-500">
                        {accessToken
                          ? currentLesson
                            ? `${currentLessonSentenceCount} 句内容已就绪，可直接继续本轮训练。`
                            : "登录后可从历史课程继续，或直接导入第一份素材。"
                          : "登录后自动同步课程、积分和沉浸学习进度。"}
                      </p>
                    </div>
                    <div className="rounded-[1.25rem] border border-white/70 bg-white/72 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
                      <p className="apple-stat-title">当前状态</p>
                      <p className="mt-1 text-sm font-semibold tracking-tight text-slate-950">
                        {currentLessonNeedsBinding ? "等待绑定媒体" : currentLesson ? "可直接开始" : "等待导入素材"}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                    <span className="rounded-full border border-white/72 bg-white/75 px-3 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
                      {subtitleSettings.semantic_split_default_enabled ? "默认语义分句" : "默认规则分句"}
                    </span>
                    <span className="rounded-full border border-white/72 bg-white/75 px-3 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
                      {accessToken
                        ? currentLessonSentenceCount > 0
                          ? `${currentLessonSentenceCount} 句已准备`
                          : "等待生成句子"
                        : "登录后自动同步课程与积分"}
                    </span>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="apple-preview-tile space-y-3">
                    <p className="apple-eyebrow">Workflow</p>
                    <div className="grid gap-3">
                      {[
                        "导入视频或音频，自动读取时长与预估积分。",
                        "转写、分句并生成课程，现有接口逻辑保持不变。",
                        "进入沉浸学习舞台，逐句播放、跟写并持续推进进度。",
                      ].map((step, index) => (
                        <div key={step} className="flex items-start gap-3">
                          <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-white/72 bg-white/78 text-[11px] font-semibold text-slate-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          <p className="text-sm leading-6 text-slate-600">{step}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="apple-preview-tile space-y-3">
                    <p className="apple-eyebrow">Account</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-white/72 bg-white/75 px-3 py-1 text-xs text-slate-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
                        {accessToken ? "账号已连接" : "游客模式"}
                      </span>
                      {isAdminUser ? (
                        <span className="rounded-full border border-slate-900/10 bg-slate-950 px-3 py-1 text-xs text-white shadow-[0_18px_32px_-28px_rgba(15,23,42,0.5)]">
                          管理员权限
                        </span>
                      ) : null}
                      <WalletBadge accessToken={accessToken} balancePoints={walletBalance} />
                    </div>
                    <p className="text-sm leading-6 text-slate-500">
                      主站与后台继续共用同一套账户、积分和权限，只把入口做得更安静、更像成品。
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section id="learning-workbench" className="apple-workbench">
            <div className="apple-toolbar px-2 pb-4 pt-2 md:px-4">
              <div className="space-y-2.5">
                <div className="apple-eyebrow inline-flex items-center gap-2">
                  <LibraryBig className="size-3.5" />
                  Workspace
                </div>
                <div className="space-y-1.5">
                  <h2 className="text-[1.75rem] font-semibold tracking-tight text-slate-950 md:text-[2.15rem]">学习工作台</h2>
                  <p className="max-w-xl text-sm leading-6 text-slate-500">
                    课程在左，学习舞台居中，上传和账户操作在右；先把注意力留给正在练习的内容。
                  </p>
                </div>
              </div>

              <div className="apple-inline-metrics">
                <div className="apple-inline-metric">
                  <p className="apple-inline-metric-label">工作台</p>
                  <p className="apple-inline-metric-value">{accessToken ? (loadingLessons ? "同步中" : "已准备好") : "等待登录"}</p>
                </div>
                <div className="apple-inline-metric">
                  <p className="apple-inline-metric-label">学习舞台</p>
                  <p className="apple-inline-metric-value">{immersiveLayoutActive ? "沉浸中" : currentLesson?.id ? "可开始" : "先选课程"}</p>
                </div>
              </div>
            </div>

            <div
              className={`grid gap-5 transition-all duration-500 ease-out lg:gap-6 ${
                immersiveLayoutActive ? "xl:grid-cols-1" : "xl:grid-cols-[300px_minmax(0,1.2fr)_320px]"
              }`}
            >
              {!immersiveLayoutActive ? (
                <aside className="space-y-4 transition-all duration-500 ease-out">
                  <LessonList
                    lessons={lessons}
                    currentLessonId={currentLesson?.id}
                    onSelect={loadLessonDetail}
                    onRename={handleRenameLesson}
                    onDelete={handleDeleteLesson}
                    onRestoreMedia={handleRestoreLessonMedia}
                    loading={loadingLessons}
                  />
                  <Card size="sm" className="apple-panel-muted">
                    <CardHeader className="space-y-2 pb-0">
                      <div className="apple-eyebrow">Ready</div>
                      <div>
                        <CardTitle className="text-sm">进入学习前</CardTitle>
                        <CardDescription>只保留真正影响开始学习的几个状态。</CardDescription>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3 pt-4 text-sm">
                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-full border border-white/72 bg-white/74 px-3 py-1.5 text-slate-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
                          {currentLesson?.title || "未选择课程"}
                        </span>
                        <span className="rounded-full border border-white/72 bg-white/74 px-3 py-1.5 text-slate-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
                          {immersiveLayoutActive ? "沉浸中" : "待进入"}
                        </span>
                        <span className="rounded-full border border-white/72 bg-white/74 px-3 py-1.5 text-slate-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
                          {subtitleSettings.semantic_split_default_enabled ? "语义优先" : "规则优先"}
                        </span>
                      </div>
                      {currentLessonNeedsBinding ? (
                        <Alert className="border-amber-200/80 bg-amber-50/80">
                          <AlertTitle>待绑定本地媒体</AlertTitle>
                          <AlertDescription>当前课程可见，但播放受限。请在沉浸模式中绑定本地媒体后继续。</AlertDescription>
                        </Alert>
                      ) : (
                        <p className="rounded-[1.2rem] border border-white/70 bg-white/70 px-4 py-3 text-sm leading-6 text-slate-500">
                          媒体已就绪时，可直接从中间舞台开始逐句学习。
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </aside>
              ) : null}

              <section className={`min-w-0 space-y-4 transition-all duration-500 ease-out ${immersiveLayoutActive ? "xl:col-span-1" : ""}`}>
                <div className="apple-stage p-1.5">
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
                    <Card className="apple-panel-muted">
                      <CardHeader>
                        <CardTitle className="text-base">Preview</CardTitle>
                        <CardDescription>登录后即可在这里进入沉浸学习舞台，保留现有学习逻辑。</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <p className="text-sm leading-6 text-slate-500">先在右侧完成登录或注册，再上传素材并生成课程。</p>
                        <Button
                          variant="outline"
                          onClick={() => document.getElementById("auth-panel")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                        >
                          前往登录
                        </Button>
                      </CardContent>
                    </Card>
                  )}
                </div>

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
                    <div id="auth-panel">
                      <AuthPanel onAuthed={handleAuthed} tokenKey={TOKEN_KEY} refreshKey={REFRESH_KEY} />
                    </div>
                  ) : (
                    <>
                      <RedeemCodePanel
                        apiCall={(path, options = {}) => api(path, options, accessToken)}
                        onWalletChanged={loadWallet}
                      />
                      <div id="upload-panel">
                        <UploadPanel
                          accessToken={accessToken}
                          onCreated={handleLessonCreated}
                          balancePoints={walletBalance}
                          billingRates={billingRates}
                          subtitleSettings={subtitleSettings}
                          onWalletChanged={loadWallet}
                        />
                      </div>
                    </>
                  )}
                </aside>
              ) : null}
            </div>
          </section>
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

