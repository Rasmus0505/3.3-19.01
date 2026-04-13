/**
 * PlaybackToolbar — control bar between canvas and Roundtable.
 * Modelled after OpenMAIC's canvas-toolbar.
 * Layout: [scene count] [volume] [speed] [← prev] [⏸/▶ play] [→ next] [auto-play]
 */
import { Volume2, VolumeX, ChevronLeft, ChevronRight, Pause, Play, Repeat } from "lucide-react";
import { cn } from "../../../lib/utils";

const SPEEDS = [1, 1.25, 1.5, 2];

const btnCls = cn(
  "relative w-7 h-7 rounded-md flex items-center justify-center",
  "transition-all duration-150 outline-none cursor-pointer border-none bg-transparent",
  "hover:bg-gray-500/10 active:scale-90 text-gray-500 dark:text-gray-400",
);

export function PlaybackToolbar({
  // playback state
  isPlaying = false,
  isPaused = false,
  speed = 1,
  ttsEnabled = true,
  // section nav
  sectionIndex = 0,
  totalSections = 1,
  // callbacks
  onPlayPause,
  onPrev,
  onNext,
  onCycleSpeed,
  onToggleTTS,
  className,
}) {
  const canPrev = sectionIndex > 0;
  const canNext = sectionIndex < totalSections - 1;
  const isActive = isPlaying && !isPaused;

  return (
    <div className={cn("pt-toolbar", className)}>
      {/* Left: section count */}
      <span className="pt-toolbar__count">
        {sectionIndex + 1} / {totalSections}
      </span>

      {/* Center controls */}
      <div className="pt-toolbar__center">
        {/* TTS volume */}
        <button
          type="button"
          className={btnCls}
          onClick={onToggleTTS}
          title={ttsEnabled ? "关闭语音" : "开启语音"}
        >
          {ttsEnabled
            ? <Volume2 className="size-3.5" />
            : <VolumeX className="size-3.5" />}
        </button>

        {/* Speed */}
        <button
          type="button"
          className={cn(
            "pt-toolbar__speed",
            speed !== 1 && "pt-toolbar__speed--active",
          )}
          onClick={onCycleSpeed}
          title="播放速度"
        >
          {speed}x
        </button>

        {/* Prev */}
        <button
          type="button"
          className={cn(btnCls, !canPrev && "opacity-30 cursor-not-allowed")}
          onClick={canPrev ? onPrev : undefined}
          disabled={!canPrev}
          title="上一节"
        >
          <ChevronLeft className="size-3.5" />
        </button>

        {/* Play / Pause */}
        <button
          type="button"
          className={cn(
            btnCls,
            "w-8 h-7",
            isActive
              ? "text-violet-600 dark:text-violet-400"
              : "text-gray-500 dark:text-gray-400",
          )}
          onClick={onPlayPause}
          title={isActive ? "暂停 (Space)" : "继续 (Space)"}
        >
          {isActive
            ? <Pause className="size-3.5" />
            : <Play className="size-3.5" />}
        </button>

        {/* Next */}
        <button
          type="button"
          className={cn(btnCls, !canNext && "opacity-30 cursor-not-allowed")}
          onClick={canNext ? onNext : undefined}
          disabled={!canNext}
          title="下一节"
        >
          <ChevronRight className="size-3.5" />
        </button>
      </div>

      {/* Right: spacer (can add more controls here) */}
      <div className="pt-toolbar__right" />
    </div>
  );
}
