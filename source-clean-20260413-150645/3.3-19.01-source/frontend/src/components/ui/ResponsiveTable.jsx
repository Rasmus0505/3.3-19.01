import { ChevronRight } from "lucide-react";

import { cn } from "../../lib/utils";
import { Card, CardContent } from "./card";
import { ScrollArea } from "./scroll-area";
import { Skeleton } from "./skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./table";

export function ResponsiveTable({
  columns,
  data,
  getRowKey,
  minWidth = 960,
  emptyText = "暂无数据",
  loading = false,
  mobileTitle,
  mobileDescription,
  mobileFooter,
  mobileActions,
  className,
  tableClassName,
}) {
  if (loading && (!data || data.length === 0)) {
    return (
      <div className={cn("space-y-3", className)}>
        <Skeleton className="hidden h-[280px] rounded-3xl md:block" />
        <div className="space-y-3 md:hidden">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-36 rounded-3xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="hidden md:block">
        <ScrollArea className="w-full rounded-3xl border bg-card shadow-sm">
          <Table className={cn(tableClassName)} style={{ minWidth }}>
            <TableHeader>
              <TableRow>
                {columns.map((column) => (
                  <TableHead key={column.key} className={column.headerClassName}>
                    {column.header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.length > 0 ? (
                data.map((item) => (
                  <TableRow key={getRowKey(item)}>
                    {columns.map((column) => (
                      <TableCell key={column.key} className={column.cellClassName}>
                        {column.render(item)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="py-10 text-center text-muted-foreground">
                    {emptyText}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </div>

      <div className="space-y-3 md:hidden">
        {data.length > 0 ? (
          data.map((item) => (
            <Card key={getRowKey(item)} className="rounded-3xl border shadow-sm">
              <CardContent className="space-y-3 p-4">
                <div className="space-y-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{mobileTitle?.(item) || "--"}</p>
                      {mobileDescription ? <p className="text-xs text-muted-foreground">{mobileDescription(item)}</p> : null}
                    </div>
                    {mobileActions ? <div className="shrink-0">{mobileActions(item)}</div> : null}
                  </div>
                  <div className="grid gap-2 pt-1">
                    {columns
                      .filter((column) => column.mobileLabel)
                      .map((column) => (
                        <div key={column.key} className="flex items-start justify-between gap-3 rounded-2xl bg-muted/30 px-3 py-2">
                          <p className="text-xs text-muted-foreground">{column.mobileLabel}</p>
                          <div className="max-w-[60%] text-right text-sm">{column.render(item)}</div>
                        </div>
                      ))}
                  </div>
                  {mobileFooter ? (
                    <div className="flex items-center justify-between rounded-2xl border border-dashed px-3 py-2 text-xs text-muted-foreground">
                      <span>{mobileFooter(item)}</span>
                      <ChevronRight className="size-3.5" />
                    </div>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="rounded-3xl border border-dashed bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">{emptyText}</div>
        )}
      </div>
    </div>
  );
}
