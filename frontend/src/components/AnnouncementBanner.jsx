import { X } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/shared/ui";

/**
 * Banner-style announcement banner.
 * Displays at the top of the page below the nav bar.
 * User must manually dismiss by clicking X — closed state is session-only.
 *
 * @param {object} props
 * @param {{ id: number, title: string, content: string, type: string }} props.announcement
 * @param {() => void} props.onDismiss  Called when user clicks the X button
 */
export function AnnouncementBanner({ announcement, onDismiss }) {
  const [visible, setVisible] = useState(true);

  function handleDismiss() {
    setVisible(false);
    onDismiss?.();
  }

  if (!visible) {
    return null;
  }

  return (
    <div
      className="
        flex items-start gap-3 border-l-4 border-l-upload-brand
        bg-secondary px-4 py-3
        transition-all duration-200 ease-in-out
        -translate-y-0
      "
      style={{ borderLeftColor: "var(--upload-brand)" }}
    >
      {/* Type badge */}
      <div className="shrink-0 pt-0.5">
        <Badge
          variant="outline"
          className="whitespace-nowrap border-upload-brand/30 bg-upload-brand/10 text-upload-brand text-xs"
        >
          公告
        </Badge>
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-tight">{announcement.title}</p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          {announcement.content}
        </p>
      </div>

      {/* Dismiss button */}
      <button
        type="button"
        onClick={handleDismiss}
        className="
          shrink-0 rounded p-1 text-muted-foreground
          hover:bg-muted hover:text-foreground
          focus:outline-none focus:ring-2 focus:ring-ring
          transition-colors
        "
        style={{ width: 24, height: 24, minWidth: 24, minHeight: 24 }}
        aria-label="关闭"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
