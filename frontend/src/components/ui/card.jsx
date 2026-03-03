import { cn } from "../../lib/utils";

export function Card({ className, size = "default", ...props }) {
  return <div data-slot="card" data-size={size} className={cn("cn-card group/card flex flex-col", className)} {...props} />;
}

export function CardHeader({ className, ...props }) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "cn-card-header group/card-header @container/card-header grid auto-rows-min items-start has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto]",
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }) {
  return <h2 data-slot="card-title" className={cn("cn-card-title", className)} {...props} />;
}

export function CardDescription({ className, ...props }) {
  return <p data-slot="card-description" className={cn("cn-card-description", className)} {...props} />;
}

export function CardAction({ className, ...props }) {
  return <div data-slot="card-action" className={cn("cn-card-action col-start-2 row-span-2 row-start-1 self-start justify-self-end", className)} {...props} />;
}

export function CardContent({ className, ...props }) {
  return <div data-slot="card-content" className={cn("cn-card-content", className)} {...props} />;
}

export function CardFooter({ className, ...props }) {
  return <div data-slot="card-footer" className={cn("cn-card-footer flex items-center", className)} {...props} />;
}
