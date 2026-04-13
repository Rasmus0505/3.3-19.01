// 沉浸式学习播放控制栏组件。
import { memo } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Maximize,
  Repeat,
  Loader2,
} from 'lucide-react';
import { Button } from '../../../shared/ui';
import { Progress } from '../../../shared/ui/progress';
import type { PlayerState } from '../hooks/useImmersivePlayer';

interface PlaybackControlsProps {
  state: PlayerState;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onJumpBackward: (seconds: number) => void;
  onJumpForward: (seconds: number) => void;
  onToggleMute: () => void;
  onVolumeChange: (volume: number) => void;
  onToggleFullscreen: () => void;
  onToggleLoop: () => void;
  onPlaybackRateChange: (rate: number) => void;
}

const PLAYBACK_RATES = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export const PlaybackControls = memo(function PlaybackControls({
  state,
  onTogglePlay,
  onSeek,
  onJumpBackward,
  onJumpForward,
  onToggleMute,
  onVolumeChange,
  onToggleFullscreen,
  onToggleLoop,
  onPlaybackRateChange,
}: PlaybackControlsProps) {
  const { isPlaying, currentTime, duration, isMuted, volume, isLooping, playbackRate } = state;

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    onSeek(percent * duration);
  };

  return (
    <div className="space-y-3 rounded-xl bg-card p-4 shadow-lg">
      {/* 进度条 */}
      <div
        className="h-2 w-full cursor-pointer rounded-full bg-muted"
        onClick={handleProgressClick}
      >
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
        />
      </div>

      {/* 时间显示 */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>

      {/* 控制按钮 */}
      <div className="flex items-center justify-between">
        {/* 左侧：音量 */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleMute}
            className="size-8"
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="size-4" />
            ) : (
              <Volume2 className="size-4" />
            )}
          </Button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={isMuted ? 0 : volume}
            onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
            className="h-1 w-16 accent-primary"
          />
        </div>

        {/* 中间：播放控制 */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onJumpBackward(5)}
            className="size-10"
          >
            <SkipBack className="size-5" />
          </Button>

          <Button
            variant="default"
            size="icon"
            onClick={onTogglePlay}
            className="size-12"
          >
            {isPlaying ? (
              <Pause className="size-6" />
            ) : (
              <Play className="size-6" />
            )}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => onJumpForward(5)}
            className="size-10"
          >
            <SkipForward className="size-5" />
          </Button>
        </div>

        {/* 右侧：倍速、循环、全屏 */}
        <div className="flex items-center gap-1">
          {/* 倍速选择 */}
          <select
            value={playbackRate}
            onChange={(e) => onPlaybackRateChange(parseFloat(e.target.value))}
            className="rounded border bg-background px-2 py-1 text-xs"
          >
            {PLAYBACK_RATES.map((rate) => (
              <option key={rate} value={rate}>
                {rate}x
              </option>
            ))}
          </select>

          <Button
            variant={isLooping ? 'secondary' : 'ghost'}
            size="icon"
            onClick={onToggleLoop}
            className="size-8"
          >
            <Repeat className="size-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleFullscreen}
            className="size-8"
          >
            <Maximize className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
});
