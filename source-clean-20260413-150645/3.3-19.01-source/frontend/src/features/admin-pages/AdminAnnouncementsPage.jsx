import { Bell, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { AdminErrorNotice } from "../../shared/components/AdminErrorNotice";
import { formatDateTimeBeijing } from "../../shared/lib/datetime";
import { formatNetworkError, formatResponseError, parseJsonSafely } from "../../shared/lib/errorFormatter";
import { useErrorHandler } from "../../shared/hooks/useErrorHandler";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../shared/ui";
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  Label,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
} from "../../shared/ui";

const ANNOUNCEMENT_TYPE_OPTIONS = [
  { value: "changelog", label: "更新日志" },
  { value: "banner", label: "公告" },
  { value: "modal", label: "重要公告" },
];

function getTypeBadgeVariant(type) {
  if (type === "modal") return "destructive";
  if (type === "banner") return "secondary";
  return "outline";
}

function AnnouncementListItem({ item, isSelected, onSelect, onDelete }) {
  return (
    <div
      className={`group relative flex cursor-pointer flex-col gap-1.5 rounded-2xl border px-4 py-3 transition-colors ${
        isSelected ? "border-upload-brand bg-upload-brand/5" : "border-border bg-card hover:bg-secondary"
      }`}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="flex-1 truncate text-[15px] font-semibold leading-snug">{item.title}</h4>
        <Badge
          variant={getTypeBadgeVariant(item.type)}
          className={`shrink-0 text-[11px] ${
            item.type === "banner" ? "border-upload-brand/20 bg-upload-brand/10 text-upload-brand" : ""
          } ${item.type === "modal" ? "border-destructive/20 bg-destructive/10 text-destructive" : ""}`}
        >
          {item.type === "changelog" ? "更新日志" : item.type === "banner" ? "公告" : "重要公告"}
        </Badge>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className={`size-1.5 rounded-full ${item.is_active ? "bg-green-500" : "bg-muted"}`} />
          <span className="text-[11px] text-muted-foreground">
            {item.is_active ? "已启用" : "已禁用"}
          </span>
          {item.is_pinned ? (
            <Badge variant="outline" className="ml-1 text-[10px]">置顶</Badge>
          ) : null}
        </div>
        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground hover:text-upload-brand"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(item);
            }}
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(item.id);
            }}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">{formatDateTimeBeijing(item.created_at).split(" ")[0]}</p>
    </div>
  );
}

function AnnouncementEditor({ announcement, onSave, onCancel, onDelete, submitting }) {
  const isNew = !announcement;

  const [title, setTitle] = useState(announcement?.title || "");
  const [type, setType] = useState(announcement?.type || "banner");
  const [content, setContent] = useState(announcement?.content || "");
  const [isActive, setIsActive] = useState(announcement?.is_active ?? true);
  const [isPinned, setIsPinned] = useState(announcement?.is_pinned ?? false);
  const [titleError, setTitleError] = useState("");

  useEffect(() => {
    if (announcement) {
      setTitle(announcement.title || "");
      setType(announcement.type || "banner");
      setContent(announcement.content || "");
      setIsActive(announcement.is_active ?? true);
      setIsPinned(announcement.is_pinned ?? false);
    } else {
      setTitle("");
      setType("banner");
      setContent("");
      setIsActive(true);
      setIsPinned(false);
    }
    setTitleError("");
  }, [announcement]);

  function handleSubmit() {
    const trimmed = title.trim();
    if (!trimmed) {
      setTitleError("请输入公告标题");
      return;
    }
    if (trimmed.length > 200) {
      setTitleError("标题不能超过 200 个字符");
      return;
    }
    onSave({
      title: trimmed,
      type,
      content: content.trim(),
      is_active: isActive,
      is_pinned: isPinned,
    });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-4 rounded-[24px] border bg-card p-5 shadow-sm">
        <div className="space-y-2">
          <Label htmlFor="ann-title">公告标题</Label>
          <Input
            id="ann-title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (titleError) setTitleError("");
            }}
            placeholder="请输入公告标题"
            maxLength={200}
            className={titleError ? "border-destructive" : ""}
          />
          {titleError ? (
            <p className="text-xs text-destructive">{titleError}</p>
          ) : (
            <p className="text-xs text-muted-foreground">{title.length}/200</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="ann-type">公告类型</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger id="ann-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ANNOUNCEMENT_TYPE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="ann-content">公告内容</Label>
          <Textarea
            id="ann-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="请输入公告内容（支持 Markdown 格式）"
            rows={8}
            className="resize-none"
          />
        </div>

        <div className="flex items-center justify-between rounded-2xl border bg-muted/40 px-3 py-2.5">
          <Label htmlFor="ann-active" className="cursor-pointer">启用状态</Label>
          <Switch
            id="ann-active"
            checked={isActive}
            onCheckedChange={setIsActive}
          />
        </div>

        <div className="flex items-center justify-between rounded-2xl border bg-muted/40 px-3 py-2.5">
          <Label htmlFor="ann-pinned" className="cursor-pointer">置顶公告</Label>
          <Switch
            id="ann-pinned"
            checked={isPinned}
            onCheckedChange={setIsPinned}
          />
        </div>

        <div className="flex items-center gap-2 pt-1">
          <Button
            className="flex-1 bg-upload-brand text-white hover:bg-upload-brand/90"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? "保存中..." : "保存"}
          </Button>
          <Button
            variant="secondary"
            onClick={onCancel}
            disabled={submitting}
          >
            取消
          </Button>
        </div>
      </div>
    </div>
  );
}

