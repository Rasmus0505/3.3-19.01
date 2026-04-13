import { ImageIcon } from "lucide-react";

import { cn } from "../../lib/utils";

function normalizeAspectRatio(aspectRatio) {
  const safe = Number(aspectRatio || 0);
  if (!Number.isFinite(safe) || safe <= 0) {
    return 16 / 9;
  }
  return safe;
}

export function MediaCover({ coverDataUrl = "", alt = "素材封面", aspectRatio = 0, className = "", imageClassName = "", fallback = null }) {
  const safeAspectRatio = normalizeAspectRatio(aspectRatio);

  return (
    <div
      className={cn(
        "relative flex w-full items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800",
        className,
      )}
      style={{ aspectRatio: safeAspectRatio }}
    >
      {coverDataUrl ? (
        <img src={coverDataUrl} alt={alt} className={cn("h-full w-full object-contain", imageClassName)} />
      ) : fallback ? (
        fallback
      ) : (
        <>
          <ImageIcon className="size-9 text-white/90" aria-hidden="true" />
          <span className="sr-only">{alt}</span>
        </>
      )}
    </div>
  );
}
