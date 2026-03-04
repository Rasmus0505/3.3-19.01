import { ArrowLeft, ArrowRight, BookOpen, Loader2, Play } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { api, parseResponse } from "../../shared/api/client";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Textarea } from "../../shared/ui";

function normalizeInputTokens(text) {
  return text
    .split(/\s+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export function PracticePanel({ lesson, accessToken, onProgressSynced }) {
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
