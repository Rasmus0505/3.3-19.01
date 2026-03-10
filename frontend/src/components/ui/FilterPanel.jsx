import { Search, SlidersHorizontal, X } from "lucide-react";

import { cn } from "../../lib/utils";
import { Button } from "./button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./card";

export function FilterPanel({
  title = "筛选条件",
  description,
  onSubmit,
  onReset,
  submitLabel = "查询",
  resetLabel = "重置",
  submitDisabled = false,
  actions,
  children,
  className,
  contentClassName,
}) {
  return (
    <Card className={cn("rounded-3xl border shadow-sm", className)}>
      <CardHeader className="space-y-1 pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <SlidersHorizontal className="size-4" />
          {title}
        </CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className={cn("space-y-4", contentClassName)}>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit?.(event);
          }}
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{children}</div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" className="rounded-xl" disabled={submitDisabled}>
              <Search className="size-4" />
              {submitLabel}
            </Button>
            {onReset ? (
              <Button type="button" variant="outline" className="rounded-xl" onClick={onReset}>
                <X className="size-4" />
                {resetLabel}
              </Button>
            ) : null}
            <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
