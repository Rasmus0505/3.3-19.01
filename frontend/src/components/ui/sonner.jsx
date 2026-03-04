import { Toaster as Sonner } from "sonner";

export function Toaster({ ...props }) {
  return (
    <Sonner
      className="toaster group"
      position="top-right"
      toastOptions={{
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
