import { LogOut, Shield, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

import { AuthPanel } from "../features/auth/AuthPanel";
import { ImmersiveLessonPage } from "../features/immersive/ImmersiveLessonPage";
import { LessonList } from "../features/lessons/LessonList";
import { PracticePanel } from "../features/practice/PracticePanel";
import { UploadPanel } from "../features/upload/UploadPanel";
import { WalletBadge } from "../features/wallet/WalletBadge";
import { api, parseResponse, toErrorText } from "../shared/api/client";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Separator } from "../shared/ui";
import { clearAuthStorage, REFRESH_KEY, TOKEN_KEY } from "./authStorage";

export function LearningShell() {
  const [accessToken, setAccessToken] = useState(() => localStorage.getItem(TOKEN_KEY) || "");
  const [lessons, setLessons] = useState([]);
  const [currentLesson, setCurrentLesson] = useState(null);
  const [loadingLessons, setLoadingLessons] = useState(false);
  const [globalStatus, setGlobalStatus] = useState("");
  const [viewMode, setViewMode] = useState("dashboard");
  const [walletBalance, setWalletBalance] = useState(0);
  const [billingRates, setBillingRates] = useState([]);
  const [isAdminUser, setIsAdminUser] = useState(false);

  async function loadLessons() {
    if (!accessToken) {
      setLessons([]);
      setCurrentLesson(null);
      setViewMode("dashboard");
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
      setLessons(listData);
      if (listData.length > 0 && !currentLesson) {
        await loadLessonDetail(listData[0].id);
      }
    } catch (error) {
      setGlobalStatus(`网络错误: ${String(error)}`);
    } finally {
      setLoadingLessons(false);
    }
  }

  async function loadLessonDetail(lessonId) {
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
    setViewMode("dashboard");
    setWalletBalance(0);
    setIsAdminUser(false);
  }

  async function handleLessonCreated(lesson) {
    await loadLessons();
    await loadLessonDetail(lesson.id);
    await loadWallet();
    setViewMode("immersive");
  }

  async function handleEnterImmersive(lessonId) {
    if (!lessonId) return;
    if (lessonId !== currentLesson?.id) {
      await loadLessonDetail(lessonId);
    }
    setViewMode("immersive");
  }

  async function refreshCurrentLesson() {
    if (!currentLesson?.id) return;
    await loadLessonDetail(currentLesson.id);
  }

  return (
    <div className="style-vega section-soft min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="container-wrapper">
          <div className="container flex h-14 items-center gap-2">
            <Button size="icon-sm" variant="ghost" aria-label="logo">
              <Sparkles className="size-4" />
            </Button>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">shadcn/create</span>
              <Badge variant="outline">English Trainer</Badge>
            </div>
            <Separator orientation="vertical" className="mx-1 hidden h-4 md:block" />
            <div className="hidden items-center gap-2 md:flex">
              <Badge variant="secondary">Vega</Badge>
              <Badge variant="outline">{accessToken ? "已登录" : "未登录"}</Badge>
              {accessToken ? <Badge variant="outline">{lessons.length} lessons</Badge> : null}
              <WalletBadge accessToken={accessToken} balancePoints={walletBalance} />
            </div>
            <div className="ml-auto flex items-center gap-2">
              {accessToken && isAdminUser ? (
                <Button variant="outline" size="sm" onClick={() => { window.location.href = "/admin"; }}>
                  <Shield className="size-4" />
                  管理后台
                </Button>
              ) : null}
              {accessToken ? (
                <Button variant="outline" size="sm" onClick={handleLogout}>
                  <LogOut className="size-4" />
                  退出
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <main className="container-wrapper pb-6">
        <div className="container grid gap-4 pt-4 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
          <aside className="space-y-4">
            <LessonList lessons={lessons} currentLessonId={currentLesson?.id} onSelect={loadLessonDetail} />
            <Card size="sm">
              <CardHeader>
                <CardTitle className="text-base">状态</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-muted-foreground">课程加载：{loadingLessons ? "进行中" : "空闲"}</p>
                <p className="text-muted-foreground">当前课程：{currentLesson?.title || "未选择"}</p>
                <p className="text-muted-foreground">学习模式：{viewMode === "immersive" ? "沉浸模式" : "普通模式"}</p>
                <p className="text-muted-foreground">接口：/api/lessons / /api/lessons/:id/check</p>
              </CardContent>
            </Card>
          </aside>

          <section className="min-w-0 space-y-4">
            {accessToken ? (
              viewMode === "immersive" ? (
                <ImmersiveLessonPage
                  lesson={currentLesson}
                  accessToken={accessToken}
                  apiClient={api}
                  onBack={() => {
                    setViewMode("dashboard");
                    refreshCurrentLesson();
                  }}
                  onProgressSynced={refreshCurrentLesson}
                />
              ) : (
                <>
                  <div className="flex justify-end">
                    <Button
                      variant="secondary"
                      onClick={() => handleEnterImmersive(currentLesson?.id)}
                      disabled={!currentLesson}
                    >
                      沉浸学习模式
                    </Button>
                  </div>
                  <PracticePanel lesson={currentLesson} accessToken={accessToken} onProgressSynced={loadLessons} />
                </>
              )
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Preview</CardTitle>
                  <CardDescription>登录后可在中间区域进行逐句拼写练习与结果预览。</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">请在右侧先完成登录或注册。</p>
                </CardContent>
              </Card>
            )}

            {globalStatus ? (
              <Card size="sm">
                <CardHeader>
                  <CardTitle className="text-base">系统消息</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-destructive">{globalStatus}</p>
                </CardContent>
              </Card>
            ) : null}
          </section>

          <aside className="space-y-4">
            {!accessToken ? (
              <AuthPanel onAuthed={handleAuthed} tokenKey={TOKEN_KEY} refreshKey={REFRESH_KEY} />
            ) : (
              <UploadPanel
                accessToken={accessToken}
                onCreated={handleLessonCreated}
                balancePoints={walletBalance}
                billingRates={billingRates}
                onWalletChanged={loadWallet}
              />
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}
