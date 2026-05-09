import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  CalendarClock,
  Clock3,
  PencilLine,
  TimerReset,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from "../../shared/ui";
import { useDashboardData } from "./useDashboardData";

function formatMinutes(minutes) {
  const safeMinutes = Math.max(0, Number(minutes || 0));
  const hours = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;
  if (hours > 0) {
    return `${hours}小时 ${mins}分钟`;
  }
  return `${mins}分钟`;
}

function formatDateTime(value) {
  if (!value) return "未结束";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未结束";
  return date.toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(seconds) {
  const safeSeconds = Math.max(0, Number(seconds || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainSeconds = safeSeconds % 60;
  if (hours > 0) {
    return `${hours}小时${minutes}分${remainSeconds}秒`;
  }
  return `${minutes}分${remainSeconds}秒`;
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-32 rounded-3xl" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Skeleton className="h-[360px] rounded-3xl" />
        <Skeleton className="h-[360px] rounded-3xl" />
      </div>
      <Skeleton className="h-[480px] rounded-3xl" />
    </div>
  );
}

function SummaryCard({ title, value, hint, icon: Icon }) {
  return (
    <Card className="overflow-hidden rounded-3xl border-border/70 bg-gradient-to-br from-white via-slate-50 to-slate-100 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardDescription className="text-xs uppercase tracking-[0.24em] text-slate-500">
              {title}
            </CardDescription>
            <CardTitle className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
              {value}
            </CardTitle>
          </div>
          <div className="rounded-2xl bg-slate-950 p-3 text-white shadow-lg shadow-slate-950/10">
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 text-sm text-slate-600">{hint}</CardContent>
    </Card>
  );
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-lg">
      <div className="font-medium text-slate-900">{label}</div>
      <div className="mt-1 text-slate-600">{payload[0].value} 分钟</div>
    </div>
  );
}

function statusBadge(status) {
  if (status === "completed") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "paused") return "bg-amber-50 text-amber-700 border-amber-200";
  if (status === "active") return "bg-sky-50 text-sky-700 border-sky-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function SessionEditDialog({ open, session, saving, onOpenChange, onSave }) {
  const [notes, setNotes] = useState("");
  const [effectiveSeconds, setEffectiveSeconds] = useState("");

  useEffect(() => {
    setNotes(session?.notes || "");
    setEffectiveSeconds(String(session?.effective_seconds ?? ""));
  }, [session]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl rounded-3xl">
        <DialogHeader>
          <DialogTitle>编辑学习记录</DialogTitle>
          <DialogDescription>
            你可以修正本次有效学习时长，或者补充备注。正在进行中的 session 不建议在这里改动。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="text-sm font-medium text-slate-800">课程</div>
            <div className="rounded-2xl border border-border bg-muted/40 px-4 py-3 text-sm text-slate-700">
              {session?.title_snapshot || "未命名课程"}
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium text-slate-800">有效学习秒数</div>
            <Input
              type="number"
              min="0"
              value={effectiveSeconds}
              onChange={(event) => setEffectiveSeconds(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium text-slate-800">备注</div>
            <Textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="min-h-32 rounded-2xl border border-input bg-background px-4 py-3"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            取消
          </Button>
          <Button
            onClick={() => onSave({
              effective_seconds: Math.max(0, Number(effectiveSeconds || 0)),
              notes,
            })}
            disabled={saving}
          >
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DashboardPage({ apiCall }) {
  const { stats, loading, error, refetch } = useDashboardData(apiCall);
  const [editingSession, setEditingSession] = useState(null);
  const [saving, setSaving] = useState(false);

  const dailyTrend = useMemo(() => {
    const list = Array.isArray(stats?.daily_minutes) ? stats.daily_minutes : [];
    return list.slice(-14).map((item) => ({
      ...item,
      shortDate: String(item.date || "").slice(5),
    }));
  }, [stats]);

  const lessonTrend = useMemo(() => {
    const list = Array.isArray(stats?.lesson_minutes) ? stats.lesson_minutes : [];
    return list.slice(0, 8).map((item, index) => ({
      ...item,
      fill: index % 2 === 0 ? "#0f172a" : "#64748b",
    }));
  }, [stats]);

  const handleSaveSession = async (payload) => {
    if (!editingSession?.id) return;
    setSaving(true);
    try {
      const response = await apiCall(
        `/api/learning-sessions/${editingSession.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.message || "保存失败");
      }
      toast.success("学习记录已更新");
      setEditingSession(null);
      await refetch();
    } catch (err) {
      toast.error(err.message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSession = async (session) => {
    if (!session?.id) return;
    const confirmed = window.confirm(`确认删除学习记录「${session.title_snapshot || "未命名课程"}」吗？`);
    if (!confirmed) return;
    try {
      const response = await apiCall(`/api/learning-sessions/${session.id}`, { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.message || "删除失败");
      }
      toast.success("学习记录已删除");
      await refetch();
    } catch (err) {
      toast.error(err.message || "删除失败");
    }
  };

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-[1480px] p-2 pb-6">
        <DashboardSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-[1480px] p-2 pb-6">
        <div className="rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-4 p-2 pb-6">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-[32px] border border-border/70 bg-[radial-gradient(circle_at_top_left,_rgba(15,23,42,0.08),_transparent_45%),linear-gradient(135deg,#ffffff_0%,#f8fafc_55%,#e2e8f0_100%)] px-6 py-6 shadow-sm"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <Badge className="rounded-full bg-slate-950 px-3 py-1 text-[10px] font-semibold tracking-[0.24em] text-white">
              STUDY TIME CENTER
            </Badge>
            <div>
              <h2 className="text-3xl font-semibold tracking-tight text-slate-950">学习时间工作台</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                这里只看真正沉浸学习产生的 session。你可以回顾最近的有效时长、课程分布，以及逐条修正或删除学习记录。
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <Badge variant="outline" className="rounded-full px-3 py-1">
              最近课程：{stats?.latest_lesson_title || "暂无"}
            </Badge>
            <Badge variant="outline" className="rounded-full px-3 py-1">
              最近学习：{formatDateTime(stats?.latest_activity_at)}
            </Badge>
          </div>
        </div>
      </motion.div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="总学习时长"
          value={formatMinutes(stats?.total_minutes)}
          hint="累计有效学习时间，只统计被 session 记录的沉浸学习。"
          icon={Clock3}
        />
        <SummaryCard
          title="今日学习"
          value={formatMinutes(stats?.today_minutes)}
          hint="今天已经投入的有效学习分钟数。"
          icon={TimerReset}
        />
        <SummaryCard
          title="连续天数"
          value={`${stats?.streak_days || 0} 天`}
          hint="根据最近有有效学习 session 的日期连续计算。"
          icon={Activity}
        />
        <SummaryCard
          title="最近活跃"
          value={stats?.latest_activity_at ? formatDateTime(stats.latest_activity_at) : "暂无"}
          hint="最近一次学习记录同步到服务端的时间。"
          icon={CalendarClock}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Card className="rounded-3xl border-border/70 bg-white/90 shadow-sm">
          <CardHeader>
            <CardTitle>最近 14 天学习趋势</CardTitle>
            <CardDescription>按天查看有效学习分钟数，帮助你判断最近节奏是否稳定。</CardDescription>
          </CardHeader>
          <CardContent className="h-[320px] pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyTrend} barCategoryGap={18}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="shortDate" stroke="#64748b" tickLine={false} axisLine={false} />
                <YAxis stroke="#64748b" tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(148, 163, 184, 0.08)" }} />
                <Bar dataKey="minutes" radius={[12, 12, 4, 4]} fill="#0f172a" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-border/70 bg-white/90 shadow-sm">
          <CardHeader>
            <CardTitle>课程时长分布</CardTitle>
            <CardDescription>哪些课程真正占据了你的学习时间，一眼就能看出来。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {lessonTrend.length ? (
              lessonTrend.map((item) => (
                <div key={`${item.lesson_id}-${item.title_snapshot}`} className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="truncate text-sm font-medium text-slate-900">
                      {item.title_snapshot || `课程 ${item.lesson_id}`}
                    </div>
                    <div className="text-xs text-slate-500">{item.minutes} 分钟</div>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100">
                    <div
                      className="h-2 rounded-full bg-slate-900 transition-all"
                      style={{
                        width: `${Math.max(8, Math.min(100, (item.minutes / Math.max(1, lessonTrend[0]?.minutes || 1)) * 100))}%`,
                      }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
                还没有可展示的课程学习数据。
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-3xl border-border/70 bg-white/90 shadow-sm">
        <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <CardTitle>学习 Session 列表</CardTitle>
            <CardDescription>
              这里展示每一次沉浸学习。你可以补充备注、修正时长，或删除无效记录。
            </CardDescription>
          </div>
          <Button variant="outline" onClick={() => refetch()}>
            刷新数据
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>课程</TableHead>
                <TableHead>开始时间</TableHead>
                <TableHead>结束时间</TableHead>
                <TableHead>有效学习时长</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>备注</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(stats?.recent_sessions || []).map((session) => (
                <TableRow key={session.id}>
                  <TableCell className="max-w-[240px]">
                    <div className="truncate font-medium text-slate-900">{session.title_snapshot || `课程 ${session.lesson_id}`}</div>
                    <div className="mt-1 text-xs text-slate-500">ID #{session.id}</div>
                  </TableCell>
                  <TableCell>{formatDateTime(session.started_at)}</TableCell>
                  <TableCell>{formatDateTime(session.ended_at)}</TableCell>
                  <TableCell>{formatDuration(session.effective_seconds)}</TableCell>
                  <TableCell>
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusBadge(session.status)}`}>
                      {session.status}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-[280px]">
                    <div className="line-clamp-2 text-sm text-slate-600">
                      {session.notes || "暂无备注"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setEditingSession(session)}>
                        <PencilLine className="mr-1 h-3.5 w-3.5" />
                        编辑
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleDeleteSession(session)}>
                        <Trash2 className="mr-1 h-3.5 w-3.5" />
                        删除
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <SessionEditDialog
        open={Boolean(editingSession)}
        session={editingSession}
        saving={saving}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setEditingSession(null);
          }
        }}
        onSave={handleSaveSession}
      />
    </div>
  );
}
