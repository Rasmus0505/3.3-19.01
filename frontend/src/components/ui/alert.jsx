import { cva } from "class-variance-authority";

import { cn } from "../../lib/utils";

const alertVariants = cva(
  "cn-alert relative w-full rounded-lg border px-4 py-3 text-sm [&>svg~*]:pl-7 [&>svg]:absolute [&>svg]:top-3.5 [&>svg]:left-4 [&>svg+div]:translate-y-[-3px] [&>p]:leading-relaxed",
  {
    variants: {
      variant: {
        default: "bg-card text-card-foreground border-border",
        destructive: "text-destructive border-destructive/40 bg-destructive/10",
        success: "border-emerald-200 bg-emerald-50 text-emerald-900",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export function Alert({ className, variant, ...props }) {
  return <div role="alert" data-slot="alert" className={cn(alertVariants({ variant }), className)} {...props} />;
}

export function AlertTitle({ className, ...props }) {
  return <h5 data-slot="alert-title" className={cn("cn-alert-title mb-1 font-medium leading-none tracking-tight", className)} {...props} />;
}

export function AlertDescription({ className, ...props }) {
  return <div data-slot="alert-description" className={cn("cn-alert-description text-sm", className)} {...props} />;
}
