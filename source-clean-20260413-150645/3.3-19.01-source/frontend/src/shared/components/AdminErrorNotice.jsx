import { AlertCircle } from "lucide-react";

import { ErrorCopyButton } from "./ErrorCopyButton";
import { getErrorMessage } from "../lib/errorFormatter";
import { Alert, AlertDescription, AlertTitle, Badge } from "../ui";

export function AdminErrorNotice({ error, className = "" }) {
  if (!error) return null;

  return (
    <Alert className={className}>
      <AlertCircle className="size-4" />
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <AlertTitle>请求失败</AlertTitle>
          <Badge variant="destructive">{error.code || "UNKNOWN_ERROR"}</Badge>
          {error.status ? <Badge variant="outline">HTTP {error.status}</Badge> : null}
        </div>
        <AlertDescription className="space-y-2">
          <p className="break-words">{getErrorMessage(error)}</p>
          {error.context?.action || error.context?.endpoint ? (
            <p className="text-xs text-muted-foreground">
              {error.context?.action ? `动作：${error.context.action}` : ""}
              {error.context?.action && error.context?.endpoint ? " · " : ""}
              {error.context?.endpoint ? `接口：${error.context.endpoint}` : ""}
            </p>
          ) : null}
          {error.details ? <pre className="overflow-x-auto rounded-xl bg-muted/50 p-3 text-xs whitespace-pre-wrap">{JSON.stringify(error.details, null, 2)}</pre> : null}
        </AlertDescription>
        <div className="flex flex-wrap items-center gap-2">
          <ErrorCopyButton error={error} />
          <span className="text-xs text-muted-foreground">可按 Ctrl+Shift+C 复制最近一次错误</span>
        </div>
      </div>
    </Alert>
  );
}
