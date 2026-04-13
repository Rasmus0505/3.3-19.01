import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "../../lib/utils";

export function Tabs({ className, ...props }) {
  return <TabsPrimitive.Root data-slot="tabs" className={cn("cn-tabs flex flex-col gap-2", className)} {...props} />;
}

export function TabsList({ className, ...props }) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "cn-tabs-list bg-muted text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-lg p-[3px]",
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "cn-tabs-trigger inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium outline-none transition-all disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-xs focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("cn-tabs-content outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]", className)}
      {...props}
    />
  );
}
