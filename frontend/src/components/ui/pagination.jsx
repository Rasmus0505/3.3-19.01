import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";

import { cn } from "../../lib/utils";

export function Pagination({ className, ...props }) {
  return <nav data-slot="pagination" role="navigation" aria-label="pagination" className={cn("mx-auto flex w-full justify-center", className)} {...props} />;
}

export function PaginationContent({ className, ...props }) {
  return <ul data-slot="pagination-content" className={cn("flex flex-row items-center gap-1", className)} {...props} />;
}

export function PaginationItem({ className, ...props }) {
  return <li data-slot="pagination-item" className={cn("", className)} {...props} />;
}

export function PaginationLink({ className, isActive = false, disabled = false, ...props }) {
  return (
    <button
      type="button"
      data-slot="pagination-link"
      aria-current={isActive ? "page" : undefined}
      disabled={disabled}
      className={cn(
        "cn-button cn-button-size-sm inline-flex items-center justify-center px-3",
        isActive ? "cn-button-variant-secondary" : "cn-button-variant-outline",
        className,
      )}
      {...props}
    />
  );
}

export function PaginationPrevious({ className, ...props }) {
  return (
    <PaginationLink
      aria-label="Go to previous page"
      className={cn("gap-1.5 px-2.5", className)}
      {...props}
    >
      <ChevronLeft className="size-4" />
      <span>上一页</span>
    </PaginationLink>
  );
}

export function PaginationNext({ className, ...props }) {
  return (
    <PaginationLink
      aria-label="Go to next page"
      className={cn("gap-1.5 px-2.5", className)}
      {...props}
    >
      <span>下一页</span>
      <ChevronRight className="size-4" />
    </PaginationLink>
  );
}

export function PaginationEllipsis({ className, ...props }) {
  return (
    <span
      data-slot="pagination-ellipsis"
      aria-hidden
      className={cn("flex h-8 w-8 items-center justify-center", className)}
      {...props}
    >
      <MoreHorizontal className="size-4" />
      <span className="sr-only">More pages</span>
    </span>
  );
}

