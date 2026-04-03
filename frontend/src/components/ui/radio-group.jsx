import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";

import { cn } from "../../lib/utils";

export const RadioGroup = RadioGroupPrimitive.Root;

export const RadioGroupItem = ({ className, ...props }) => {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      className={cn(
        "aspect-square size-4 rounded-full border border-primary text-primary shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
        className,
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
        <div className="size-2 rounded-full bg-current" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );
};
