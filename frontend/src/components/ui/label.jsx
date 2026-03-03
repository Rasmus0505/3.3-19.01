import { cn } from "../../lib/utils";

export function Label({ className, ...props }) {
  return <label data-slot="label" className={cn("cn-label flex items-center select-none", className)} {...props} />;
}
