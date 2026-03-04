import { ArrowLeft, ArrowRight, BookOpen, Loader2, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { api, parseResponse } from "../../shared/api/client";
import { getLessonMedia } from "../../shared/media/localMediaStore";
import { Alert, AlertDescription, AlertTitle, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Textarea } from "../../shared/ui";

const LOCAL_MEDIA_REQUIRED_CODE = "LOCAL_MEDIA_REQUIRED";

function normalizeInputTokens(text) {
  return text
    .split(/\s+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function resolveMediaModeFromTypeAndName(contentType, fileName) {
  const normalizedType = String(contentType || "").toLowerCase();
  if (normalizedType.startsWith("video/")) return "video";
  if (normalizedType.startsWith("audio/")) return "audio";

  const normalizedFileName = String(fileName || "").toLowerCase();
  if (/(\.mp3|\.wav|\.m4a|\.flac|\.aac|\.ogg|\.opus)$/.test(normalizedFileName)) {
    return "audio";
  }
  return "video";
}

async function readErrorPayload(resp) {
  try {
    return await resp.clone().json();
  } catch (_) {
    return {};
  }
}

export function PracticePanel({ lesson, accessToken, onProgressSynced }) {
  const [idx, setIdx] = useState(0);
  const [completedIndexes, setCompletedIndexes] = useState([]);
  const [answer, setAnswer] = useState("");
  const [checkResult, setCheckResult] = useState(null);
  const [showChinese, setShowChinese] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const [mediaBlobUrl, setMediaBlobUrl] = useState("");
  const [mediaMode, setMediaMode] = useState("");
  const [mediaBindingRequired, setMediaBindingRequired] = useState(false);
  const [mediaNotice, setMediaNotice] = useState("");

  const current = lesson?.sentences?.[idx] || null;
  const clipAudioRef = useRef(new Audio());
  const clipUrlRef = useRef("");
  const segmentMediaRef = useRef(null);

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

  useEffect(() => {
    if (!lesson?.id) {
      setMediaBlobUrl("");
      setMediaMode("");
      setMediaBindingRequired(false);
      setMediaNotice("");
      return;
    }

    let canceled = false;
    let objectUrl = "";

    async function loadMainMedia() {
      setMediaBlobUrl("");
      setMediaMode("");
      setMediaBindingRequired(false);
      setMediaNotice("");

      try {
        const localMedia = await getLessonMedia(lesson.id);
        if (canceled) return;
        if (localMedia?.blob) {
          objectUrl = URL.createObjectURL(localMedia.blob);
          const localMode = resolveMediaModeFromTypeAndName(localMedia.media_type, localMedia.file_name || lesson.source_filename || "");
          setMediaBlobUrl(objectUrl);
          setMediaMode(localMode);
          console.debug("[DEBUG] practice.media.local_loaded", { lessonId: lesson.id });
          return;
        }
      } catch (error) {
        console.debug("[DEBUG] practice.media.local_read_failed", { lessonId: lesson.id, error: String(error) });
      }

      if (lesson.media_storage !== "server") {
        if (canceled) return;
        setMediaBindingRequired(true);
        setMediaNotice("当前课程媒体仅保存在浏览器本地，请先在沉浸模式绑定本地文件。");
        return;
      }

      try {
        const resp = await api(`/api/lessons/${lesson.id}/media`, {}, accessToken);
        if (!resp.ok) {
          if (canceled) return;
          const payload = await readErrorPayload(resp);
          if (canceled) return;
          if (Number(resp.status) === 404 || String(payload?.error_code || "") === LOCAL_MEDIA_REQUIRED_CODE) {
            setMediaBindingRequired(true);
            setMediaNotice("服务器媒体不可用，请先在沉浸模式绑定本地文件。");
            return;
          }
          setMediaBindingRequired(true);
          setMediaNotice(`媒体加载失败（${resp.status} ${payload?.error_code || ""}）。请先在沉浸模式绑定本地文件。`);
          return;
        }

        let blob = await resp.blob();
        const rawContentType = String(resp.headers.get("content-type") || "");
        if ((!rawContentType || rawContentType.startsWith("application/octet-stream")) && lesson.source_filename) {
          blob = new Blob([blob], { type: blob.type || "application/octet-stream" });
        }
        objectUrl = URL.createObjectURL(blob);
        if (canceled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        setMediaBlobUrl(objectUrl);
        setMediaMode(resolveMediaModeFromTypeAndName(blob.type || rawContentType, lesson.source_filename || ""));
      } catch (error) {
        if (canceled) return;
        setMediaBindingRequired(true);
        setMediaNotice(`媒体加载异常（${String(error)}），请先在沉浸模式绑定本地文件。`);
      }
    }

    loadMainMedia();

    return () => {
      canceled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [accessToken, lesson?.id, lesson?.media_storage, lesson?.source_filename]);

  useEffect(() => {
    if (!mediaBlobUrl || !mediaMode || mediaMode === "clip") {
      segmentMediaRef.current = null;
      return;
    }

    const media = document.createElement(mediaMode === "video" ? "video" : "audio");
    media.preload = "metadata";
    media.src = mediaBlobUrl;
    segmentMediaRef.current = media;

    return () => {
      media.pause();
      media.src = "";
      if (segmentMediaRef.current === media) {
        segmentMediaRef.current = null;
      }
    };
  }, [mediaBlobUrl, mediaMode]);

  useEffect(() => {
    return () => {
      if (clipUrlRef.current) {
        URL.revokeObjectURL(clipUrlRef.current);
        clipUrlRef.current = "";
      }
      const clipAudio = clipAudioRef.current;
      clipAudio.pause();
      clipAudio.src = "";
      const segmentMedia = segmentMediaRef.current;
      if (segmentMedia) {
        segmentMedia.pause();
        segmentMedia.src = "";
      }
    };
  }, []);

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

  async function playByMainMedia() {
    const media = segmentMediaRef.current;
    if (!media || !current) {
      return false;
    }

    const startSec = Math.max(0, Number(current.begin_ms || 0) / 1000);
    const endSec = Math.max(startSec + 0.1, Number(current.end_ms || 0) / 1000);

    const onTimeUpdate = () => {
      if (media.currentTime >= endSec) {
        media.pause();
        media.removeEventListener("timeupdate", onTimeUpdate);
      }
    };

    media.removeEventListener("timeupdate", onTimeUpdate);
    media.addEventListener("timeupdate", onTimeUpdate);
    media.currentTime = startSec;
    await media.play();
    return true;
  }

  async function playBySentenceAudioFallback() {
    if (!current?.audio_url || lesson?.media_storage !== "server") {
      return false;
    }

    const audioResp = await api(current.audio_url, {}, accessToken);
    if (!audioResp.ok) {
      const payload = await readErrorPayload(audioResp);
      if (Number(audioResp.status) === 404 || String(payload?.error_code || "") === LOCAL_MEDIA_REQUIRED_CODE) {
        setMediaBindingRequired(true);
        setMediaNotice("句级音频不可用，请先在沉浸模式绑定本地文件。");
      }
      return false;
    }

    const clipBlob = await audioResp.blob();
    const clipUrl = URL.createObjectURL(clipBlob);
    if (clipUrlRef.current) {
      URL.revokeObjectURL(clipUrlRef.current);
    }
    clipUrlRef.current = clipUrl;
    const clipAudio = clipAudioRef.current;
    clipAudio.pause();
    clipAudio.src = clipUrl;
    clipAudio.onended = () => {
      URL.revokeObjectURL(clipUrl);
      if (clipUrlRef.current === clipUrl) {
        clipUrlRef.current = "";
      }
    };
    clipAudio.onerror = () => {
      URL.revokeObjectURL(clipUrl);
      if (clipUrlRef.current === clipUrl) {
        clipUrlRef.current = "";
      }
    };
    await clipAudio.play();
    return true;
  }

  async function playCurrent() {
    if (!current) {
      return;
    }
    setAudioLoading(true);
    try {
      if (mediaBlobUrl && mediaMode && mediaMode !== "clip") {
        const played = await playByMainMedia();
        if (played) {
          setMediaNotice("");
          return;
        }
      }

      const fallbackPlayed = await playBySentenceAudioFallback();
      if (fallbackPlayed) {
        setMediaNotice("已回退到服务端句级音频播放。");
        return;
      }

      setMediaBindingRequired(true);
      setMediaNotice("当前课程无可播放媒体，请先在沉浸模式绑定本地文件。");
    } catch (error) {
      setMediaNotice(`播放失败：${String(error)}`);
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
          <CardTitle className="text-base">学习区预览</CardTitle>
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
        {mediaBindingRequired ? (
          <Alert>
            <AlertTitle>待绑定本地媒体</AlertTitle>
            <AlertDescription>{mediaNotice || "当前课程可见，但播放受限。请先在沉浸模式绑定本地文件。"}</AlertDescription>
          </Alert>
        ) : null}

        <Alert>
          <AlertTitle>句子内容</AlertTitle>
          <AlertDescription>
            <p className="text-sm leading-relaxed">{current.text_en}</p>
            {showChinese ? (
              <p className="mt-2 text-sm text-muted-foreground">{current.text_zh || "(翻译失败，暂缺)"}</p>
            ) : null}
          </AlertDescription>
        </Alert>

        <div className="flex flex-wrap items-center gap-2">
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
          <Badge variant="outline">已通过 {completedIndexes.length} 句</Badge>
          {mediaNotice ? <p className="text-xs text-muted-foreground">{mediaNotice}</p> : null}
        </div>

        <Textarea
          className="min-h-[120px]"
          placeholder="按空格分词输入，例如: hello world this is ..."
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
        />

        <Button onClick={checkAnswer}>检查拼写</Button>

        {checkResult?.token_results ? (
          <Alert variant={checkResult.passed ? "success" : "destructive"}>
            <AlertTitle>{checkResult.passed ? "通过" : "未通过"}</AlertTitle>
            <AlertDescription>
              <div className="mt-1 flex flex-wrap gap-2">
                {checkResult.token_results.map((item, i) => (
                  <Badge key={`${item.expected}-${i}`} variant={item.correct ? "secondary" : "destructive"}>
                    {item.input || "(空)"} / {item.expected || "(空)"}
                  </Badge>
                ))}
              </div>
            </AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}

