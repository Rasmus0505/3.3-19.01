import {
  Database,
  FolderSearch,
  KeyRound,
  RefreshCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShieldPlus,
  ShieldX,
  UserCog,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AdminErrorNotice } from "../../shared/components/AdminErrorNotice";
import {
  buildExportProtectionPrompt,
  fetchAdminSecurityStatus,
  getSecurityStateBadgeVariant,
  getSecurityStateLabel,
  getSecurityStateTone,
} from "../../shared/lib/adminSecurity";
import { formatDateTimeBeijing } from "../../shared/lib/datetime";
import { formatNetworkError, formatResponseError, parseJsonSafely } from "../../shared/lib/errorFormatter";
import { formatMoneyCents } from "../../shared/lib/money";
import { useErrorHandler } from "../../shared/hooks/useErrorHandler";
import {
  Alert,
  AlertDescription,
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
  Label,
  MetricCard,
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from "../../shared/ui";

const MODULE_CARD_STYLES = {
  default: "border-border/70 bg-card",
  success: "border-emerald-500/20 bg-emerald-500/5",
  warning: "border-amber-500/20 bg-amber-500/5",
  danger: "border-rose-500/20 bg-rose-500/5",
};

function formatBoolean(value, yes = "是", no = "否") {
  return value ? yes : no;
}

function formatSecurityValue(value) {
  if (typeof value === "boolean") return formatBoolean(value);
  if (value == null || value === "") return "-";
  return String(value);
}

function SecurityModuleCard({ title, eyebrow, icon: Icon, module, rows = [] }) {
  const tone = getSecurityStateTone(module?.state);
  const badgeVariant = getSecurityStateBadgeVariant(module?.state);

  return (
    <Card className={`rounded-[28px] border shadow-sm ${MODULE_CARD_STYLES[tone] || MODULE_CARD_STYLES.default}`}>
      <CardHeader className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">{eyebrow}</p>
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-2xl border bg-background/80 shadow-sm">
                <Icon className="size-5" />
              </div>
              <div className="space-y-1">
                <CardTitle className="text-base">{title}</CardTitle>
                <Badge variant={badgeVariant} className="w-fit">
                  {getSecurityStateLabel(module?.state)}
                </Badge>
              </div>
            </div>
          </div>
        </div>
        <CardDescription className="leading-6 text-foreground/80">
          {module?.detail || "服务端未返回更多说明。"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((item) => (
          <div key={item.label} className="flex items-start justify-between gap-4 rounded-2xl border bg-background/75 px-3 py-2.5">
            <span className="text-xs text-muted-foreground">{item.label}</span>
            <span className="text-right text-xs font-medium leading-5 text-foreground">{formatSecurityValue(item.value)}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function AdminSecurityPage({ apiCall }) {
  const [securityStatus, setSecurityStatus] = useState(null);
  const [securityLoading, setSecurityLoading] = useState(false);
  const [users, setUsers] = useState([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersSummaryCards, setUsersSummaryCards] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keywordInput, setKeywordInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [roleDialog, setRoleDialog] = useState(null);
  const [roleConfirmText, setRoleConfirmText] = useState("");
  const [roleConfirmEmail, setRoleConfirmEmail] = useState("");
  const [roleReason, setRoleReason] = useState("");
  const [roleSubmitting, setRoleSubmitting] = useState(false);
  const { error, clearError, captureError } = useErrorHandler();

  const exportPrompt = useMemo(
    () => buildExportProtectionPrompt(securityStatus?.export_protection),
    [securityStatus?.export_protection],
  );

  const moduleCards = useMemo(() => {
    if (!securityStatus) return [];
    return [
      {
        key: "database",
        title: "数据库状态",
        eyebrow: "Data Plane",
        icon: Database,
        module: securityStatus.database,
        rows: [
          { label: "运行环境", value: securityStatus.database.environment },
          { label: "连接协议", value: securityStatus.database.url_scheme || "unknown" },
          { label: "已配置 DATABASE_URL", value: securityStatus.database.database_url_present },
          { label: "生产环境要求外部库", value: securityStatus.database.production_requires_external_db },
        ],
      },
      {
        key: "admin_access",
        title: "管理员状态",
        eyebrow: "Privilege Plane",
        icon: UserCog,
        module: securityStatus.admin_access,
        rows: [
          { label: "管理员数量", value: securityStatus.admin_access.total_admin_users },
          { label: "授权模式", value: securityStatus.admin_access.runtime_authorization_mode },
          { label: "邮箱回退启用", value: securityStatus.admin_access.email_fallback_enabled },
          { label: "启动模式", value: securityStatus.admin_access.bootstrap_mode },
        ],
      },
      {
        key: "export_protection",
        title: "兑换码导出保护",
        eyebrow: "Dangerous Action Guard",
        icon: KeyRound,
        module: securityStatus.export_protection,
        rows: [
          { label: "确认词已配置", value: securityStatus.export_protection.confirm_text_configured },
          { label: "确认词强度", value: securityStatus.export_protection.confirm_text_strong ? "强" : "弱/待加强" },
          { label: "确认模式", value: securityStatus.export_protection.confirmation_mode },
          { label: "前端展示策略", value: "仅展示提示，不回显真实确认词" },
        ],
      },
      {
        key: "media_storage",
        title: "媒体路径安全",
        eyebrow: "File Boundary",
        icon: FolderSearch,
        module: securityStatus.media_storage,
        rows: [
          { label: "存储根目录", value: securityStatus.media_storage.storage_root },
          { label: "路径策略", value: securityStatus.media_storage.path_policy },
          { label: "严格读校验", value: securityStatus.media_storage.strict_read_validation },
          { label: "根目录存在", value: securityStatus.media_storage.root_exists },
        ],
      },
    ];
  }, [securityStatus]);

  const sectionSummaries = securityStatus?.sections || [];
  const pageCount = Math.max(1, Math.ceil(usersTotal / pageSize));
  const canSubmitRoleAction = Boolean(roleConfirmText.trim() && roleConfirmEmail.trim());

  async function loadSecurityStatus() {
    setSecurityLoading(true);
    setStatus("");
    clearError();
    try {
      const { response, data } = await fetchAdminSecurityStatus(apiCall);
      if (!response.ok) {
        const formattedError = captureError(
          formatResponseError(response, data, {
            component: "AdminSecurityPage",
            action: "加载安全中心状态",
            endpoint: "/api/admin/security/status",
            method: "GET",
            fallbackMessage: "加载安全中心状态失败",
          }),
        );
        setStatus(formattedError.displayMessage);
        return;
      }
      setSecurityStatus(data);
    } catch (requestError) {
      const formattedError = captureError(
        formatNetworkError(requestError, {
          component: "AdminSecurityPage",
          action: "加载安全中心状态",
          endpoint: "/api/admin/security/status",
          method: "GET",
        }),
      );
      setStatus(formattedError.displayMessage);
    } finally {
      setSecurityLoading(false);
    }
  }

  async function loadUsers(nextPage = page, nextKeyword = keyword) {
    setUsersLoading(true);
    setStatus("");
    clearError();
    try {
      const query = new URLSearchParams({
        page: String(nextPage),
        page_size: String(pageSize),
        sort_by: "last_login_at",
        sort_dir: "desc",
        keyword: String(nextKeyword || "").trim(),
      });
      const response = await apiCall(`/api/admin/users?${query.toString()}`);
      const data = await parseJsonSafely(response);
      if (!response.ok) {
        const formattedError = captureError(
          formatResponseError(response, data, {
            component: "AdminSecurityPage",
            action: "加载管理员用户列表",
            endpoint: "/api/admin/users",
            method: "GET",
            meta: Object.fromEntries(query.entries()),
            fallbackMessage: "加载管理员用户列表失败",
          }),
        );
        setStatus(formattedError.displayMessage);
        return;
      }
      setUsers(Array.isArray(data.items) ? data.items : []);
      setUsersTotal(Number(data.total || 0));
      setUsersSummaryCards(Array.isArray(data.summary_cards) ? data.summary_cards : []);
    } catch (requestError) {
      const formattedError = captureError(
        formatNetworkError(requestError, {
          component: "AdminSecurityPage",
          action: "加载管理员用户列表",
          endpoint: "/api/admin/users",
          method: "GET",
        }),
      );
      setStatus(formattedError.displayMessage);
    } finally {
      setUsersLoading(false);
    }
  }

  async function refreshAll() {
    await loadSecurityStatus();
    await loadUsers(page, keyword);
  }

  useEffect(() => {
    loadSecurityStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadUsers(page, keyword);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize]);

  function openRoleDialog(action, user) {
    setRoleDialog({ action, user });
    setRoleConfirmText("");
    setRoleConfirmEmail("");
    setRoleReason("");
  }

  function closeRoleDialog() {
    setRoleDialog(null);
    setRoleConfirmText("");
    setRoleConfirmEmail("");
    setRoleReason("");
  }

  async function submitRoleAction() {
    if (!roleDialog?.user?.id) return;

    setRoleSubmitting(true);
    setStatus("");
    clearError();
    try {
      const actionPath = roleDialog.action === "grant" ? "grant-admin" : "revoke-admin";
      const response = await apiCall(`/api/admin/users/${roleDialog.user.id}/${actionPath}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirm_text: roleConfirmText.trim(),
          confirm_email: roleConfirmEmail.trim(),
          reason: roleReason.trim(),
        }),
      });
      const data = await parseJsonSafely(response);
      if (!response.ok) {
        const formattedError = captureError(
          formatResponseError(response, data, {
            component: "AdminSecurityPage",
            action: roleDialog.action === "grant" ? "授予管理员权限" : "撤销管理员权限",
            endpoint: `/api/admin/users/${roleDialog.user.id}/${actionPath}`,
            method: "POST",
            meta: { user_id: roleDialog.user.id, user_email: roleDialog.user.email, action: roleDialog.action },
            fallbackMessage: roleDialog.action === "grant" ? "授予管理员权限失败" : "撤销管理员权限失败",
          }),
        );
        setStatus(formattedError.displayMessage);
        return;
      }

      toast.success(roleDialog.action === "grant" ? "管理员权限已授予" : "管理员权限已撤销");
      closeRoleDialog();
      await refreshAll();
    } catch (requestError) {
      const formattedError = captureError(
        formatNetworkError(requestError, {
          component: "AdminSecurityPage",
          action: roleDialog.action === "grant" ? "授予管理员权限" : "撤销管理员权限",
          endpoint: `/api/admin/users/${roleDialog.user.id}/${roleDialog.action === "grant" ? "grant-admin" : "revoke-admin"}`,
          method: "POST",
        }),
      );
      setStatus(formattedError.displayMessage);
    } finally {
      setRoleSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[32px] border bg-gradient-to-br from-slate-950/[0.045] via-background to-emerald-500/[0.06] p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">排障中心 / 安全维护</Badge>
              {securityStatus?.admin_access?.runtime_authorization_mode ? (
                <Badge variant="outline">{securityStatus.admin_access.runtime_authorization_mode}</Badge>
              ) : null}
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-semibold tracking-tight">排障中心 · 安全维护</h3>
              <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                聚合数据库、管理员权限、兑换码导出保护和媒体路径边界状态。这里属于排障中心的高权限维护区，危险操作统一要求二次确认，并只展示服务端返回的安全提示，不在前端泄露真实确认词。
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={refreshAll} disabled={securityLoading || usersLoading}>
              <RefreshCcw className="size-4" />
              刷新安全状态
            </Button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {securityLoading && !securityStatus
            ? Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-[148px] rounded-3xl" />)
            : moduleCards.map((item) => (
                <MetricCard
                  key={item.key}
                  icon={item.icon}
                  label={item.title}
                  value={getSecurityStateLabel(item.module?.state)}
                  hint={item.module?.detail || "等待服务端返回更多细节"}
                  tone={getSecurityStateTone(item.module?.state)}
                />
              ))}
        </div>

        {sectionSummaries.length ? (
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {sectionSummaries.map((item, index) => (
              <div key={`${item.summary}-${index}`} className="rounded-2xl border bg-background/75 px-4 py-3 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{item.summary}</p>
                    <p className="text-xs leading-5 text-muted-foreground">{item.detail || "暂无补充说明"}</p>
                  </div>
                  <Badge variant={getSecurityStateBadgeVariant(item.state)}>{getSecurityStateLabel(item.state)}</Badge>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {securityLoading && !moduleCards.length
          ? Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-[280px] rounded-[28px]" />)
          : moduleCards.map((item) => (
              <SecurityModuleCard
                key={item.key}
                title={item.title}
                eyebrow={item.eyebrow}
                icon={item.icon}
                module={item.module}
                rows={item.rows}
              />
            ))}
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <h3 className="text-base font-semibold">管理员权限操作台</h3>
            <p className="text-sm text-muted-foreground">
              授权与回收统一走二次确认。请再次输入目标邮箱和当前环境确认词，后端会写入审计日志并阻止最后一个管理员被撤销。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">当前管理员 {securityStatus?.admin_access?.total_admin_users ?? "-"}</Badge>
            <Badge variant="outline">邮箱回退 {formatBoolean(securityStatus?.admin_access?.email_fallback_enabled, "启用", "关闭")}</Badge>
          </div>
        </div>

        {usersSummaryCards.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {usersSummaryCards.map((item) => (
              <MetricCard
                key={item.label}
                icon={item.tone === "warning" ? ShieldAlert : item.tone === "success" ? ShieldCheck : UserCog}
                label={item.label}
                value={item.value}
                hint={item.hint}
                tone={item.tone || "default"}
              />
            ))}
          </div>
        ) : null}

        <Card className="rounded-[28px] border shadow-sm">
          <CardHeader className="space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <CardTitle className="text-base">角色检索与危险操作</CardTitle>
                <CardDescription>默认按最近登录倒序载入，便于先处理最近活跃账号。</CardDescription>
              </div>
              <form
                className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto"
                onSubmit={(event) => {
                  event.preventDefault();
                  const nextKeyword = keywordInput.trim();
                  setPage(1);
                  setKeyword(nextKeyword);
                  loadUsers(1, nextKeyword);
                }}
              >
                <Input
                  value={keywordInput}
                  onChange={(event) => setKeywordInput(event.target.value)}
                  placeholder="按邮箱搜索用户"
                  className="sm:w-[260px]"
                />
                <Button type="submit" variant="outline" disabled={usersLoading}>
                  <Search className="size-4" />
                  筛选
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setKeywordInput("");
                    setKeyword("");
                    setPage(1);
                    loadUsers(1, "");
                  }}
                  disabled={usersLoading || (!keyword && !keywordInput)}
                >
                  清空
                </Button>
              </form>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <ScrollArea className="w-full rounded-2xl border">
              <Table className="min-w-[980px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>邮箱</TableHead>
                    <TableHead>角色</TableHead>
                    <TableHead>余额</TableHead>
                    <TableHead>注册时间</TableHead>
                    <TableHead>最近登录</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usersLoading && !users.length ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8">
                        <Skeleton className="h-10 w-full" />
                      </TableCell>
                    </TableRow>
                  ) : null}

                  {!usersLoading
                    ? users.map((user) => {
                        const isLastKnownAdmin = Boolean(user.is_admin && securityStatus?.admin_access?.total_admin_users <= 1);
                        return (
                          <TableRow key={user.id}>
                            <TableCell>
                              <div className="space-y-1">
                                <p className="font-medium">{user.email}</p>
                                <p className="text-xs text-muted-foreground">#{user.id}</p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant={user.is_admin ? "default" : "outline"}>
                                {user.is_admin ? "管理员" : "普通用户"}
                              </Badge>
                            </TableCell>
                            <TableCell>{formatMoneyCents(user.balance_points || 0)}</TableCell>
                            <TableCell>{formatDateTimeBeijing(user.created_at)}</TableCell>
                            <TableCell>{formatDateTimeBeijing(user.last_login_at)}</TableCell>
                            <TableCell className="text-right">
                              {user.is_admin ? (
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => openRoleDialog("revoke", user)}
                                  disabled={isLastKnownAdmin}
                                >
                                  <ShieldX className="size-4" />
                                  {isLastKnownAdmin ? "保留最后管理员" : "撤销管理员"}
                                </Button>
                              ) : (
                                <Button size="sm" variant="outline" onClick={() => openRoleDialog("grant", user)}>
                                  <ShieldPlus className="size-4" />
                                  授予管理员
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    : null}

                  {!usersLoading && users.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-muted-foreground">
                        当前筛选条件下没有可操作用户。
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </ScrollArea>

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">总计 {usersTotal} 个匹配用户</p>
              <div className="flex items-center gap-2">
                <Select
                  value={String(pageSize)}
                  onValueChange={(value) => {
                    setPage(1);
                    setPageSize(Number(value));
                  }}
                >
                  <SelectTrigger className="w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10 / 页</SelectItem>
                    <SelectItem value="20">20 / 页</SelectItem>
                    <SelectItem value="50">50 / 页</SelectItem>
                  </SelectContent>
                </Select>

                <Pagination className="mx-0 w-auto justify-end">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious disabled={page <= 1} onClick={() => setPage(page - 1)} />
                    </PaginationItem>
                    <PaginationItem>
                      <PaginationLink isActive>
                        {page} / {pageCount}
                      </PaginationLink>
                    </PaginationItem>
                    <PaginationItem>
                      <PaginationNext disabled={page >= pageCount} onClick={() => setPage(page + 1)} />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {error ? <AdminErrorNotice error={error} /> : status ? <Alert><AlertDescription>{status}</AlertDescription></Alert> : null}

      <Dialog
        open={Boolean(roleDialog)}
        onOpenChange={(open) => {
          if (!open) closeRoleDialog();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{roleDialog?.action === "grant" ? "授予管理员权限" : "撤销管理员权限"}</DialogTitle>
            <DialogDescription>
              该操作会写入审计日志，并要求再次输入目标邮箱与当前环境确认词。前端不会展示或缓存真实确认词内容。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-2xl border bg-muted/30 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="font-medium">{roleDialog?.user?.email || "-"}</p>
                  <p className="text-xs text-muted-foreground">
                    {roleDialog?.action === "grant" ? "将成为新的管理员账号" : "将被回收管理员权限"}
                  </p>
                </div>
                <Badge variant={roleDialog?.action === "grant" ? "default" : "destructive"}>
                  {roleDialog?.action === "grant" ? "授予权限" : "回收权限"}
                </Badge>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="admin-role-confirm-text">确认词</Label>
              <Input
                id="admin-role-confirm-text"
                value={roleConfirmText}
                onChange={(event) => setRoleConfirmText(event.target.value)}
                placeholder={exportPrompt.placeholder}
              />
              <p className="text-xs leading-5 text-muted-foreground">
                {exportPrompt.title}。{exportPrompt.description}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="admin-role-confirm-email">确认邮箱</Label>
              <Input
                id="admin-role-confirm-email"
                value={roleConfirmEmail}
                onChange={(event) => setRoleConfirmEmail(event.target.value)}
                placeholder={roleDialog?.user?.email || "再次输入目标用户邮箱"}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="admin-role-reason">原因</Label>
              <Textarea
                id="admin-role-reason"
                value={roleReason}
                onChange={(event) => setRoleReason(event.target.value)}
                placeholder="建议填写变更原因，例如：轮值交接、回收误授予权限"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeRoleDialog}>
              取消
            </Button>
            <Button onClick={submitRoleAction} disabled={!canSubmitRoleAction || roleSubmitting}>
              {roleSubmitting ? "提交中..." : roleDialog?.action === "grant" ? "确认授予" : "确认撤销"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
