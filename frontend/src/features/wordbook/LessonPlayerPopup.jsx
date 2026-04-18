import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Pause, Play, Volume2, VolumeX } from "lucide-react";

import { parseResponse, toErrorText } from "../../shared/api/client";
import { getLessonMedia } from "../../shared/media/localMediaStore";
import { Button } from "../../shared/ui";

const LOCAL_MEDIA_REQUIRED_CODE = "LOCAL_MEDIA_REQUIRED";

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

function renderSentenceWithHighlight(sentence, startTokenIndex, endTokenIndex) {
  const tokens = Array.isArray(sentence?.tokens) ? sentence.tokens : [];
  if (!tokens.length) {
    return <p className="text-lg leading-relaxed">{sentence?.text_en || "暂无英文"}</p>;
  }

  return (
    <p className="text-lg leading-relaxed">
      {tokens.map((token, index) => {
        const highlighted = Number.isInteger(startTokenIndex) && Number.isInteger(endTokenIndex)
          ? index >= startTokenIndex && index <= endTokenIndex
          : false;
        return (
          <span
            key={`${token}-${index}`}
            className={highlighted ? "rounded bg-primary/15 px-1 py-0.5 text-primary" : ""}
          >
            {index > 0 ? " " : ""}
            {token}
          </span>
        );
      })}
    </p>
  );
}

