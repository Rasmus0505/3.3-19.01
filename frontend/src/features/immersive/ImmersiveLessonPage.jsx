import { ArrowLeft, Loader2, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Switch } from "../../shared/ui";
import { getMediaExt, isAudioFilename, isVideoFilename, normalizeToken } from "./tokenNormalize";
import { useSentencePlayback } from "./useSentencePlayback";
import { useTypingFeedbackSounds } from "./useTypingFeedbackSounds";
import "./immersive.css";

const DISPLAY_MODE_STORAGE_KEY = "immersive_word_display_mode";
const MEDIA_TYPE_BY_EXTENSION = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
  ".avi": "video/x-msvideo",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".flac": "audio/flac",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg; codecs=opus",
};

function getInitialDisplayMode() {
  if (typeof window === "undefined") return "underline";
  const saved = window.localStorage.getItem(DISPLAY_MODE_STORAGE_KEY);
  return saved === "chip" || saved === "underline" ? saved : "underline";
}

function countTokenInputErrors(inputValue, expectedToken) {
  const actual = String(inputValue || "");
  const expected = String(expectedToken || "");
  const sameLength = Math.min(actual.length, expected.length);

  let mismatchCount = 0;
  for (let idx = 0; idx < sameLength; idx += 1) {
    if (actual[idx]?.toLowerCase() !== expected[idx]?.toLowerCase()) {
      mismatchCount += 1;
    }
  }

  if (actual.length > expected.length) {
    mismatchCount += actual.length - expected.length;
  }
  return mismatchCount;
}

function buildLetterSlots(expectedToken, inputValue) {
  const expected = String(expectedToken || "");
  const actual = String(inputValue || "");
  const slots = [];

  for (let idx = 0; idx < expected.length; idx += 1) {
    const typedChar = actual[idx] || "";
    let state = "empty";
    if (typedChar) {
      state = typedChar.toLowerCase() === expected[idx].toLowerCase() ? "correct" : "wrong";
    }
    slots.push({
      key: `slot-${idx}`,
      char: typedChar || "\u00A0",
      state,
      extra: false,
    });
  }

  for (let idx = expected.length; idx < actual.length; idx += 1) {
    slots.push({
      key: `extra-${idx}`,
      char: actual[idx] || "\u00A0",
      state: "wrong",
      extra: true,
    });
  }

  if (!slots.length) {
    return [{ key: "slot-empty", char: "\u00A0", state: "empty", extra: false }];
  }
  return slots;
}

function createWordState(tokens) {
  const safeTokens = Array.isArray(tokens) ? tokens : [];
  return {
    activeWordIndex: 0,
    currentWordInput: "",
    wordInputs: safeTokens.map(() => ""),
    wordStatuses: safeTokens.map((_, idx) => (idx === 0 ? "active" : "pending")),
  };
}

function resolveMediaModeFromFileName(fileName) {
  if (isAudioFilename(fileName)) {
    return "audio";
  }
  // Unknown extensions should still try loading main media once.
  return "video";
}

function inferMediaModeFromContentType(contentType) {
  const normalized = String(contentType || "").toLowerCase();
  if (normalized.startsWith("video/")) {
    return "video";
  }
  if (normalized.startsWith("audio/")) {
    return "audio";
  }
  return "";
}

function inferMediaTypeFromFileName(fileName) {
  const ext = getMediaExt(fileName);
  return MEDIA_TYPE_BY_EXTENSION[ext] || "";
}

async function readErrorPayload(resp) {
  try {
    return await resp.clone().json();
  } catch (_) {
    return {};
  }
}

