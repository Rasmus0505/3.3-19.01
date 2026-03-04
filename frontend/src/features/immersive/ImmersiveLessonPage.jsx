import { ArrowLeft, Loader2, Play, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { isAudioFilename, isVideoFilename, normalizeToken } from "./tokenNormalize";
import { useSentencePlayback } from "./useSentencePlayback";
import { useTypingFeedbackSounds } from "./useTypingFeedbackSounds";
import "./immersive.css";

function createWordState(tokens) {
  const safeTokens = Array.isArray(tokens) ? tokens : [];
  return {
    activeWordIndex: 0,
    currentWordInput: "",
    wordInputs: safeTokens.map(() => ""),
    wordStatuses: safeTokens.map((_, idx) => (idx === 0 ? "active" : "pending")),
  };
}

export function ImmersiveLessonPage({ lesson, accessToken, apiClient, onBack, onProgressSynced }) {
  const [phase, setPhase] = useState("idle");
  const [mediaMode, setMediaMode] = useState("clip");
  const [mediaBlobUrl, setMediaBlobUrl] = useState("");
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaReady, setMediaReady] = useState(false);
  const [mediaError, setMediaError] = useState("");
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0);
  const [completedIndexes, setCompletedIndexes] = useState([]);
  const [activeWordIndex, setActiveWordIndex] = useState(0);
  const [currentWordInput, setCurrentWordInput] = useState("");
  const [wordInputs, setWordInputs] = useState([]);
  const [wordStatuses, setWordStatuses] = useState([]);
  const [wordLocked, setWordLocked] = useState(false);

  const mediaElementRef = useRef(null);
  const clipAudioRef = useRef(null);
  const typingInputRef = useRef(null);
  const wrongResetTimerRef = useRef(null);

  const currentSentence = lesson?.sentences?.[currentSentenceIndex] || null;
  const expectedTokens = useMemo(() => (Array.isArray(currentSentence?.tokens) ? currentSentence.tokens : []), [currentSentence?.tokens]);
  const sentenceCount = lesson?.sentences?.length || 0;

  const { playKeySound, playWrongSound, playCorrectSound } = useTypingFeedbackSounds();

  const syncProgress = useCallback(
    async (nextIndex, nextCompleted, lastPlayedAtMs) => {
      if (!lesson) return;
      try {
        await apiClient(
          `/api/lessons/${lesson.id}/progress`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              current_sentence_index: Math.max(0, nextIndex),
              completed_sentence_indexes: nextCompleted,
              last_played_at_ms: Math.max(0, Number(lastPlayedAtMs || 0)),
            }),
          },
          accessToken,
        );
      } catch (error) {
        // Ignore sync errors to avoid interrupting learning flow.
      }
    },
    [accessToken, apiClient, lesson],
  );

  const handleSentencePassed = useCallback(async () => {
    if (!lesson || !currentSentence) return;

    const nextCompleted = Array.from(new Set([...completedIndexes, currentSentence.idx])).sort((a, b) => a - b);
    setCompletedIndexes(nextCompleted);

    const nextIdx = currentSentenceIndex + 1;
    const lastIdx = Math.max(0, sentenceCount - 1);
    const progressIdx = Math.min(nextIdx, lastIdx);
    await syncProgress(progressIdx, nextCompleted, currentSentence.end_ms);
    onProgressSynced?.();

    if (nextIdx > lastIdx) {
      setPhase("lesson_completed");
      return;
    }

    setCurrentSentenceIndex(nextIdx);
    setPhase("auto_play_pending");
  }, [completedIndexes, currentSentence, currentSentenceIndex, lesson, onProgressSynced, sentenceCount, syncProgress]);

  const onSentenceFinished = useCallback(() => {
    if (!expectedTokens.length) {
      handleSentencePassed();
      return;
    }
    setPhase("typing");
  }, [expectedTokens.length, handleSentencePassed]);

  const { isPlaying, playSentence, stopPlayback, onMainMediaTimeUpdate } = useSentencePlayback({
    mode: mediaMode,
    mediaElementRef,
    clipAudioRef,
    apiClient,
    accessToken,
    onSentenceFinished,
  });

  const resetWordTyping = useCallback((sentence) => {
    const next = createWordState(sentence?.tokens || []);
    setActiveWordIndex(next.activeWordIndex);
    setCurrentWordInput(next.currentWordInput);
    setWordInputs(next.wordInputs);
    setWordStatuses(next.wordStatuses);
    setWordLocked(false);
  }, []);

  const tryPlayCurrentSentence = useCallback(
    async ({ manual = false } = {}) => {
      if (!currentSentence) return;
      resetWordTyping(currentSentence);
      const result = await playSentence(currentSentence);
      if (result.ok) {
        setMediaError("");
        setPhase("playing");
        return;
      }
      if (result.reason === "autoplay_blocked") {
        setPhase("autoplay_blocked");
        if (manual) {
          setMediaError("浏览器阻止了自动播放，请再次点击播放。");
        }
        return;
      }
      setMediaError("当前句播放失败，已切换为输入模式。");
      setPhase("typing");
    },
    [currentSentence, playSentence, resetWordTyping],
  );

  useEffect(() => {
    if (!lesson) return;

    if (wrongResetTimerRef.current) {
      clearTimeout(wrongResetTimerRef.current);
      wrongResetTimerRef.current = null;
    }
    stopPlayback();
    setMediaError("");
    setMediaReady(false);
    setMediaLoading(false);

    const savedIdx = Number.isInteger(lesson?.progress?.current_sentence_index) ? lesson.progress.current_sentence_index : 0;
    const safeIdx = Math.min(Math.max(savedIdx, 0), Math.max(0, (lesson?.sentences?.length || 1) - 1));
    const savedCompleted = Array.isArray(lesson?.progress?.completed_sentence_indexes)
      ? Array.from(new Set(lesson.progress.completed_sentence_indexes)).sort((a, b) => a - b)
      : [];
    setCurrentSentenceIndex(safeIdx);
    setCompletedIndexes(savedCompleted);
    resetWordTyping(lesson?.sentences?.[safeIdx]);
    setPhase("idle");

    const fileName = String(lesson.source_filename || "");
    if (isVideoFilename(fileName)) {
      setMediaMode("video");
    } else if (isAudioFilename(fileName)) {
      setMediaMode("audio");
    } else {
      setMediaMode("clip");
    }
  }, [lesson?.id, resetWordTyping, stopPlayback]);

  useEffect(() => {
    if (!lesson) return;
    let canceled = false;
    let objectUrl = "";

    async function loadMediaBlob() {
      if (mediaMode === "clip") {
        setMediaBlobUrl("");
        setMediaReady(true);
        setMediaLoading(false);
        setPhase("auto_play_pending");
        return;
      }

      setMediaLoading(true);
      setMediaReady(false);
      setPhase("idle");
      try {
        const resp = await apiClient(`/api/lessons/${lesson.id}/media`, {}, accessToken);
        if (!resp.ok) {
          if (canceled) return;
          setMediaMode("clip");
          setMediaError("媒体加载失败，已自动降级为音频模式。");
          return;
        }
        const blob = await resp.blob();
        objectUrl = URL.createObjectURL(blob);
        if (canceled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        setMediaBlobUrl(objectUrl);
        setMediaLoading(false);
      } catch (error) {
        if (canceled) return;
        setMediaMode("clip");
        setMediaError("媒体加载异常，已自动降级为音频模式。");
      } finally {
        if (!canceled) {
          setMediaLoading(false);
        }
      }
    }

    loadMediaBlob();

    return () => {
      canceled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [accessToken, apiClient, lesson?.id, mediaMode]);

  useEffect(() => {
    if (mediaMode === "clip") return;
    if (!mediaReady) return;
    if (!mediaBlobUrl) return;
    setPhase("auto_play_pending");
  }, [mediaBlobUrl, mediaMode, mediaReady]);

  useEffect(() => {
    if (!currentSentence) return;
    if (phase !== "auto_play_pending") return;
    if (mediaMode !== "clip" && !mediaReady) return;
    tryPlayCurrentSentence();
  }, [currentSentence, mediaMode, mediaReady, phase, tryPlayCurrentSentence]);

  useEffect(() => {
    if (phase !== "typing") return;
    typingInputRef.current?.focus();
  }, [phase, currentSentenceIndex]);

  useEffect(() => {
    return () => {
      if (wrongResetTimerRef.current) {
        clearTimeout(wrongResetTimerRef.current);
      }
    };
  }, []);

  const handleMainMediaError = useCallback(() => {
    setMediaMode("clip");
    setMediaError("当前浏览器不支持该媒体格式，已自动切换为音频模式。");
    setPhase("auto_play_pending");
  }, [lesson?.id]);

  const handleKeyDown = useCallback(
    (event) => {
      if (phase !== "typing" || wordLocked || !currentSentence) return;

      const key = event.key;
      if (key === " " || key === "Enter") {
        event.preventDefault();
        const expected = expectedTokens[activeWordIndex] || "";
        if (!expected) return;

        const actualNormalized = normalizeToken(currentWordInput);
        if (actualNormalized === expected) {
          playCorrectSound();
          setWordStatuses((prev) => {
            const next = [...prev];
            next[activeWordIndex] = "correct";
            if (activeWordIndex + 1 < expectedTokens.length) {
              next[activeWordIndex + 1] = "active";
            }
            return next;
          });
          setWordInputs((prev) => {
            const next = [...prev];
            next[activeWordIndex] = currentWordInput.trim();
            return next;
          });
          setCurrentWordInput("");

          if (activeWordIndex + 1 >= expectedTokens.length) {
            setPhase("transition");
            setTimeout(() => {
              handleSentencePassed();
            }, 120);
            return;
          }
          setActiveWordIndex((prev) => prev + 1);
          return;
        }

        playWrongSound();
        setWordLocked(true);
        setWordStatuses((prev) => {
          const next = [...prev];
          next[activeWordIndex] = "wrong";
          return next;
        });
        setWordInputs((prev) => {
          const next = [...prev];
          next[activeWordIndex] = currentWordInput.trim();
          return next;
        });

        if (wrongResetTimerRef.current) {
          clearTimeout(wrongResetTimerRef.current);
        }
        wrongResetTimerRef.current = setTimeout(() => {
          setCurrentWordInput("");
          setWordInputs((prev) => {
            const next = [...prev];
            next[activeWordIndex] = "";
            return next;
          });
          setWordStatuses((prev) => {
            const next = [...prev];
            next[activeWordIndex] = "active";
            return next;
          });
          setWordLocked(false);
        }, 300);
        return;
      }

      if (key === "Backspace") {
        event.preventDefault();
        playKeySound();
        setCurrentWordInput((prev) => {
          const next = prev.slice(0, -1);
          setWordInputs((old) => {
            const copied = [...old];
            copied[activeWordIndex] = next;
            return copied;
          });
          return next;
        });
        return;
      }

      if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        playKeySound();
        setCurrentWordInput((prev) => {
          const next = prev + key;
          setWordInputs((old) => {
            const copied = [...old];
            copied[activeWordIndex] = next;
            return copied;
          });
          return next;
        });
      }
    },
    [
      activeWordIndex,
      currentSentence,
      currentWordInput,
      expectedTokens,
      handleSentencePassed,
      phase,
      playCorrectSound,
      playKeySound,
      playWrongSound,
      wordLocked,
    ],
  );

  if (!lesson || !currentSentence) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">沉浸学习</CardTitle>
          <CardDescription>当前课程暂无可学习句子。</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const phaseLabelMap = {
    idle: "准备中",
    auto_play_pending: "即将播放",
    playing: "播放中",
    autoplay_blocked: "等待点击播放",
    typing: "输入中",
    transition: "切换下一句",
    lesson_completed: "已完成",
  };

  return (
    <Card className="immersive-page" onClick={() => typingInputRef.current?.focus()}>
      <CardHeader>
        <div className="immersive-header">
          <div>
            <CardTitle className="text-base">沉浸式句子拼写学习</CardTitle>
            <CardDescription>
              第 {Math.min(currentSentenceIndex + 1, sentenceCount)} / {sentenceCount} 句
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{phaseLabelMap[phase] || "学习中"}</Badge>
            <Button variant="outline" size="sm" onClick={onBack}>
              <ArrowLeft className="size-4" />
              返回
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="immersive-media">
          {mediaMode === "video" ? (
            <video
              ref={mediaElementRef}
              src={mediaBlobUrl || undefined}
              onCanPlay={() => setMediaReady(true)}
              onError={handleMainMediaError}
              onTimeUpdate={onMainMediaTimeUpdate}
              controls
              playsInline
            />
          ) : null}

          {mediaMode === "audio" ? (
            <div className="w-full px-6">
              <div className="immersive-media-audio-placeholder">
                <p>音频素材模式</p>
                <p className="immersive-hint">将按句自动播放并在下方拼写</p>
              </div>
              <audio
                ref={mediaElementRef}
                src={mediaBlobUrl || undefined}
                onCanPlay={() => setMediaReady(true)}
                onError={handleMainMediaError}
                onTimeUpdate={onMainMediaTimeUpdate}
                controls
              />
            </div>
          ) : null}

          {mediaMode === "clip" ? (
            <div className="w-full px-6">
              <div className="immersive-media-audio-placeholder">
                <p>音频降级模式</p>
                <p className="immersive-hint">媒体格式不兼容，已改为逐句音频播放</p>
              </div>
              <audio ref={clipAudioRef} controls />
            </div>
          ) : null}

          {mediaLoading ? (
            <div className="immersive-overlay">
              <Button variant="secondary" disabled>
                <Loader2 className="size-4 animate-spin" />
                媒体加载中
              </Button>
            </div>
          ) : null}

          {phase === "autoplay_blocked" ? (
            <div className="immersive-overlay">
              <Button onClick={() => tryPlayCurrentSentence({ manual: true })}>
                <Play className="size-4" />
                点击开始本句播放
              </Button>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => tryPlayCurrentSentence({ manual: true })} disabled={mediaLoading || phase === "transition"}>
            <RotateCcw className="size-4" />
            重播本句
          </Button>
          <Badge variant="outline">
            已完成 {completedIndexes.length} / {sentenceCount}
          </Badge>
          {isPlaying ? <Badge variant="secondary">正在播放本句</Badge> : null}
          {mediaError ? <p className="text-xs text-destructive">{mediaError}</p> : null}
        </div>

        <div className="immersive-typing">
          <div className="immersive-word-row">
            {expectedTokens.map((token, index) => {
              const width = Math.max(56, token.length * 14);
              const status = wordStatuses[index] || "pending";
              const display = wordInputs[index] || "\u00A0";
              return (
                <div
                  key={`${token}-${index}`}
                  className={`immersive-word-chip immersive-word-chip--${status}`}
                  style={{ "--word-width": `${width}px` }}
                >
                  {display}
                </div>
              );
            })}
          </div>

          <p className="immersive-hint">空格或 Enter 提交当前单词；输入错误会红色提示并重打该词。</p>
          <p className="text-sm text-muted-foreground">
            当前句中文：{currentSentence.text_zh || "(翻译失败，暂缺)"}
          </p>
          {phase === "lesson_completed" ? <p className="text-sm text-primary">课程已完成，恭喜你！</p> : null}
        </div>

        <input
          ref={typingInputRef}
          className="immersive-hidden-input"
          value={currentWordInput}
          onChange={() => {}}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (phase === "typing") {
              setTimeout(() => {
                typingInputRef.current?.focus();
              }, 0);
            }
          }}
          autoComplete="off"
          spellCheck={false}
          readOnly={phase !== "typing"}
        />
      </CardContent>
    </Card>
  );
}
