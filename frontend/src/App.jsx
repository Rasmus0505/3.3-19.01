import { ArrowLeft, ArrowRight, Loader2, LogOut, Play, UploadCloud } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "./components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { Textarea } from "./components/ui/textarea";

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
      const data = await resp.json();
      if (!resp.ok) {
        setStatus(`${data.error_code || "ERROR"}: ${data.message || "请求失败"}`);
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
        <input className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" placeholder="邮箱" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          placeholder="密码（至少6位）"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <div className="flex gap-2">
          <Button disabled={loading} onClick={() => submit("/api/auth/login")}>
            登录
          </Button>
          <Button variant="outline" disabled={loading} onClick={() => submit("/api/auth/register")}>
            注册
          </Button>
        </div>
        {status ? <p className="text-sm text-muted-foreground">{status}</p> : null}
      </CardContent>
    </Card>
  );
}

function UploadPanel({ accessToken, onCreated }) {
  const [file, setFile] = useState(null);
  const [model, setModel] = useState(ASR_MODELS[0].value);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

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
      const data = await resp.json();
      if (!resp.ok) {
        setStatus(`${data.error_code || "ERROR"}: ${data.message || "生成失败"}`);
        return;
      }
      setStatus("生成成功");
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
          <UploadCloud className="h-4 w-4" />
          导入素材并生成练习
        </CardTitle>
        <CardDescription>流程：抽音频 → ASR（时间戳）→ 逐句对齐 → 中文翻译。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={model} onChange={(e) => setModel(e.target.value)} disabled={loading}>
          {ASR_MODELS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <input className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} disabled={loading} />
        <Button onClick={submit} disabled={loading}>
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              生成中
            </span>
          ) : (
            "开始生成课程"
          )}
        </Button>
        {status ? <p className="text-sm text-muted-foreground">{status}</p> : null}
      </CardContent>
    </Card>
  );
}

function LessonList({ lessons, currentLessonId, onSelect }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>我的课程</CardTitle>
        <CardDescription>选择一个课程进入逐句拼写练习。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {lessons.length === 0 ? <p className="text-sm text-muted-foreground">暂无课程，请先上传素材。</p> : null}
        {lessons.map((lesson) => (
          <button
            key={lesson.id}
            className={`w-full rounded-md border p-3 text-left text-sm ${
              currentLessonId === lesson.id ? "border-primary bg-primary/10" : "border-input bg-background hover:bg-muted/30"
            }`}
            onClick={() => onSelect(lesson.id)}
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

  async function syncProgress(nextIndex, completedIndexes = []) {
    const payload = {
      current_sentence_index: nextIndex,
      completed_sentence_indexes: completedIndexes,
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
    const data = await resp.json();
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
          <CardTitle>开始练习</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">请先选择课程。</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>句级拼写练习</CardTitle>
        <CardDescription>
          第 {idx + 1} / {lesson.sentences.length} 句
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border border-input bg-background p-3">
          <p className="text-xs text-muted-foreground">英文句子</p>
          <p className="mt-1 text-sm">{current.text_en}</p>
          {showChinese ? (
            <>
              <p className="mt-3 text-xs text-muted-foreground">中文</p>
              <p className="mt-1 text-sm">{current.text_zh || "(翻译失败，暂缺)"}</p>
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
            <ArrowLeft className="mr-1 h-4 w-4" />
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
            <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
          <Button variant="secondary" onClick={playCurrent} disabled={audioLoading}>
            {audioLoading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Play className="mr-1 h-4 w-4" />}
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
                  className={`rounded px-2 py-1 text-xs ${
                    item.correct ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive"
                  }`}
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
  const [accessToken, setAccessToken] = useState(() => localStorage.getItem(TOKEN_KEY) || "");
  const [lessons, setLessons] = useState([]);
  const [currentLesson, setCurrentLesson] = useState(null);
  const [loadingLessons, setLoadingLessons] = useState(false);
  const [globalStatus, setGlobalStatus] = useState("");

  async function loadLessons() {
    if (!accessToken) {
      setLessons([]);
      setCurrentLesson(null);
      return;
    }
    setLoadingLessons(true);
    try {
      const listResp = await api("/api/lessons", {}, accessToken);
      const listData = await listResp.json();
      if (!listResp.ok) {
        setGlobalStatus(`${listData.error_code || "ERROR"}: ${listData.message || "加载课程失败"}`);
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
    const detailData = await detailResp.json();
    const progressData = await progressResp.json();
    if (!detailResp.ok) {
      setGlobalStatus(`${detailData.error_code || "ERROR"}: ${detailData.message || "加载课程详情失败"}`);
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

  useEffect(() => {
    loadLessons();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  function handleAuthed() {
    setAccessToken(localStorage.getItem(TOKEN_KEY) || "");
  }

  function handleLogout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    setAccessToken("");
    setLessons([]);
    setCurrentLesson(null);
    setGlobalStatus("");
  }

  async function handleLessonCreated(lesson) {
    await loadLessons();
    setCurrentLesson(lesson);
  }

  return (
    <div className="min-h-screen bg-muted/30 px-4 py-8 md:px-8">
      <div className="mx-auto max-w-6xl space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>English Sentence Spelling Trainer</CardTitle>
            <CardDescription>上传素材 → 自动转写与翻译 → 逐句拼写练习（登录同步进度）</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">{accessToken ? "已登录" : "未登录"}</div>
            {accessToken ? (
              <Button variant="outline" onClick={handleLogout}>
                <LogOut className="mr-1 h-4 w-4" />
                退出
              </Button>
            ) : null}
          </CardContent>
        </Card>

        {!accessToken ? <AuthPanel onAuthed={handleAuthed} /> : null}

        {accessToken ? (
          <>
            <UploadPanel accessToken={accessToken} onCreated={handleLessonCreated} />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
              <LessonList lessons={lessons} currentLessonId={currentLesson?.id} onSelect={loadLessonDetail} />
              <PracticePanel lesson={currentLesson} accessToken={accessToken} onProgressSynced={loadLessons} />
            </div>
          </>
        ) : null}

        {loadingLessons ? <p className="text-sm text-muted-foreground">课程加载中...</p> : null}
        {globalStatus ? <p className="text-sm text-destructive">{globalStatus}</p> : null}
      </div>
    </div>
  );
}
