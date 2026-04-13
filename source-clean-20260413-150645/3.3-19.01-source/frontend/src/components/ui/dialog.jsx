import { X } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";

import { cn } from "../../lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogPortal = DialogPrimitive.Portal;
export const DialogClose = DialogPrimitive.Close;

export function DialogOverlay({ className, ...props }) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "cn-dialog-overlay data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/45",
        className,
      )}
      {...props}
    />
  );
}

export function DialogContent({ className, children, hideClose = false, ...props }) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "cn-dialog-content data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border bg-card p-6 shadow-lg duration-200",
          className,
        )}
        {...props}
      >
        {children}
        {!hideClose ? (
          <DialogPrimitive.Close className="ring-offset-background focus:ring-ring data-[state=open]:bg-muted absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:pointer-events-none">
            <X className="size-4" />
            <span className="sr-only">关闭</span>
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

export function DialogHeader({ className, ...props }) {
  return <div data-slot="dialog-header" className={cn("cn-dialog-header flex flex-col gap-1.5 text-left", className)} {...props} />;
}

export function DialogFooter({ className, ...props }) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn("cn-dialog-footer flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  );
}

export function DialogTitle({ className, ...props }) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("cn-dialog-title text-base font-semibold leading-none tracking-tight", className)}
      {...props}
    />
  );
}

export function DialogDescription({ className, ...props }) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("cn-dialog-description text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}
