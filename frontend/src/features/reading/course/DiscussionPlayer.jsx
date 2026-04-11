/**
 * DiscussionPlayer — Plays discussion messages one by one with TTS.
 */
import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "../../../shared/ui";
import { Play, Pause, SkipForward, SkipBack, Volume2, Loader2 } from "lucide-react";
import { DiscussionBubble } from "./DiscussionBubble";
import { useDiscussionTTS } from "./useDiscussionTTS";

export function DiscussionPlayer({ messages, apiCall, accessToken, onComplete }) {
  const [visibleCount, setVisibleCount] = useState(1);
  const [activeIdx, setActiveIdx] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const autoPlayRef = useRef(false);
  const scrollRef = useRef(null);
  const { playMessage, stop, isPlaying, isLoading } = useDiscussionTTS({ apiCall, accessToken });

  const total = messages.length;

  // Scroll to bottom when new messages appear
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [visibleCount]);

  const playIdx = useCallback(async (idx) => {
    if (idx < 0 || idx >= total) return;
    setActiveIdx(idx);
    if (idx >= visibleCount) {
      setVisibleCount(idx + 1);
    }
    const msg = messages[idx];
    await playMessage(msg.content, msg.role);
  }, [total, visibleCount, messages, playMessage]);

  const handleAutoPlay = useCallback(async () => {
    autoPlayRef.current = true;
    setIsAutoPlaying(true);
    for (let i = activeIdx; i < total; i++) {
      if (!autoPlayRef.current) break;
      setActiveIdx(i);
      setVisibleCount(Math.max(visibleCount, i + 1));
      const msg = messages[i];
      await playMessage(msg.content, msg.role);
      if (!autoPlayRef.current) break;
    }
    autoPlayRef.current = false;
    setIsAutoPlaying(false);
  }, [activeIdx, total, visibleCount, messages, playMessage]);

  const handlePause = useCallback(() => {
    autoPlayRef.current = false;
    setIsAutoPlaying(false);
    stop();
  }, [stop]);

  const handleNext = useCallback(() => {
    stop();
    const nextIdx = Math.min(activeIdx + 1, total - 1);
    setVisibleCount((prev) => Math.max(prev, nextIdx + 1));
    setActiveIdx(nextIdx);
  }, [activeIdx, total, stop]);

  const handlePrev = useCallback(() => {
    stop();
    setActiveIdx(Math.max(activeIdx - 1, 0));
  }, [activeIdx, stop]);

  const allRevealed = visibleCount >= total;
  const canComplete = allRevealed;

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 flex flex-col">
        {messages.slice(0, visibleCount).map((msg, idx) => (
          <DiscussionBubble
            key={idx}
            role={msg.role}
            content={msg.content}
            isActive={idx === activeIdx}
            isPlaying={idx === activeIdx && isPlaying}
          />
        ))}

        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground self-start pl-11">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Loading audio...</span>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="border-t p-3 flex items-center justify-between shrink-0 bg-background/95 backdrop-blur">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handlePrev} disabled={activeIdx <= 0}>
            <SkipBack className="w-4 h-4" />
          </Button>

          {isAutoPlaying ? (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handlePause}>
              <Pause className="w-4 h-4" /> Pause
            </Button>
          ) : (
            <Button variant="default" size="sm" className="gap-1.5" onClick={handleAutoPlay} disabled={isLoading}>
              <Play className="w-4 h-4" /> {allRevealed ? "Replay" : "Play"}
            </Button>
          )}

          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleNext} disabled={activeIdx >= total - 1}>
            <SkipForward className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {visibleCount} / {total} messages
          </span>

          {canComplete && onComplete && (
            <Button size="sm" onClick={onComplete} className="gap-1.5">
              Continue
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
