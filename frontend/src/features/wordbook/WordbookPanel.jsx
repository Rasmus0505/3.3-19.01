import { BookOpenText, Trash2, ExternalLink } from "lucide-react";
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
import { LessonPlayerPopup } from "./LessonPlayerPopup";

const REVIEW_ACTIONS = [
  { grade: "again", label: "重来" },
  { grade: "hard", label: "很吃力" },
  { grade: "good", label: "想起来了" },
  { grade: "easy", label: "很轻松" },
];

function formatDateTime(value) {
  if (!value) return "待安排";
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

function formatMemoryScore(value) {
  const safeValue = Math.max(0, Math.min(1, Number(value || 0)));
  return `${Math.round(safeValue * 100)}%`;
}

export function WordbookPanel({ apiCall, refreshToken = 0 }) {
  const [items, setItems] = useState([]);
  const [availableLessons, setAvailableLessons] = useState([]);
  const [reviewQueue, setReviewQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusText, setStatusText] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [sourceLessonId, setSourceLessonId] = useState("all");
  const [sortOrder, setSortOrder] = useState("recent");
  const [busyEntryId, setBusyEntryId] = useState(0);
  const [dueCount, setDueCount] = useState(0);
  const [panelMode, setPanelMode] = useState("list");
  const [reviewPreview, setReviewPreview] = useState(null);
  const [todayCompleted, setTodayCompleted] = useState(0);
  const [reviewFeedback, setReviewFeedback] = useState(null);
  const [lessonPopup, setLessonPopup] = useState({ open: false, lessonId: null, sentenceIndex: 0 });

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
      setDueCount(Math.max(0, Number(data.due_count || 0)));
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

  const loadReviewPreview = useCallback(async (entryId) => {
    try {
      const resp = await apiCall(`/api/wordbook/review-preview/${entryId}`);
      const data = await parseResponse(resp);
      if (resp.ok && data.grades) {
        setReviewPreview(data);
      }
    } catch (_) {
      setReviewPreview(null);
    }
  }, [apiCall]);

  async function loadReviewQueue() {
    setBusyEntryId(-1);
    setReviewPreview(null);
    setReviewFeedback(null);
    try {
      const resp = await apiCall("/api/wordbook/review-queue");
      const data = await parseResponse(resp);
      if (!resp.ok) {
        toast.error(toErrorText(data, "加载复习队列失败"));
        return;
      }
      const nextItems = Array.isArray(data.items) ? data.items : [];
      setReviewQueue(nextItems);
      setDueCount(Math.max(0, Number(data.total || 0)));
      setTodayCompleted(0);
      setPanelMode("review");
      if (nextItems.length > 0) {
        void loadReviewPreview(nextItems[0].id);
      }
      if (!nextItems.length) {
        toast.message("当前没有到期词条");
      }
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
      setReviewQueue((current) => current.filter((item) => Number(item.id || 0) !== Number(entryId)));
      await loadWordbook();
    } catch (error) {
      toast.error(`网络错误: ${String(error)}`);
    } finally {
      setBusyEntryId(0);
    }
  }

  async function handleReview(grade) {
    const currentItem = reviewQueue[0];
    if (!currentItem) return;
    setBusyEntryId(Number(currentItem.id || 0));
    try {
      const resp = await apiCall(`/api/wordbook/${currentItem.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grade }),
      });
      const data = await parseResponse(resp);
      if (!resp.ok) {
        toast.error(toErrorText(data, "提交复习结果失败"));
        return;
      }

      const remainingItems = reviewQueue.slice(1);
      setReviewQueue(remainingItems);
      setDueCount(Math.max(0, Number(data.remaining_due || 0)));
      setTodayCompleted((prev) => prev + 1);
      setReviewPreview(null);

      if (data.review_result) {
        const { previous_interval, new_interval, interval_change } = data.review_result;
        setReviewFeedback({
          message: `复习间隔：${previous_interval} → ${new_interval}`,
          subtext: interval_change,
        });
        setTimeout(() => {
          setReviewFeedback(null);
        }, 1500);
      } else {
        toast.success(data.message || "已记录复习结果");
      }

      if (remainingItems.length > 0) {
        void loadReviewPreview(remainingItems[0].id);
      }

      await loadWordbook();
    } catch (error) {
      toast.error(`网络错误: ${String(error)}`);
    } finally {
      setBusyEntryId(0);
    }
  }

  const reviewItem = reviewQueue[0] || null;
  const todayTotal = todayCompleted + reviewQueue.length;
  const progressPercent = todayTotal > 0 ? Math.round((todayCompleted / todayTotal) * 100) : 0;

  const getIntervalLabel = (grade) => {
    if (!reviewPreview?.grades) return "";
    const gradeData = reviewPreview.grades.find((g) => g.grade === grade);
    return gradeData?.interval || "";
  };

  const openLessonPopup = useCallback((lessonId, sentenceIndex) => {
    setLessonPopup({ open: true, lessonId, sentenceIndex: sentenceIndex || 0 });
  }, []);

  const closeLessonPopup = useCallback(() => {
    setLessonPopup({ open: false, lessonId: null, sentenceIndex: 0 });
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BookOpenText className="size-4" />
          生词本
        </CardTitle>
        <CardDescription>在沉浸学习里收下词条后，可以直接查看到期复习项、最新语境和下次复习时间。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-muted/10 px-4 py-3">
          <div className="space-y-1">
            <p className="text-sm font-medium">开始复习</p>
            <p className="text-xs text-muted-foreground">当前有 {dueCount} 条到期词条，可直接进入复习模式。</p>
          </div>
          <div className="flex gap-2">
            {panelMode === "review" ? (
              <Button type="button" variant="outline" className="h-9 px-4" onClick={() => setPanelMode("list")}>
                返回列表
              </Button>
            ) : null}
            <Button type="button" className="h-9 px-4" disabled={busyEntryId === -1} onClick={() => void loadReviewQueue()}>
              开始复习
            </Button>
          </div>
        </div>

        {panelMode === "list" ? (
          <>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">词条状态</p>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">待复习</SelectItem>
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
                <p className="text-base font-medium">{statusFilter === "active" ? "还没有待复习词条" : "还没有已掌握词条"}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {statusFilter === "active" ? "去沉浸学习里收藏词条后，这里会显示最新语境和复习安排。" : "记忆率达到目标后，会集中显示在这里。"}
                </p>
              </div>
            ) : null}

            {!loading ? (
              <div className="space-y-3">
                {items.map((item) => {
                  const busy = busyEntryId === Number(item.id || 0);
                  const isMastered = Number(item.memory_score || 0) >= 0.85;
                  return (
                    <div key={item.id} className="rounded-2xl border bg-background p-4">
                      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0 space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="truncate text-lg font-semibold">{item.entry_text}</div>
                            <Badge variant={isMastered ? "secondary" : "outline"}>
                              {isMastered ? "已掌握" : `记忆率 ${formatMemoryScore(item.memory_score)}`}
                            </Badge>
                          </div>
                          <div className="space-y-1 text-sm text-muted-foreground">
                            <p>英文语境：{item.latest_sentence_en || "暂无英文语境"}</p>
                            <p>中文语境：{item.latest_sentence_zh || "暂无中文语境"}</p>
                            <p>下次复习：{formatDateTime(item.next_review_at)}</p>
                            <p>复习次数：{Number(item.review_count || 0)}</p>
                            <p>记忆率：{formatMemoryScore(item.memory_score)}</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                            <span>来源课程：{item.source_lesson_title || "未知课程"}</span>
                            <span>收录记录：{Number(item.source_count || 0)} 条</span>
                            <span>答错次数：{Number(item.wrong_count || 0)} 次</span>
                            <span>最近收录：{formatDateTime(item.latest_collected_at)}</span>
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-wrap gap-2">
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
          </>
        ) : (
          <div className="space-y-4 rounded-2xl border bg-muted/5 p-4">
            {!reviewItem ? (
              <div className="rounded-2xl border border-dashed bg-background px-6 py-10 text-center">
                <p className="text-base font-medium">
                  {todayCompleted > 0 ? "今日复习完成" : "当前没有到期词条"}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">回到列表继续收集或稍后再来复习。</p>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">今天复习进度：{todayCompleted} / {todayTotal} 张</p>
                    <div className="mt-1 h-2 w-48 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-blue-500 transition-all duration-300"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">记忆率 {formatMemoryScore(reviewItem.memory_score)}</Badge>
                    <span className="text-xs text-muted-foreground">剩余 {reviewQueue.length} 条</span>
                  </div>
                </div>

                {reviewFeedback ? (
                  <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-center dark:border-green-900 dark:bg-green-950">
                    <p className="text-sm font-medium text-green-700 dark:text-green-300">✓ 已记录复习结果</p>
                    <p className="mt-1 text-sm text-green-600 dark:text-green-400">{reviewFeedback.message}</p>
                    {reviewFeedback.subtext && (
                      <p className="text-xs text-green-500 dark:text-green-500">({reviewFeedback.subtext})</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2 rounded-2xl border bg-background p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <p className="text-lg font-semibold">{reviewItem.entry_text}</p>
                        <p className="mt-2 text-sm text-muted-foreground">英文语境：{reviewItem.latest_sentence_en || "暂无英文语境"}</p>
                        <p className="text-sm text-muted-foreground">中文语境：{reviewItem.latest_sentence_zh || "暂无中文语境"}</p>
                        <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                          <span>下次复习：{formatDateTime(reviewItem.next_review_at)}</span>
                          <span>复习次数：{Number(reviewItem.review_count || 0)}</span>
                          <span>答错次数：{Number(reviewItem.wrong_count || 0)}</span>
                        </div>
                      </div>
                      {reviewItem.source_lesson_id ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="shrink-0"
                          onClick={() => void openLessonPopup(reviewItem.source_lesson_id, reviewItem.latest_sentence_idx)}
                        >
                          <ExternalLink className="size-4" />
                          查看课程
                        </Button>
                      ) : null}
                    </div>
                  </div>
                )}

                {!reviewFeedback ? (
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    {REVIEW_ACTIONS.map((action) => (
                      <div key={action.grade} className="space-y-1">
                        <Button
                          type="button"
                          variant={action.grade === "good" ? "default" : "outline"}
                          className="h-11 w-full px-4"
                          disabled={busyEntryId === Number(reviewItem.id || 0)}
                          onClick={() => void handleReview(action.grade)}
                        >
                          {action.label}
                        </Button>
                        <p className="text-center text-xs text-muted-foreground">
                          {getIntervalLabel(action.grade) || "—"}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </>
            )}
          </div>
        )}
      </CardContent>

      <LessonPlayerPopup
        open={lessonPopup.open}
        onClose={closeLessonPopup}
        lessonId={lessonPopup.lessonId}
        sentenceIndex={lessonPopup.sentenceIndex}
      />
    </Card>
  );
}
