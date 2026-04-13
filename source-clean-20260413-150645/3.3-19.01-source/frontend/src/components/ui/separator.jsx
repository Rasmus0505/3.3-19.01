import { cn } from "../../lib/utils";

export function Separator({ className, orientation = "horizontal", ...props }) {
  return (
    <div
      data-slot="separator"
      data-orientation={orientation}
      className={cn("cn-separator", orientation === "horizontal" ? "cn-separator-horizontal" : "cn-separator-vertical", className)}
      {...props}
    />
  );
}
