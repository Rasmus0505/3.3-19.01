import { LogOut, Menu, Search, Shield, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { AuthPanel } from "../features/auth/AuthPanel";
import { ImmersiveLessonPage } from "../features/immersive/ImmersiveLessonPage";
import { LessonList } from "../features/lessons/LessonList";
import { UploadPanel } from "../features/upload/UploadPanel";
import { RedeemCodePanel } from "../features/wallet/RedeemCodePanel";
import { WalletBadge } from "../features/wallet/WalletBadge";
import { api, parseResponse, toErrorText } from "../shared/api/client";
import { deleteLessonMedia, hasLessonMedia } from "../shared/media/localMediaStore";
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
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [currentLessonNeedsBinding, setCurrentLessonNeedsBinding] = useState(false);

  const filteredLessons = useMemo(() => {
    const keyword = commandQuery.trim().toLowerCase();
    if (!keyword) return lessons;
    return lessons.filter((item) => `${item.title || ""} ${item.asr_model || ""}`.toLowerCase().includes(keyword));
  }, [commandQuery, lessons]);

  async function loadLessons() {
    if (!accessToken) {
      setLessons([]);
      setCurrentLesson(null);
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
        return;
      }

      const currentExists = currentLesson?.id && nextLessons.some((item) => item.id === currentLesson.id);
      if (!currentExists) {
        await loadLessonDetail(nextLessons[0].id);
      }
    } catch (error) {
      setGlobalStatus(`网络错误: ${String(error)}`);
    } finally {
      setLoadingLessons(false);
    }
  }

  async function loadLessonDetail(lessonId) {
    if (!lessonId || !accessToken) return;
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
      return;
    }
    const resp = await api("/api/billing/rates", {}, accessToken);
    const data = await parseResponse(resp);
    if (resp.ok) {
      setBillingRates(Array.isArray(data.rates) ? data.rates : []);
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
  }

  async function handleLessonCreated(lesson) {
    await loadLessons();
    await loadLessonDetail(lesson.id);
    await loadWallet();
  }

  async function refreshCurrentLesson() {
    if (!currentLesson?.id) return;
    await loadLessonDetail(currentLesson.id);
  }

  async function handleCommandSelect(lessonId) {
    if (!lessonId) return;
    setCommandOpen(false);
    setCommandQuery("");
    if (lessonId !== currentLesson?.id) {
      await loadLessonDetail(lessonId);
    }
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

      console.debug("[DEBUG] learning.lesson.rename_success", { lessonId, title: data.title });
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

      console.debug("[DEBUG] learning.lesson.delete_success", { lessonId });
      const currentSnapshot = lessons;
      const removedIndex = currentSnapshot.findIndex((item) => item.id === lessonId);
      const nextLessons = currentSnapshot.filter((item) => item.id !== lessonId);
      setLessons(nextLessons);

      try {
        await deleteLessonMedia(lessonId);
      } catch (_) {
        // Ignore local cache cleanup errors.
      }

      if (currentLesson?.id === lessonId) {
        if (!nextLessons.length) {
          setCurrentLesson(null);
        } else {
          const fallbackIndex = removedIndex >= 0 ? Math.min(removedIndex, nextLessons.length - 1) : 0;
          const nextLessonId = nextLessons[fallbackIndex]?.id;
          if (nextLessonId) {
            await loadLessonDetail(nextLessonId);
          } else {
            setCurrentLesson(null);
          }
        }
      }

      setGlobalStatus("");
      return { ok: true };
    } catch (error) {
      const message = `网络错误: ${String(error)}`;
      setGlobalStatus(message);
      return { ok: false, message };
    }
  }

  return (
    <div className="section-soft min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="container-wrapper">
          <div className="container flex h-14 items-center gap-2">
            <Button size="icon-sm" variant="ghost" aria-label="logo">
              <Sparkles className="size-4" />
            </Button>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">English Trainer</span>
              <Badge variant="outline">shadcn style</Badge>
            </div>
            <Separator orientation="vertical" className="mx-1 hidden h-4 md:block" />
            <div className="hidden items-center gap-2 md:flex">
              <Badge variant="outline">{accessToken ? "已登录" : "未登录"}</Badge>
              {accessToken ? <Badge variant="outline">{lessons.length} lessons</Badge> : null}
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
                      <SheetDescription>移动端导航与课程切换入口。</SheetDescription>
                    </SheetHeader>
                    <div className="mt-4 space-y-2">
                      <Badge variant="outline">{lessons.length} lessons</Badge>
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
                            navigate("/admin/users");
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

      <main className="container-wrapper pb-6">
        <div className="container grid gap-4 pt-4 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
          <aside className="space-y-4">
            <LessonList
              lessons={lessons}
              currentLessonId={currentLesson?.id}
              onSelect={loadLessonDetail}
              onRename={handleRenameLesson}
              onDelete={handleDeleteLesson}
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

          <section className="min-w-0 space-y-4">
            {accessToken ? (
              <ImmersiveLessonPage
                lesson={currentLesson}
                accessToken={accessToken}
                apiClient={api}
                onProgressSynced={refreshCurrentLesson}
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

          <aside className="space-y-4">
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
                  balancePoints={walletBalance}
                  billingRates={billingRates}
                  onWalletChanged={loadWallet}
                />
              </>
            )}
          </aside>
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
