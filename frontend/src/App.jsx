import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Compass,
  Loader2,
  LogOut,
  Play,
  Shield,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./components/ui/card";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import { Select } from "./components/ui/select";
import { Separator } from "./components/ui/separator";
import { Textarea } from "./components/ui/textarea";
import { AdminApp } from "./AdminApp";
import { ImmersiveLessonPage } from "./features/immersive/ImmersiveLessonPage";

const ASR_MODELS = [
  { value: "paraformer-v2", label: "paraformer-v2 (推荐，带时间戳)" },
  { value: "qwen3-asr-flash-filetrans", label: "qwen3-asr-flash-filetrans" },
];

const TOKEN_KEY = "english_asr_access_token";
const REFRESH_KEY = "english_asr_refresh_token";

function api(path, options = {}, accessToken = "") {
  const headers = new Headers(options.headers || {});
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
  return fetch(path, { ...options, headers });
}

async function parseResponse(resp) {
  try {
    return await resp.json();
  } catch (_) {
    return {};
  }
}

function toErrorText(data, fallback) {
  return `${data.error_code || "ERROR"}: ${data.message || fallback}`;
}

function calculatePointsBySeconds(seconds, pointsPerMinute) {
  if (!Number.isFinite(seconds) || seconds <= 0 || !Number.isFinite(pointsPerMinute) || pointsPerMinute <= 0) {
    return 0;
  }
  const roundedSeconds = Math.ceil(seconds);
  return Math.ceil((roundedSeconds * pointsPerMinute) / 60);
}

function getRateByModel(rates, modelName) {
  return rates.find((item) => item.model_name === modelName && item.is_active);
}

function readMediaDurationSeconds(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const media = document.createElement(file.type.startsWith("video") ? "video" : "audio");
    media.preload = "metadata";
    media.onloadedmetadata = () => {
      const duration = Number(media.duration || 0);
      URL.revokeObjectURL(objectUrl);
      resolve(duration > 0 ? duration : 0);
    };
    media.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("读取媒体时长失败"));
    };
    media.src = objectUrl;
  });
}

