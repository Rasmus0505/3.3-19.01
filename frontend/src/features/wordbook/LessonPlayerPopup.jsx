import { useCallback, useEffect, useState } from "react";
import { Loader2, Play, Pause, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";

import { parseResponse, toErrorText } from "../../shared/api/client";
import { Button } from "../../shared/ui";

export function LessonPlayerPopup({ open, onClose, lessonId, sentenceIndex }) {
  const [lesson, setLesson] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    if (!open || !lessonId) {
      setLesson(null);
      setLoading(true);
      return;
    }
    setLoading(true);
    setError(null);
    setCurrentIndex(sentenceIndex || 0);
    setIsPlaying(false);
    void loadLesson();
  }, [open, lessonId, sentenceIndex]);

  const loadLesson = useCallback(async () => {
    try {
      const resp = await fetch(`/api/lessons/${lessonId}`);
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
  }, [lessonId]);

  const handleClose = useCallback(() => {
    setIsPlaying(false);
    onClose();
  }, [onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative z-10 flex h-[80vh] w-full max-w-4xl flex-col rounded-xl bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-base font-semibold">{lesson?.title || "课程播放"}</h2>
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
              isPlaying={isPlaying}
              onPlayPause={() => setIsPlaying((p) => !p)}
              muted={muted}
              onMuteToggle={() => setMuted((m) => !m)}
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
                onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
              >
                ◀◀
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={currentIndex >= (lesson.sentences?.length || 1) - 1}
                onClick={() => setCurrentIndex((i) => Math.min((lesson.sentences?.length || 1) - 1, i + 1))}
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

function LessonPlayer({ lesson, currentIndex, onIndexChange, isPlaying, onPlayPause, muted, onMuteToggle }) {
  const sentence = lesson.sentences?.[currentIndex];
  const mediaRef = useCallback(
    (node) => {
      if (node && sentence?.audio_url) {
        node.src = sentence.audio_url;
        if (isPlaying) {
          node.play().catch(() => {});
        } else {
          node.pause();
        }
      }
    },
    [sentence?.audio_url, isPlaying],
  );

  return (
    <div className="flex h-full flex-col">
      {sentence?.audio_url && (
        <audio ref={mediaRef} className="hidden" onEnded={onPlayPause} muted={muted} />
      )}

      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-2xl space-y-6">
          <div className="space-y-2">
            <p className="text-xl font-semibold">{lesson.title}</p>
            <div className="flex items-center gap-2">
              {sentence?.audio_url ? (
                <Button size="icon" variant="outline" onClick={onPlayPause}>
                  {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
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

          <div className="space-y-4 rounded-xl border bg-muted/30 p-6">
            <p className="text-lg leading-relaxed">{sentence?.text_en || "暂无英文"}</p>
            <p className="text-base text-muted-foreground">{sentence?.text_zh || "暂无中文"}</p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">所有句子</span>
            </div>
            <div className="max-h-60 space-y-1 overflow-auto">
              {(lesson.sentences || []).map((s, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    onIndexChange(idx);
                    if (s.audio_url) {
                      const audio = document.querySelector("audio");
                      if (audio) {
                        audio.src = s.audio_url;
                        audio.play().catch(() => {});
                      }
                    }
                  }}
                  className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                    idx === currentIndex ? "bg-primary/10 text-primary" : "hover:bg-muted"
                  }`}
                >
                  {idx + 1}. {s.text_en}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