function AnnouncementEmptyState({ onNew }) {
  return (
    <div className="flex h-full flex-col items-center justify-center rounded-[24px] border border-dashed bg-muted/20 p-8 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-full border bg-card shadow-sm">
        <Bell className="size-6 text-muted-foreground" />
      </div>
      <h3 className="text-base font-semibold">暂无公告</h3>
      <p className="mt-1 max-w-[240px] text-sm text-muted-foreground">点击上方按钮创建第一条公告</p>
      <Button
        className="mt-5 bg-upload-brand text-white hover:bg-upload-brand/90"
        size="sm"
        onClick={onNew}
      >
        <Plus className="mr-1.5 size-4" />
        新建公告
      </Button>
    </div>
  );
}

export function AdminAnnouncementsPage({ apiCall }) {
  const [announcements, setAnnouncements] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState(null);
  const [status, setStatus] = useState("");
  const { error, clearError, captureError } = useErrorHandler();
  const initialized = useRef(false);

  const selectedAnnouncement = announcements.find((a) => a.id === selectedId) || null;

  const loadAnnouncements = useCallback(async () => {
    setLoading(true);
    setStatus("");
    clearError();
    try {
      const query = new URLSearchParams({ page: "1", page_size: "100" });
      const response = await apiCall(`/api/admin/announcements?${query.toString()}`);
      const data = await parseJsonSafely(response);
      if (!response.ok) {
        const formattedError = captureError(
          formatResponseError(response, data, {
            component: "AdminAnnouncementsPage",
            action: "加载公告列表",
            endpoint: "/api/admin/announcements",
            method: "GET",
            fallbackMessage: "加载公告列表失败",
          }),
        );
        setStatus(formattedError.displayMessage);
        return;
      }
      const items = Array.isArray(data.items) ? data.items : [];
      setAnnouncements(items);
    } catch (requestError) {
      const formattedError = captureError(
        formatNetworkError(requestError, {
          component: "AdminAnnouncementsPage",
          action: "加载公告列表",
          endpoint: "/api/admin/announcements",
          method: "GET",
        }),
      );
      setStatus(formattedError.displayMessage);
    } finally {
      setLoading(false);
    }
  }, [apiCall, captureError, clearError]);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      loadAnnouncements();
    }
  }, [loadAnnouncements]);

  async function handleSave(formData) {
    setSubmitting(true);
    setStatus("");
    clearError();
    try {
      const isEditing = Boolean(selectedId);
      const url = isEditing ? `/api/admin/announcements/${selectedId}` : "/api/admin/announcements";
      const method = isEditing ? "PUT" : "POST";
      const response = await apiCall(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await parseJsonSafely(response);
      if (!response.ok) {
        const formattedError = captureError(
          formatResponseError(response, data, {
            component: "AdminAnnouncementsPage",
            action: isEditing ? "更新公告" : "创建公告",
            endpoint: url,
            method,
            fallbackMessage: isEditing ? "更新公告失败" : "创建公告失败",
          }),
        );
        setStatus(formattedError.displayMessage);
        return;
      }
      toast.success(isEditing ? "公告已更新" : "公告已创建");
      setSelectedId(null);
      await loadAnnouncements();
    } catch (requestError) {
      const formattedError = captureError(
        formatNetworkError(requestError, {
          component: "AdminAnnouncementsPage",
          action: selectedId ? "更新公告" : "创建公告",
          endpoint: selectedId ? `/api/admin/announcements/${selectedId}` : "/api/admin/announcements",
          method: selectedId ? "PUT" : "POST",
        }),
      );
      setStatus(formattedError.displayMessage);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(announcementId) {
    setDeleteTargetId(announcementId);
    setDeleteDialogOpen(true);
  }

  async function confirmDelete() {
    if (!deleteTargetId) return;
    setSubmitting(true);
    setStatus("");
    clearError();
    try {
      const response = await apiCall(`/api/admin/announcements/${deleteTargetId}`, {
        method: "DELETE",
      });
      const data = await parseJsonSafely(response);
      if (!response.ok) {
        const formattedError = captureError(
          formatResponseError(response, data, {
            component: "AdminAnnouncementsPage",
            action: "删除公告",
            endpoint: `/api/admin/announcements/${deleteTargetId}`,
            method: "DELETE",
            fallbackMessage: "删除公告失败",
          }),
        );
        setStatus(formattedError.displayMessage);
        return;
      }
      toast.success("公告已删除");
      if (selectedId === deleteTargetId) setSelectedId(null);
      await loadAnnouncements();
    } catch (requestError) {
      const formattedError = captureError(
        formatNetworkError(requestError, {
          component: "AdminAnnouncementsPage",
          action: "删除公告",
          endpoint: `/api/admin/announcements/${deleteTargetId}`,
          method: "DELETE",
        }),
      );
      setStatus(formattedError.displayMessage);
    } finally {
      setSubmitting(false);
      setDeleteDialogOpen(false);
      setDeleteTargetId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">公告管理</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            创建、编辑、置顶和删除公告，支持更新日志、横幅和重要公告三种类型。
          </p>
        </div>
        <Button
          className="bg-upload-brand text-white hover:bg-upload-brand/90"
          size="sm"
          onClick={() => setSelectedId(null)}
        >
          <Plus className="mr-1.5 size-4" />
          新建公告
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1.6fr]">
        <Card className="rounded-[24px] border shadow-sm">
          <CardContent className="p-3">
            {loading && announcements.length === 0 ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }, (_, i) => (
                  <div key={i} className="h-[88px] animate-pulse rounded-2xl border bg-muted/50" />
                ))}
              </div>
            ) : announcements.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Bell className="mb-3 size-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">暂无公告</p>
              </div>
            ) : (
              <ScrollArea className="h-[600px] pr-2">
                <div className="space-y-2">
                  {announcements.map((ann) => (
                    <AnnouncementListItem
                      key={ann.id}
                      item={ann}
                      isSelected={ann.id === selectedId}
                      onSelect={(item) => setSelectedId(item.id === selectedId ? null : item.id)}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        <div className="xl:sticky xl:top-4 xl:h-fit">
          {selectedAnnouncement || selectedId === null ? (
            <AnnouncementEditor
              announcement={selectedAnnouncement}
              onSave={handleSave}
              onCancel={() => setSelectedId(null)}
              onDelete={(id) => handleDelete(id)}
              submitting={submitting}
            />
          ) : (
            <AnnouncementEmptyState onNew={() => setSelectedId(null)} />
          )}
        </div>
      </div>

      {error ? <AdminErrorNotice error={error} /> : status ? (
        <Alert>
          <AlertDescription>{status}</AlertDescription>
        </Alert>
      ) : null}

      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteDialogOpen(false);
            setDeleteTargetId(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>确认删除此公告？删除后无法恢复。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={confirmDelete}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