function formatMediaLoadError(resp, payload) {
  const statusText = Number(resp?.status) > 0 ? String(resp.status) : "";
  const errorCode = String(payload?.error_code || "").trim();
  const message = String(payload?.message || "").trim();
  const head = [statusText, errorCode].filter(Boolean).join(" ");
  if (head && message) {
    return `媒体加载失败（${head}: ${message}），已自动降级为音频模式。`;
  }
  if (head) {
    return `媒体加载失败（${head}），已自动降级为音频模式。`;
  }
  if (message) {
    return `媒体加载失败（${message}），已自动降级为音频模式。`;
  }
  return "媒体加载失败，已自动降级为音频模式。";
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
  const [displayMode, setDisplayMode] = useState(() => getInitialDisplayMode());

  const mediaElementRef = useRef(null);
  const clipAudioRef = useRef(null);
  const typingInputRef = useRef(null);
  const currentWordInputRef = useRef("");
  const focusTypingInput = useCallback(() => {
    if (phase !== "typing") return;
    requestAnimationFrame(() => {
      const input = typingInputRef.current;
      if (!input) return;
      input.focus({ preventScroll: true });
      const len = String(input.value || "").length;
      try {
        input.setSelectionRange(len, len);
      } catch (_) {
        // Ignore selection errors for unsupported input types/browsers.
      }
    });
  }, [phase]);

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
    currentWordInputRef.current = "";
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
        setPhase("typing");
        setMediaError(
          manual
            ? "浏览器仍阻止自动播放，可继续输入，或稍后点击“重播本句”。"
            : "自动播放受限，可直接输入，或点击“重播本句”手动播放。",
        );
        return;
      }
      setMediaError("当前句播放失败，已切换为输入模式。");
      setPhase("typing");
    },
    [currentSentence, playSentence, resetWordTyping],
  );

  useEffect(() => {
    if (!lesson) return;
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
    const preferredMode = isVideoFilename(fileName) ? "video" : resolveMediaModeFromFileName(fileName);
    setMediaMode(preferredMode);
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
      setMediaError("");
      setPhase("idle");
      try {
        const resp = await apiClient(`/api/lessons/${lesson.id}/media`, {}, accessToken);
        if (!resp.ok) {
          if (canceled) return;
          const payload = await readErrorPayload(resp);
          if (canceled) return;
          setMediaMode("clip");
          setMediaError(formatMediaLoadError(resp, payload));
          return;
        }
        const rawContentType = String(resp.headers.get("content-type") || "").toLowerCase();
        const inferredMode = inferMediaModeFromContentType(rawContentType);
        if (inferredMode && inferredMode !== mediaMode) {
          setMediaMode(inferredMode);
        }
        let blob = await resp.blob();
        const fallbackType = inferMediaTypeFromFileName(lesson?.source_filename || "");
        const needsTypeOverride =
          (!rawContentType || rawContentType.startsWith("application/octet-stream")) && Boolean(fallbackType);
        if (needsTypeOverride) {
          blob = new Blob([blob], { type: fallbackType });
        }
        objectUrl = URL.createObjectURL(blob);
        if (canceled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        setMediaBlobUrl(objectUrl);
        setMediaLoading(false);
      } catch (error) {
        if (canceled) return;
        const detail = String(error || "").trim();
        setMediaMode("clip");
        setMediaError(detail ? `媒体加载异常（${detail}），已自动降级为音频模式。` : "媒体加载异常，已自动降级为音频模式。");
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
    focusTypingInput();
  }, [activeWordIndex, currentSentenceIndex, focusTypingInput, phase]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(DISPLAY_MODE_STORAGE_KEY, displayMode);
  }, [displayMode]);

  const handleMainMediaError = useCallback(() => {
    setMediaMode("clip");
    setMediaError("当前浏览器不支持该媒体格式，已自动切换为音频模式。");
    setPhase("auto_play_pending");
  }, [lesson?.id]);

  const clearActiveWordInput = useCallback(() => {
    currentWordInputRef.current = "";
    setCurrentWordInput("");
    setWordInputs((prev) => {
      const next = [...prev];
      if (activeWordIndex < next.length) {
        next[activeWordIndex] = "";
      }
      return next;
    });
    setWordStatuses((prev) => {
      const next = [...prev];
      if (activeWordIndex < next.length) {
        next[activeWordIndex] = "active";
      }
      return next;
    });
  }, [activeWordIndex]);

  const commitCorrectWord = useCallback(
    (typedWord) => {
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
        next[activeWordIndex] = typedWord.trim();
        return next;
      });
      currentWordInputRef.current = "";
      setCurrentWordInput("");

      if (activeWordIndex + 1 >= expectedTokens.length) {
        setPhase("transition");
        setTimeout(() => {
          handleSentencePassed();
        }, 120);
        return;
      }
      setActiveWordIndex((prev) => prev + 1);
    },
    [activeWordIndex, expectedTokens.length, handleSentencePassed, playCorrectSound],
  );

  const commitWrongWord = useCallback(() => {
    playWrongSound();
    clearActiveWordInput();
  }, [clearActiveWordInput, playWrongSound]);

  const handleKeyDown = useCallback(
    (event) => {
      if (phase !== "typing" || !currentSentence) return;

      const key = event.key;
      if (key === " " || key === "Enter") {
        event.preventDefault();
        return;
      }

      if (key === "Backspace") {
        event.preventDefault();
        playKeySound();
        const nextInput = currentWordInputRef.current.slice(0, -1);
        currentWordInputRef.current = nextInput;
        setCurrentWordInput(nextInput);
        setWordInputs((prev) => {
          const next = [...prev];
          next[activeWordIndex] = nextInput;
          return next;
        });
        setWordStatuses((prev) => {
          const next = [...prev];
          next[activeWordIndex] = "active";
          return next;
        });
        return;
      }

      if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        playKeySound();
        const expected = expectedTokens[activeWordIndex] || "";
        if (!expected) return;

        const nextInput = `${currentWordInputRef.current}${key}`;
        currentWordInputRef.current = nextInput;
        setCurrentWordInput(nextInput);
        setWordInputs((prev) => {
          const next = [...prev];
          next[activeWordIndex] = nextInput;
          return next;
        });
        setWordStatuses((prev) => {
          const next = [...prev];
          next[activeWordIndex] = "active";
          return next;
        });

        const errorCount = countTokenInputErrors(nextInput, expected);
        if (errorCount > 2) {
          commitWrongWord();
          return;
        }

        if (nextInput.length >= expected.length) {
          const normalizedInput = normalizeToken(nextInput);
          if (normalizedInput === expected) {
            commitCorrectWord(nextInput);
          } else {
            commitWrongWord();
          }
        }
      }
    },
    [
      activeWordIndex,
      commitCorrectWord,
      commitWrongWord,
      currentSentence,
      expectedTokens,
      phase,
      playKeySound,
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
    typing: "输入中",
    transition: "切换下一句",
    lesson_completed: "已完成",
  };

  return (
    <Card className="immersive-page" onClick={focusTypingInput}>
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
              preload="metadata"
              onLoadedMetadata={() => setMediaReady(true)}
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
                preload="metadata"
                onLoadedMetadata={() => setMediaReady(true)}
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
                <p className="immersive-hint">媒体不可用，已改为逐句音频播放</p>
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
          <div className="immersive-typing-toolbar">
            <p className="immersive-hint">输入达到单词长度后自动判定；超过 2 个错误会清空重打。</p>
            <div className="immersive-display-toggle">
              <span className="text-xs text-muted-foreground">下划线模式</span>
              <Switch
                checked={displayMode === "underline"}
                onCheckedChange={(checked) => setDisplayMode(checked ? "underline" : "chip")}
                aria-label="切换单词显示模式"
              />
            </div>
          </div>

          <div className="immersive-word-row">
            {expectedTokens.map((token, index) => {
              const status = wordStatuses[index] || "pending";
              const slots = buildLetterSlots(token, wordInputs[index] || "");
              return (
                <div
                  key={`${token}-${index}`}
                  className={`immersive-word-slot immersive-word-slot--${status} ${
                    displayMode === "underline" ? "immersive-word-slot--underline" : "immersive-word-slot--chip"
                  }`}
                >
                  <div className="immersive-letter-row">
                    {slots.map((slot) => (
                      <span
                        key={slot.key}
                        className={`immersive-letter-cell immersive-letter-cell--${slot.state} ${
                          slot.extra ? "immersive-letter-cell--extra" : ""
                        }`}
                      >
                        <span className="immersive-letter-char">{slot.char}</span>
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

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
                focusTypingInput();
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
