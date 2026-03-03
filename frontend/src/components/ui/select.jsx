import { ChevronDown } from "lucide-react";

import { cn } from "../../lib/utils";

export function Select({ className, size = "default", children, ...props }) {
  return (
    <div className="relative">
      <select
        data-slot="select-trigger"
        data-size={size}
        className={cn(
          "cn-select-trigger flex w-full appearance-none items-center whitespace-nowrap outline-none disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="cn-select-trigger-icon" aria-hidden="true" />
    </div>
  );
}