function normalizeInputTokens(text) {
  return text
    .split(/\s+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function AuthPanel({ onAuthed }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  async function submit(path) {
    setLoading(true);
    setStatus("提交中...");
    try {
      const resp = await api(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await parseResponse(resp);
      if (!resp.ok) {
        setStatus(toErrorText(data, "请求失败"));
        return;
      }
      localStorage.setItem(TOKEN_KEY, data.access_token);
      localStorage.setItem(REFRESH_KEY, data.refresh_token);
      setStatus("登录成功");
      onAuthed(data);
    } catch (error) {
      setStatus(`网络错误: ${String(error)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>登录 / 注册</CardTitle>
        <CardDescription>先登录后再上传素材并开始句级练习。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2">
          <Label htmlFor="email">邮箱</Label>
          <Input id="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">密码</Label>
          <Input id="password" placeholder="至少6位" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <Button disabled={loading} onClick={() => submit("/api/auth/login")}>登录</Button>
          <Button variant="outline" disabled={loading} onClick={() => submit("/api/auth/register")}>注册</Button>
        </div>
      </CardContent>
      <CardFooter>
        {status ? <p className="text-sm text-muted-foreground">{status}</p> : <p className="text-sm text-muted-foreground">未登录状态</p>}
      </CardFooter>
    </Card>
  );
}

function UploadPanel({ accessToken, onCreated, balancePoints, billingRates, onWalletChanged }) {
  const [file, setFile] = useState(null);
  const [model, setModel] = useState(ASR_MODELS[0].value);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [durationSec, setDurationSec] = useState(null);
  const [probing, setProbing] = useState(false);

  const selectedRate = getRateByModel(billingRates, model);
  const estimatedPoints = selectedRate ? calculatePointsBySeconds(durationSec || 0, selectedRate.points_per_minute) : 0;
  const likelyInsufficient = Number.isFinite(balancePoints) && estimatedPoints > 0 && balancePoints < estimatedPoints;

  async function onSelectFile(nextFile) {
    setFile(nextFile);
    setStatus("");
    setDurationSec(null);
    if (!nextFile) return;
    setProbing(true);
    try {
      const seconds = await readMediaDurationSeconds(nextFile);
      setDurationSec(seconds);
    } catch (_) {
      setDurationSec(null);
    } finally {
      setProbing(false);
    }
  }

  async function submit() {
    if (!file) {
      setStatus("请先选择文件");
      return;
    }
    setLoading(true);
    setStatus("AI 正在生成课程...");
    try {
      const form = new FormData();
      form.append("video_file", file);
      form.append("asr_model", model);
      const resp = await api("/api/lessons", { method: "POST", body: form }, accessToken);
      const data = await parseResponse(resp);
      if (!resp.ok) {
        setStatus(toErrorText(data, "生成失败"));
        await onWalletChanged?.();
        return;
      }
      setStatus("生成成功");
      await onWalletChanged?.();
      onCreated(data.lesson);
    } catch (error) {
      setStatus(`网络错误: ${String(error)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UploadCloud className="size-4" />
          导入素材并生成练习
        </CardTitle>
        <CardDescription>流程：抽音频 → ASR（时间戳）→ 逐句对齐 → 中文翻译。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-md border border-input bg-muted/20 p-3 text-sm">
          <p className="text-muted-foreground">当前余额：{Number(balancePoints || 0)} 点</p>
          <p className="text-muted-foreground">
            预估扣费：
            {selectedRate
              ? probing
                ? "读取时长中..."
                : durationSec != null
                  ? `${estimatedPoints} 点（${selectedRate.points_per_minute} 点/分钟）`
                  : "选择文件后显示"
              : "该模型未配置单价"}
          </p>
          {likelyInsufficient ? <p className="mt-1 text-destructive">余额可能不足，提交将被拒绝。</p> : null}
        </div>

        <div className="grid gap-2">
          <Label htmlFor="asr-model">模型选择</Label>
          <Select id="asr-model" value={model} onChange={(e) => setModel(e.target.value)} disabled={loading}>
            {ASR_MODELS.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </Select>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="asr-file">上传素材</Label>
          <Input
            id="asr-file"
            type="file"
            className="h-11 cursor-pointer py-2 file:mr-2 file:rounded-md file:border file:border-border file:bg-muted file:px-2.5 file:py-1 file:text-xs"
            onChange={(e) => onSelectFile(e.target.files?.[0] ?? null)}
            disabled={loading}
          />
        </div>

        <Button onClick={submit} disabled={loading} className="w-full">
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" />
              生成中
            </span>
          ) : (
            "开始生成课程"
          )}
        </Button>
      </CardContent>
      <CardFooter>
        {status ? <p className="text-sm text-muted-foreground">{status}</p> : <p className="text-sm text-muted-foreground">等待上传</p>}
      </CardFooter>
    </Card>
  );
}

function LessonList({ lessons, currentLessonId, onSelect }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Compass className="size-4" />
          Explorer
        </CardTitle>
        <CardDescription>选择课程进入逐句拼写练习。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {lessons.length === 0 ? <p className="text-sm text-muted-foreground">暂无课程，请先上传素材。</p> : null}
        {lessons.map((lesson) => (
          <button
            key={lesson.id}
            className={`w-full rounded-md border p-3 text-left text-sm transition-colors ${
              currentLessonId === lesson.id
                ? "border-primary bg-primary/10"
                : "border-input bg-background hover:bg-muted"
            }`}
            onClick={() => onSelect(lesson.id)}
            type="button"
          >
            <div className="font-medium">{lesson.title}</div>
            <div className="text-xs text-muted-foreground">
              {lesson.status} · {lesson.asr_model} · {lesson.sentences?.length || 0} 句
            </div>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}

function PracticePanel({ lesson, accessToken, onProgressSynced }) {
  const [idx, setIdx] = useState(0);
  const [completedIndexes, setCompletedIndexes] = useState([]);
  const [answer, setAnswer] = useState("");
  const [checkResult, setCheckResult] = useState(null);
  const [showChinese, setShowChinese] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);

  const current = lesson?.sentences?.[idx] || null;
  const audioRef = useMemo(() => new Audio(), [lesson?.id]);

  useEffect(() => {
    const savedIdx = lesson?.progress?.current_sentence_index;
    const savedCompleted = lesson?.progress?.completed_sentence_indexes;
    setIdx(Number.isInteger(savedIdx) && savedIdx >= 0 ? savedIdx : 0);
    setCompletedIndexes(Array.isArray(savedCompleted) ? savedCompleted : []);
  }, [lesson?.id, lesson?.progress?.current_sentence_index, lesson?.progress?.completed_sentence_indexes]);

  useEffect(() => {
    setAnswer("");
    setCheckResult(null);
    setShowChinese(false);
  }, [idx, lesson?.id]);

  async function syncProgress(nextIndex, nextCompleted = []) {
    const payload = {
      current_sentence_index: nextIndex,
      completed_sentence_indexes: nextCompleted,
      last_played_at_ms: 0,
    };
    await api(
      `/api/lessons/${lesson.id}/progress`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      accessToken,
    );
    onProgressSynced?.();
  }

  async function playCurrent() {
    if (!current) {
      return;
    }
    setAudioLoading(true);
    try {
      const audioResp = await api(current.audio_url, {}, accessToken);
      if (!audioResp.ok) {
        return;
      }
      const blob = await audioResp.blob();
      const blobUrl = URL.createObjectURL(blob);
      audioRef.src = blobUrl;
      await audioRef.play();
    } catch (_) {
      // ignore playback errors
    } finally {
      setAudioLoading(false);
    }
  }

  async function checkAnswer() {
    if (!current) {
      return;
    }
    const userTokens = normalizeInputTokens(answer);
    const resp = await api(
      `/api/lessons/${lesson.id}/check`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sentence_index: current.idx, user_tokens: userTokens }),
      },
      accessToken,
    );
    const data = await parseResponse(resp);
    setCheckResult(data);
    if (resp.ok && data.passed) {
      setShowChinese(true);
      await playCurrent();
      const nextCompleted = Array.from(new Set([...completedIndexes, current.idx])).sort((a, b) => a - b);
      setCompletedIndexes(nextCompleted);
      await syncProgress(current.idx, nextCompleted);
    }
  }

  if (!lesson || !current) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Preview</CardTitle>
          <CardDescription>请先从左侧选择课程。</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">暂无可练习内容。</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BookOpen className="size-4" />
          句级拼写练习
        </CardTitle>
        <CardDescription>
          第 {idx + 1} / {lesson.sentences.length} 句
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border border-input bg-background p-3">
          <p className="text-xs text-muted-foreground">英文句子</p>
          <p className="mt-1 text-sm leading-relaxed">{current.text_en}</p>
          {showChinese ? (
            <>
              <p className="mt-3 text-xs text-muted-foreground">中文</p>
              <p className="mt-1 text-sm leading-relaxed">{current.text_zh || "(翻译失败，暂缺)"}</p>
            </>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={async () => {
              if (idx <= 0) return;
              const nextIdx = idx - 1;
              setIdx(nextIdx);
              await syncProgress(nextIdx, completedIndexes);
            }}
            disabled={idx <= 0}
          >
            <ArrowLeft className="size-4" />
            上一句
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              if (idx >= lesson.sentences.length - 1) return;
              const nextIdx = idx + 1;
              setIdx(nextIdx);
              await syncProgress(nextIdx, completedIndexes);
            }}
            disabled={idx >= lesson.sentences.length - 1}
          >
            下一句
            <ArrowRight className="size-4" />
          </Button>
          <Button variant="secondary" onClick={playCurrent} disabled={audioLoading}>
            {audioLoading ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            播放本句
          </Button>
        </div>

        <Textarea
          className="min-h-[120px]"
          placeholder="按空格分词输入，例如: hello world this is ..."
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
        />

        <Button onClick={checkAnswer}>检查拼写</Button>

        {checkResult?.token_results ? (
          <div className="rounded-md border border-input bg-background p-3">
            <p className="mb-2 text-xs text-muted-foreground">逐词结果</p>
            <div className="flex flex-wrap gap-2">
              {checkResult.token_results.map((item, i) => (
                <span
                  key={`${item.expected}-${i}`}
                  className={`rounded px-2 py-1 text-xs ${item.correct ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive"}`}
                >
                  {item.input || "(空)"} / {item.expected || "(空)"}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function App() {
  const isAdminRoute = window.location.pathname.startsWith("/admin");
  const [accessToken, setAccessToken] = useState(() => localStorage.getItem(TOKEN_KEY) || "");
  const [lessons, setLessons] = useState([]);
  const [currentLesson, setCurrentLesson] = useState(null);
  const [loadingLessons, setLoadingLessons] = useState(false);
  const [globalStatus, setGlobalStatus] = useState("");
  const [viewMode, setViewMode] = useState("dashboard");
  const [walletBalance, setWalletBalance] = useState(0);
  const [billingRates, setBillingRates] = useState([]);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [adminAuthState, setAdminAuthState] = useState("idle");

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
      setAdminAuthState("idle");
      setIsAdminUser(false);
      return;
    }
    setAdminAuthState("checking");
    const resp = await api("/api/admin/billing-rates", {}, accessToken);
    if (resp.ok) {
      setIsAdminUser(true);
      setAdminAuthState("ready");
      return;
    }
    if (resp.status === 403) {
      setIsAdminUser(false);
      setAdminAuthState("forbidden");
      return;
    }
    setIsAdminUser(false);
    setAdminAuthState("forbidden");
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
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    setAccessToken("");
    setLessons([]);
    setCurrentLesson(null);
    setGlobalStatus("");
    setViewMode("dashboard");
    setWalletBalance(0);
    setIsAdminUser(false);
    setAdminAuthState("idle");
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

  if (isAdminRoute) {
    if (!accessToken) {
      return (
        <div className="style-vega section-soft min-h-screen bg-background">
          <div className="container-wrapper py-8">
            <div className="container">
              <Card>
                <CardHeader>
                  <CardTitle>未登录</CardTitle>
                  <CardDescription>请先登录后再访问管理员后台。</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button onClick={() => { window.location.href = "/"; }}>返回学习页登录</Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      );
    }

    if (adminAuthState === "idle" || adminAuthState === "checking") {
      return (
        <div className="style-vega section-soft min-h-screen bg-background">
          <div className="container-wrapper py-8">
            <div className="container">
              <Card>
                <CardContent className="p-6">
                  <p className="text-sm text-muted-foreground">正在验证管理员权限...</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      );
    }

    if (!isAdminUser) {
      return (
        <div className="style-vega section-soft min-h-screen bg-background">
          <div className="container-wrapper py-8">
            <div className="container">
              <Card>
                <CardHeader>
                  <CardTitle>无管理员权限</CardTitle>
                  <CardDescription>当前账号不在 `ADMIN_EMAILS` 白名单中。</CardDescription>
                </CardHeader>
                <CardContent className="flex gap-2">
                  <Button variant="outline" onClick={() => { window.location.href = "/"; }}>返回学习页</Button>
                  <Button onClick={handleLogout}>退出登录</Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      );
    }

    return (
      <AdminApp
        apiCall={(path, options = {}) => api(path, options, accessToken)}
        onLogout={handleLogout}
      />
    );
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
              {accessToken ? <Badge variant="outline">余额 {walletBalance} 点</Badge> : null}
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
              <AuthPanel onAuthed={handleAuthed} />
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
