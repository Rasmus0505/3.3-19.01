import { cn } from "../../lib/utils";

export function Skeleton({ className, ...props }) {
  return <div data-slot="skeleton" className={cn("cn-skeleton bg-muted animate-pulse rounded-md", className)} {...props} />;
}
