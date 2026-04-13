import { cn } from "../../lib/utils";

export function Textarea({ className, ...props }) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "cn-textarea placeholder:text-muted-foreground flex min-h-36 w-full outline-none disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
