import * as SwitchPrimitive from "@radix-ui/react-switch";

import { cn } from "../../lib/utils";

export function Switch({ className, ...props }) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent shadow-xs transition-colors outline-none disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-4 translate-x-0.5 rounded-full bg-background shadow-sm transition-transform data-[state=checked]:translate-x-[18px]"
      />
    </SwitchPrimitive.Root>
  );
}

