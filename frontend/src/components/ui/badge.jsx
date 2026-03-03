import { cva } from "class-variance-authority";

import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "cn-badge inline-flex items-center justify-center w-fit whitespace-nowrap shrink-0 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 aria-invalid:border-destructive overflow-hidden group/badge",
  {
    variants: {
      variant: {
        default: "cn-badge-variant-default",
        secondary: "cn-badge-variant-secondary",
        destructive: "cn-badge-variant-destructive",
        outline: "cn-badge-variant-outline",
        ghost: "cn-badge-variant-ghost",
        link: "cn-badge-variant-link",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export function Badge({ className, variant, ...props }) {
  return <span data-slot="badge" data-variant={variant} className={cn(badgeVariants({ variant }), className)} {...props} />;
}
