import { BookOpenText, Check, RotateCcw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { parseResponse, toErrorText } from "../../shared/api/client";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from "../../shared/ui";

function formatCollectedAt(value) {
  if (!value) return "时间未知";
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch (_) {
    return "时间未知";
  }
}

export function WordbookPanel({ apiCall, refreshToken = 0 }) {
  const [items, setItems] = useState([]);
  const [availableLessons, setAvailableLessons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusText, setStatusText] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [sourceLessonId, setSourceLessonId] = useState("all");
  const [sortOrder, setSortOrder] = useState("recent");
  const [busyEntryId, setBusyEntryId] = useState(0);

  const loadWordbook = useCallback(async () => {
    setLoading(true);
    setStatusText("");
    try {
      const params = new URLSearchParams({
        status: statusFilter,
        sort: sortOrder,
      });
      if (sourceLessonId !== "all") {
        params.set("source_lesson_id", sourceLessonId);
      }
      const resp = await apiCall(`/api/wordbook?${params.toString()}`);
      const data = await parseResponse(resp);
      if (!resp.ok) {
        setStatusText(toErrorText(data, "加载生词本失败"));
        return;
      }
      setItems(Array.isArray(data.items) ? data.items : []);
      setAvailableLessons(Array.isArray(data.available_lessons) ? data.available_lessons : []);
    } catch (error) {
      setStatusText(`网络错误: ${String(error)}`);
    } finally {
      setLoading(false);
    }
  }, [apiCall, sortOrder, sourceLessonId, statusFilter]);

  useEffect(() => {
    void loadWordbook();
  }, [loadWordbook, refreshToken]);

  useEffect(() => {
    if (sourceLessonId === "all") return;
    if (availableLessons.some((item) => String(item.lesson_id) === String(sourceLessonId))) return;
    setSourceLessonId("all");
  }, [availableLessons, sourceLessonId]);

  async function handleStatusUpdate(entryId, nextStatus) {
    setBusyEntryId(entryId);
    try {
      const resp = await apiCall(`/api/wordbook/${entryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await parseResponse(resp);
      if (!resp.ok) {
        toast.error(toErrorText(data, "更新生词本状态失败"));
        return;
      }
      toast.success(data.message || (nextStatus === "mastered" ? "已标记为掌握" : "已恢复到生词本"));
      await loadWordbook();
    } catch (error) {
      toast.error(`网络错误: ${String(error)}`);
    } finally {
      setBusyEntryId(0);
    }
  }

  async function handleDelete(entryId) {
    setBusyEntryId(entryId);
    try {
      const resp = await apiCall(`/api/wordbook/${entryId}`, {
        method: "DELETE",
      });
      const data = await parseResponse(resp);
      if (!resp.ok) {
        toast.error(toErrorText(data, "删除生词本词条失败"));
        return;
      }
      toast.success("已删除词条");
      await loadWordbook();
    } catch (error) {
      toast.error(`网络错误: ${String(error)}`);
    } finally {
      setBusyEntryId(0);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BookOpenText className="size-4" />
          生词本
        </CardTitle>
        <CardDescription>在沉浸学习里收下单词或短语，并按课程来源和掌握状态管理它们。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">词条状态</p>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">仅看生词</SelectItem>
                <SelectItem value="mastered">已掌握</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">来源课程</p>
            <Select value={sourceLessonId} onValueChange={setSourceLessonId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部课程</SelectItem>
                {availableLessons.map((item) => (
                  <SelectItem key={item.lesson_id} value={String(item.lesson_id)}>
                    {item.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">排序方式</p>
            <Select value={sortOrder} onValueChange={setSortOrder}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">最近收录</SelectItem>
                <SelectItem value="oldest">最早收录</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {statusText ? <p className="text-sm text-destructive">{statusText}</p> : null}

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-36 w-full rounded-2xl" />
            <Skeleton className="h-36 w-full rounded-2xl" />
          </div>
        ) : null}

        {!loading && items.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-muted/15 px-6 py-10 text-center">
            <p className="text-base font-medium">{statusFilter === "active" ? "还没有生词" : "还没有已掌握词条"}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {statusFilter === "active" ? "去沉浸学习里点击单词或选中连续短语，就会出现在这里。" : "把词条标记为掌握后，会集中显示在这里。"}
            </p>
          </div>
        ) : null}

        {!loading ? (
          <div className="space-y-3">
            {items.map((item) => {
              const busy = busyEntryId === Number(item.id || 0);
              return (
                <div key={item.id} className="rounded-2xl border bg-background p-4">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="truncate text-lg font-semibold">{item.entry_text}</div>
                        <Badge variant={item.entry_type === "phrase" ? "secondary" : "outline"}>
                          {item.entry_type === "phrase" ? "短语" : "单词"}
                        </Badge>
                        <Badge variant={item.status === "mastered" ? "secondary" : "outline"}>
                          {item.status === "mastered" ? "已掌握" : "生词"}
                        </Badge>
                      </div>
                      <div className="space-y-1 text-sm text-muted-foreground">
                        <p>英文语境：{item.latest_sentence_en || "暂无英文语境"}</p>
                        <p>中文语境：{item.latest_sentence_zh || "暂无中文语境"}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span>来源课程：{item.source_lesson_title || "未知课程"}</span>
                        <span>收录记录：{Number(item.source_count || 0)} 条</span>
                        <span>最近收录：{formatCollectedAt(item.latest_collected_at)}</span>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2">
                      {item.status === "active" ? (
                        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void handleStatusUpdate(item.id, "mastered")}>
                          <Check className="size-4" />
                          标记掌握
                        </Button>
                      ) : (
                        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void handleStatusUpdate(item.id, "active")}>
                          <RotateCcw className="size-4" />
                          恢复生词
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        disabled={busy}
                        onClick={() => void handleDelete(item.id)}
                      >
                        <Trash2 className="size-4" />
                        删除
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
