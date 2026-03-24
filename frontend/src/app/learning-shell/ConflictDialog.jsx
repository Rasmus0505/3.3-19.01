import { AlertTriangle, Check, ChevronDown, GitMerge, X } from "lucide-react";
import { useState } from "react";
import { Button } from "../../shared/ui";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../shared/ui";

function buildDiffLines(local, remote) {
  const fields = ["title", "duration_ms", "asr_model", "source_filename"];
  const lines = [];
  for (const field of fields) {
    const lv = String(local?.[field] || "");
    const rv = String(remote?.[field] || "");
    if (lv !== rv) {
      lines.push({ field, local: lv, remote: rv });
    }
  }
  return lines;
}

function ConflictDiff({ local, remote }) {
  const diffs = buildDiffLines(local, remote);
  if (!diffs.length) {
    return (
      <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
        两个版本数据相同，请手动确认保留哪个版本
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {diffs.map(({ field, local: lv, remote: rv }) => (
        <div key={field} className="rounded-lg border bg-muted/20 p-2 text-sm">
          <p className="mb-1 font-medium text-foreground">{field}</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-xs text-muted-foreground">本地</p>
              <p className="break-all font-mono text-xs">{lv || "(空)"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">云端</p>
              <p className="break-all font-mono text-xs">{rv || "(空)"}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ConflictItem({ conflict, onResolve, resolving }) {
  const [expanded, setExpanded] = useState(false);
  const isCourse = conflict.table_name === "courses";
  const local = conflict.local_data || {};
  const remote = conflict.remote_data || {};

  return (
    <div className="rounded-xl border p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="size-4 text-yellow-500" />
          <span className="font-medium">{isCourse ? `课程: ${local.title || remote.title || conflict.record_id}` : conflict.record_id}</span>
        </div>
        <button
          onClick={() => setExpanded((e) => !e)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {expanded ? "收起" : "详情"}
          <ChevronDown className={`size-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
      </div>

      {expanded && <ConflictDiff local={local} remote={remote} />}

      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onResolve(conflict.id, "local")}
          disabled={resolving}
          className="flex-1"
        >
          <Check className="mr-1 size-3" />
          保留本地
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onResolve(conflict.id, "remote")}
          disabled={resolving}
          className="flex-1"
        >
          <Check className="mr-1 size-3" />
          保留云端
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => onResolve(conflict.id, "merge")}
          disabled={resolving}
          className="flex-1"
        >
          <GitMerge className="mr-1 size-3" />
          合并
        </Button>
      </div>
    </div>
  );
}

export function ConflictDialog({ open, onOpenChange, conflicts, onResolve }) {
  const [resolving, setResolving] = useState(false);

  async function handleResolve(conflictId, strategy) {
    setResolving(true);
    try {
      await onResolve(conflictId, strategy);
    } finally {
      setResolving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-yellow-500" />
            数据冲突
          </DialogTitle>
          <DialogDescription>
            检测到 {conflicts.length} 个数据冲突，请选择保留哪个版本。
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-96 space-y-3 overflow-y-auto py-2">
          {conflicts.map((c) => (
            <ConflictItem key={c.id} conflict={c} onResolve={handleResolve} resolving={resolving} />
          ))}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            <X className="mr-1 size-4" />
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
