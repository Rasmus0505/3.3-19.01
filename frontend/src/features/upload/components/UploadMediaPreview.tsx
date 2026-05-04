// 已选素材预览组件（封面 + 元信息）。

import { cn } from "../../../lib/utils";
import { Badge, Button, MediaCover } from "../../../shared/ui";

interface UploadMediaPreviewProps {
  showPreview: boolean;
  coverDataUrl: string;
  isVideoSource: boolean;
  coverAspectRatio: number;
  sourceDisplayName: string;
  durationSec: number | null;
  clearDisabled: boolean;
  onClear: () => void;
  formatDurationLabel: (sec: number) => string;
}

export function UploadMediaPreview({
  showPreview,
  coverDataUrl,
  isVideoSource,
  coverAspectRatio,
  sourceDisplayName,
  durationSec,
  clearDisabled,
  onClear,
  formatDurationLabel,
}: UploadMediaPreviewProps) {
  if (!showPreview) return null;

  return (
    <>
      <div className="relative overflow-hidden rounded-2xl border bg-muted/10 p-1">
        <MediaCover
          coverDataUrl={coverDataUrl}
          alt={isVideoSource ? "视频封面" : "音频素材"}
          aspectRatio={coverAspectRatio}
          className="border-0 bg-muted/20"
          fallback={
            <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
              {isVideoSource ? "封面提取中或失败" : "音频素材（无视频封面）"}
            </div>
          }
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="absolute right-4 top-4 h-8 rounded-full px-3 shadow-sm"
          onClick={onClear}
          disabled={clearDisabled}
        >
          x 清空
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-muted/15 px-3 py-2">
        <Badge variant="outline">{isVideoSource ? "视频" : "音频"}</Badge>
        {durationSec != null ? <Badge variant="outline">{formatDurationLabel(durationSec)}</Badge> : null}
        {sourceDisplayName ? (
          <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{sourceDisplayName}</p>
        ) : null}
      </div>
    </>
  );
}