export function LessonPlayerPopup({
  open,
  onClose,
  lessonId,
  sentenceIndex,
  highlightStartTokenIndex = 0,
  highlightEndTokenIndex = 0,
  entryText = "",
  apiCall,
}) {
  const [lesson, setLesson] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [mediaBlobUrl, setMediaBlobUrl] = useState("");
  const [mediaMode, setMediaMode] = useState("");
  const [mediaNotice, setMediaNotice] = useState("");
  const [clipLoading, setClipLoading] = useState(false);

  const mediaElementRef = useRef(null);
  const clipAudioRef = useRef(new Audio());
  const clipUrlRef = useRef("");
  const activePlaybackModeRef = useRef("");
  const currentSegmentEndRef = useRef(0);

  const stopPlayback = useCallback(() => {
    const mainMedia = mediaElementRef.current;
    if (mainMedia) {
      mainMedia.pause();
      mainMedia.ontimeupdate = null;
    }

    const clipAudio = clipAudioRef.current;
    clipAudio.pause();
    clipAudio.onended = null;
    clipAudio.onerror = null;

    if (clipUrlRef.current) {
      URL.revokeObjectURL(clipUrlRef.current);
      clipUrlRef.current = "";
    }

    activePlaybackModeRef.current = "";
    setIsPlaying(false);
    setClipLoading(false);
  }, []);

  const loadLesson = useCallback(async () => {
    try {
      const resp = await apiCall(`/api/lessons/${lessonId}`);
      const data = await parseResponse(resp);
      if (!resp.ok) {
        setError(toErrorText(data, "加载课程失败"));
        return;
      }
      setLesson(data);
    } catch (err) {
      setError(`网络错误: ${String(err)}`);
    } finally {
      setLoading(false);
    }
  }, [apiCall, lessonId]);

  useEffect(() => {
    if (!open || !lessonId) {
      stopPlayback();
      setLesson(null);
      setLoading(true);
      setError(null);
      setMediaBlobUrl("");
      setMediaMode("");
      setMediaNotice("");
      return;
    }
    setLoading(true);
    setError(null);
    setCurrentIndex(sentenceIndex || 0);
    setMediaNotice("");
    void loadLesson();
  }, [lessonId, loadLesson, open, sentenceIndex, stopPlayback]);

  useEffect(() => {
    if (!open || !lesson) {
      setMediaBlobUrl("");
      setMediaMode("");
      setMediaNotice("");
      return undefined;
    }

    let canceled = false;
    let objectUrl = "";

    async function loadMainMedia() {
      setMediaBlobUrl("");
      setMediaMode("");
      setMediaNotice("");

      try {
        const localMedia = await getLessonMedia(lesson.id);
        if (canceled) return;
        if (localMedia?.blob) {
          objectUrl = URL.createObjectURL(localMedia.blob);
          setMediaBlobUrl(objectUrl);
          setMediaMode(resolveMediaModeFromTypeAndName(localMedia.media_type, localMedia.file_name || lesson.source_filename || ""));
          return;
        }
      } catch (_) {
        // Ignore local media lookup errors and fall back to server media.
      }

      if (lesson.media_storage !== "server") {
        if (!canceled) {
          setMediaNotice("原始媒体只保存在当前浏览器，本窗口暂时只能尝试句子音频回放。");
        }
        return;
      }

      try {
        const resp = await apiCall(`/api/lessons/${lesson.id}/media`);
        if (!resp.ok) {
          if (canceled) return;
          const payload = await readErrorPayload(resp);
          if (canceled) return;
          if (Number(resp.status) === 404 || String(payload?.error_code || "") === LOCAL_MEDIA_REQUIRED_CODE) {
            setMediaNotice("来源课程原始媒体当前不可用，将降级为句子音频回放。");
            return;
          }
          setMediaNotice(`来源课程媒体加载失败（${resp.status} ${payload?.error_code || ""}），将降级为句子音频回放。`);
          return;
        }

        const blob = await resp.blob();
        objectUrl = URL.createObjectURL(blob);
        if (canceled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        setMediaBlobUrl(objectUrl);
        setMediaMode(resolveMediaModeFromTypeAndName(blob.type || resp.headers.get("content-type") || "", lesson.source_filename || ""));
      } catch (err) {
        if (!canceled) {
          setMediaNotice(`来源课程媒体加载异常（${String(err)}），将降级为句子音频回放。`);
        }
      }
    }

    void loadMainMedia();

    return () => {
      canceled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [apiCall, lesson, open]);

  useEffect(() => () => {
    stopPlayback();
  }, [stopPlayback]);

  useEffect(() => {
    stopPlayback();
  }, [currentIndex, stopPlayback]);

  useEffect(() => {
    const mainMedia = mediaElementRef.current;
    if (mainMedia) {
      mainMedia.muted = muted;
    }
    clipAudioRef.current.muted = muted;
  }, [muted]);

  const playCurrentSentence = useCallback(async () => {
    const sentence = lesson?.sentences?.[currentIndex];
    if (!sentence) return;

    stopPlayback();
    setMediaNotice("");

    const startSec = Math.max(0, Number(sentence.begin_ms || 0) / 1000);
    const endSec = Math.max(startSec + 0.1, Number(sentence.end_ms || 0) / 1000);
    currentSegmentEndRef.current = endSec;

    if (mediaBlobUrl && mediaElementRef.current) {
      const mainMedia = mediaElementRef.current;
      mainMedia.currentTime = startSec;
      mainMedia.muted = muted;
      mainMedia.ontimeupdate = () => {
        if (mainMedia.currentTime >= currentSegmentEndRef.current) {
          mainMedia.pause();
          mainMedia.ontimeupdate = null;
          activePlaybackModeRef.current = "";
          setIsPlaying(false);
        }
      };
      try {
        await mainMedia.play();
        activePlaybackModeRef.current = "main-media";
        setIsPlaying(true);
        return;
      } catch (_) {
        mainMedia.ontimeupdate = null;
      }
    }

    if (!sentence.audio_url) {
      setMediaNotice("该句没有可播放的句子音频。");
      return;
    }

    setClipLoading(true);
    try {
      const audioResp = await apiCall(sentence.audio_url);
      if (!audioResp.ok) {
        const payload = await readErrorPayload(audioResp);
        setMediaNotice(toErrorText(payload, "句子音频加载失败"));
        return;
      }
      const clipBlob = await audioResp.blob();
      const clipUrl = URL.createObjectURL(clipBlob);
      clipUrlRef.current = clipUrl;
      const clipAudio = clipAudioRef.current;
      clipAudio.src = clipUrl;
      clipAudio.muted = muted;
      clipAudio.onended = () => {
        if (clipUrlRef.current === clipUrl) {
          URL.revokeObjectURL(clipUrl);
          clipUrlRef.current = "";
        }
        activePlaybackModeRef.current = "";
        setIsPlaying(false);
      };
      clipAudio.onerror = () => {
        if (clipUrlRef.current === clipUrl) {
          URL.revokeObjectURL(clipUrl);
          clipUrlRef.current = "";
        }
        activePlaybackModeRef.current = "";
        setIsPlaying(false);
      };
      await clipAudio.play();
      activePlaybackModeRef.current = "clip-audio";
      setIsPlaying(true);
    } catch (err) {
      setMediaNotice(`句子音频加载异常（${String(err)}）。`);
    } finally {
      setClipLoading(false);
    }
  }, [apiCall, currentIndex, lesson, mediaBlobUrl, muted, stopPlayback]);

  const handlePlayPause = useCallback(async () => {
    const activeMedia =
      activePlaybackModeRef.current === "main-media"
        ? mediaElementRef.current
        : activePlaybackModeRef.current === "clip-audio"
          ? clipAudioRef.current
          : null;

    if (isPlaying && activeMedia) {
      activeMedia.pause();
      setIsPlaying(false);
      return;
    }

    await playCurrentSentence();
  }, [isPlaying, playCurrentSentence]);

  const handleClose = useCallback(() => {
    stopPlayback();
    onClose();
  }, [onClose, stopPlayback]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative z-10 flex h-[80vh] w-full max-w-4xl flex-col rounded-xl bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-base font-semibold">{lesson?.title || "来源课程回看"}</h2>
          <button
            onClick={handleClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-hidden">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex h-full flex-col items-center justify-center gap-4">
              <p className="text-destructive">{error}</p>
              <Button onClick={() => void loadLesson()}>重试</Button>
            </div>
          ) : lesson ? (
            <LessonPlayer
              lesson={lesson}
              currentIndex={currentIndex}
              onIndexChange={setCurrentIndex}
              sourceSentenceIndex={sentenceIndex}
              highlightStartTokenIndex={highlightStartTokenIndex}
              highlightEndTokenIndex={highlightEndTokenIndex}
              entryText={entryText}
              isPlaying={isPlaying}
              onPlayPause={() => void handlePlayPause()}
              muted={muted}
              onMuteToggle={() => setMuted((value) => !value)}
              mediaBlobUrl={mediaBlobUrl}
              mediaMode={mediaMode}
              mediaNotice={mediaNotice}
              mediaElementRef={mediaElementRef}
              clipLoading={clipLoading}
            />
          ) : null}
        </div>

        {lesson && !loading && !error && (
          <div className="flex items-center justify-between border-t px-4 py-3">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={currentIndex <= 0}
                onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))}
              >
                ◀◀
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={currentIndex >= (lesson.sentences?.length || 1) - 1}
                onClick={() => setCurrentIndex((index) => Math.min((lesson.sentences?.length || 1) - 1, index + 1))}
              >
                ▶▶
              </Button>
            </div>
            <span className="text-sm text-muted-foreground">
              句子 {currentIndex + 1} / {lesson.sentences?.length || 0}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function LessonPlayer({
  lesson,
  currentIndex,
  onIndexChange,
  sourceSentenceIndex,
  highlightStartTokenIndex,
  highlightEndTokenIndex,
  entryText,
  isPlaying,
  onPlayPause,
  muted,
  onMuteToggle,
  mediaBlobUrl,
  mediaMode,
  mediaNotice,
  mediaElementRef,
  clipLoading,
}) {
  const sentence = lesson.sentences?.[currentIndex];

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-2xl space-y-6">
          <div className="space-y-2">
            <p className="text-xl font-semibold">{lesson.title}</p>
            <div className="flex items-center gap-2">
              {sentence?.audio_url || mediaBlobUrl ? (
                <Button size="icon" variant="outline" onClick={onPlayPause}>
                  {clipLoading ? <Loader2 className="size-4 animate-spin" /> : isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
                </Button>
              ) : null}
              <button
                onClick={onMuteToggle}
                className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
              </button>
            </div>
          </div>

          {mediaBlobUrl ? (
            mediaMode === "audio" ? (
              <audio
                ref={mediaElementRef}
                controls
                preload="metadata"
                src={mediaBlobUrl}
                className="w-full rounded-xl border bg-background"
              />
            ) : (
              <video
                ref={mediaElementRef}
                controls
                preload="metadata"
                src={mediaBlobUrl}
                className="w-full rounded-xl border bg-black"
              />
            )
          ) : null}

          {mediaNotice ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {mediaNotice}
            </div>
          ) : null}

          <div className="space-y-4 rounded-xl border bg-muted/30 p-6">
            {renderSentenceWithHighlight(
              sentence,
              currentIndex === Number(sourceSentenceIndex || 0) ? highlightStartTokenIndex : -1,
              currentIndex === Number(sourceSentenceIndex || 0) ? highlightEndTokenIndex : -1,
            )}
            <p className="text-base text-muted-foreground">{sentence?.text_zh || "暂无中文"}</p>
            {entryText && currentIndex === Number(sourceSentenceIndex || 0) ? (
              <p className="text-sm text-primary">高亮词条：{entryText}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">所有句子</span>
            </div>
            <div className="max-h-60 space-y-1 overflow-auto">
              {(lesson.sentences || []).map((item, index) => (
                <button
                  key={index}
                  onClick={() => onIndexChange(index)}
                  className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                    index === currentIndex ? "bg-primary/10 text-primary" : "hover:bg-muted"
                  }`}
                >
                  {index + 1}. {item.text_en}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


