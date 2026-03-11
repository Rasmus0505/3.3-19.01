import { Toaster as Sonner } from "sonner";

const TOAST_DURATION_MS = 2800;

export function Toaster({ ...props }) {
  return (
    <Sonner
      className="toaster group"
      position="top-right"
      duration={TOAST_DURATION_MS}
      closeButton
      toastOptions={{
        duration: TOAST_DURATION_MS,
        classNames: {
          toast:
            "group toast border border-border bg-card text-card-foreground shadow-lg",
          description: "text-muted-foreground",
          actionButton: "bg-primary text-primary-foreground",
          cancelButton: "bg-muted text-muted-foreground",
          error: "border-destructive/40 bg-destructive/10 text-destructive",
        },
      }}
      {...props}
    />
  );
}
