import { useEffect, useState } from "react";

import { Badge, Button, Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../shared/ui";

/**
 * Modal-style announcement dialog.
 * Shows one announcement at a time in a queue.
 * All modals dismiss automatically when queue is exhausted.
 *
 * @param {object} props
 * @param {Array<{ id: number, title: string, content: string, type: string }>} props.announcements
 */
export function AnnouncementModal({ announcements = [] }) {
  const [open, setOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Reset when announcements prop changes
  useEffect(() => {
    if (announcements.length > 0) {
      setCurrentIndex(0);
      setOpen(true);
    }
  }, [announcements]);

  const current = announcements[currentIndex];
  const hasNext = currentIndex < announcements.length - 1;

  function handleAcknowledge() {
    if (hasNext) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      setOpen(false);
    }
  }

  // Render nothing if no announcements
  if (announcements.length === 0) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md gap-0 p-0" hideClose>
        {/* Header */}
        <DialogHeader className="flex-row items-center gap-2 border-b px-6 py-4">
          <Badge
            variant="outline"
            className="shrink-0 whitespace-nowrap border-destructive/30 bg-destructive/10 text-destructive text-xs"
          >
            重要公告
          </Badge>
          <DialogTitle className="text-base font-semibold leading-tight">
            {current?.title}
          </DialogTitle>
          <DialogClose className="ml-auto shrink-0 rounded-sm opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </DialogClose>
        </DialogHeader>

        {/* Body */}
        <div className="px-6 py-4">
          <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
            {/* Simple line-break rendering — Markdown enhancement deferred */}
            {current?.content}
          </DialogDescription>
        </div>

        {/* Footer */}
        <DialogFooter className="border-t px-6 py-4">
          <Button
            onClick={handleAcknowledge}
            className="w-full bg-upload-brand text-upload-brand-foreground hover:bg-upload-brand/90"
          >
            我已知晓{hasNext ? ` (${currentIndex + 1}/${announcements.length})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
