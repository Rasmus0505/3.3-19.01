import { Database, Play, RefreshCcw, ShieldAlert, ShieldCheck, TerminalSquare } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AdminErrorNotice } from "../../shared/components/AdminErrorNotice";
import { formatNetworkError, formatResponseError, parseJsonSafely } from "../../shared/lib/errorFormatter";
import { useErrorHandler } from "../../shared/hooks/useErrorHandler";
import {
  Alert,
  AlertDescription,
  AlertTitle,
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
  ScrollArea,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from "../../shared/ui";

function stringifyCell(value) {
  if (value == null) return "-";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch (_) {
      return String(value);
    }
  }
  return String(value);
}

export function AdminSqlConsoleTab({ apiCall }) {
  const [sql, setSql] = useState("SELECT id, email FROM users ORDER BY id DESC");
  const [prepared, setPrepared] = useState(null);
  const [preparedSql, setPreparedSql] = useState("");
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const { error, clearError, captureError } = useErrorHandler();

  const hasPreparedCurrentSql = useMemo(() => prepared && preparedSql === sql, [prepared, preparedSql, sql]);
  const canExecute = Boolean(hasPreparedCurrentSql) && !preparing && !executing;

  async function handlePrepare() {
    setPreparing(true);
    setStatus("");
    clearError();
    try {
      const resp = await apiCall("/api/admin/sql-console/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql }),
      });
      const data = await parseJsonSafely(resp);
      if (!resp.ok) {
        const formattedError = captureError(
          formatResponseError(resp, data, {
            component: "AdminSqlConsoleTab",
            action: "预检 SQL",
            endpoint: "/api/admin/sql-console/prepare",
            method: "POST",
            meta: { sql },
            fallbackMessage: "SQL 预检失败",
          }),
        );
        setStatus(formattedError.displayMessage);
        return;
      }
      setPrepared(data);
      setPreparedSql(sql);
      setResult(null);
      setConfirmText("");
      toast.success(data.requires_confirmation ? "SQL 预检通过，写操作需要二次确认" : "SQL 预检通过");
    } catch (prepareError) {
      const formattedError = captureError(
        formatNetworkError(prepareError, {
          component: "AdminSqlConsoleTab",
          action: "预检 SQL",
          endpoint: "/api/admin/sql-console/prepare",
          method: "POST",
        }),
      );
      setStatus(formattedError.displayMessage);
    } finally {
      setPreparing(false);
    }
  }

  async function handleExecute({ confirmToken = "", confirmValue = "" } = {}) {
    setExecuting(true);
    setStatus("");
    clearError();
    try {
      const resp = await apiCall("/api/admin/sql-console/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sql,
          confirm_token: confirmToken,
          confirm_text: confirmValue,
        }),
      });
      const data = await parseJsonSafely(resp);
      if (!resp.ok) {
        const formattedError = captureError(
          formatResponseError(resp, data, {
            component: "AdminSqlConsoleTab",
            action: "执行 SQL",
            endpoint: "/api/admin/sql-console/execute",
            method: "POST",
            meta: { sql, statement_mode: prepared?.statement_mode || "" },
            fallbackMessage: "SQL 执行失败",
          }),
        );
        setStatus(formattedError.displayMessage);
        return;
      }
      setResult(data);
      setConfirmOpen(false);
      setConfirmText("");
      toast.success(data.statement_mode === "write" ? "SQL 写操作已执行" : "SQL 查询已完成");
      if (prepared?.requires_confirmation) {
        setPrepared(null);
        setPreparedSql("");
      }
    } catch (executeError) {
      const formattedError = captureError(
        formatNetworkError(executeError, {
          component: "AdminSqlConsoleTab",
          action: "执行 SQL",
          endpoint: "/api/admin/sql-console/execute",
          method: "POST",
        }),
      );
      setStatus(formattedError.displayMessage);
    } finally {
      setExecuting(false);
    }
  }

  function onExecuteClick() {
    if (!canExecute) return;
    if (prepared?.requires_confirmation) {
      setConfirmOpen(true);
      return;
    }
    void handleExecute();
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader className="space-y-2">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">SQL 控台</CardTitle>
              <Badge variant="outline">admin-only</Badge>
            </div>
            <CardDescription>面向线上排障和数据修复。仅允许单条 SQL，默认最多返回 200 行，DDL 和多语句会被拒绝。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Label htmlFor="admin-sql-console-textarea">SQL 语句</Label>
            <Textarea
              id="admin-sql-console-textarea"
              value={sql}
              onChange={(event) => setSql(event.target.value)}
              placeholder="输入单条 SELECT / EXPLAIN / INSERT / UPDATE / DELETE"
              className="min-h-52 rounded-2xl font-mono text-sm"
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => void handlePrepare()} disabled={preparing || executing || !sql.trim()}>
                <RefreshCcw className="size-4" />
                {preparing ? "预检中..." : "预检 SQL"}
              </Button>
              <Button type="button" onClick={onExecuteClick} disabled={!canExecute}>
                <Play className="size-4" />
                {executing ? "执行中..." : "执行 SQL"}
              </Button>
            </div>
            {!hasPreparedCurrentSql && prepared ? (
              <p className="text-xs text-amber-600">SQL 内容已变更，请重新预检后再执行。</p>
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-3">
          <Alert>
            <ShieldAlert className="size-4" />
            <AlertTitle>风险提醒</AlertTitle>
            <AlertDescription>写操作会直接作用于当前业务库。执行前会要求二次确认，并把 SQL、影响行数、耗时和错误信息写入后台操作日志。</AlertDescription>
          </Alert>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">当前预检状态</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <Badge variant={hasPreparedCurrentSql ? "default" : "outline"}>{hasPreparedCurrentSql ? "已就绪" : "未就绪"}</Badge>
                {prepared?.statement_mode ? <Badge variant="secondary">{prepared.statement_mode === "write" ? "WRITE" : "READ"}</Badge> : null}
              </div>
              <p className="text-muted-foreground">{prepared?.summary || "先预检 SQL，确认动作类型、目标表和风险提示。"}</p>
              {prepared?.target_tables?.length ? (
                <div className="flex flex-wrap gap-2">
                  {prepared.target_tables.map((tableName) => (
                    <Badge key={tableName} variant="outline">
                      {tableName}
                    </Badge>
                  ))}
                </div>
              ) : null}
              <div className="space-y-1 text-xs text-muted-foreground">
                {(prepared?.warnings || ["仅允许单条 SQL。", "查询结果最多返回 200 行。"]).map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">执行结果摘要</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <TerminalSquare className="size-4 text-muted-foreground" />
                <span>{result ? `耗时 ${result.duration_ms} ms` : "等待执行"}</span>
              </div>
              <div className="flex items-center gap-2">
                <Database className="size-4 text-muted-foreground" />
                <span>{result ? `结果 ${result.row_count} 行` : "暂无结果"}</span>
              </div>
              {result?.statement_mode === "write" ? <p className="text-muted-foreground">影响行数：{result.affected_rows ?? 0}</p> : null}
              {result?.truncated ? <p className="text-amber-600">结果已截断，仅展示前 {result.result_limit} 行。</p> : null}
            </CardContent>
          </Card>
        </div>
      </div>

      {result ? (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">结果集</CardTitle>
              <Badge variant="outline">{result.statement_mode === "write" ? "write" : "read"}</Badge>
              {result.truncated ? <Badge variant="secondary">truncated</Badge> : null}
            </div>
            <CardDescription>{result.summary || "SQL 执行完成"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
              <span>耗时 {result.duration_ms} ms</span>
              <span>结果 {result.row_count} 行</span>
              {result.statement_mode === "write" ? <span>影响 {result.affected_rows ?? 0} 行</span> : null}
            </div>
            {result.columns?.length ? (
              <ScrollArea className="w-full whitespace-nowrap rounded-2xl border">
                <Table className="min-w-[720px]">
                  <TableHeader>
                    <TableRow>
                      {result.columns.map((column) => (
                        <TableHead key={column.name}>{column.name}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.rows.map((row, rowIndex) => (
                      <TableRow key={`${rowIndex}-${result.summary}`}>
                        {result.columns.map((column) => (
                          <TableCell key={`${rowIndex}-${column.name}`} className="max-w-[320px] whitespace-normal break-all font-mono text-xs">
                            {stringifyCell(row[column.name])}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                    {result.rows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={Math.max(result.columns.length, 1)} className="text-sm text-muted-foreground">
                          语句执行成功，但没有返回结果行。
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </ScrollArea>
            ) : (
              <p className="text-sm text-muted-foreground">语句执行成功，但当前 SQL 没有返回可展示的结果列。</p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {error ? (
        <AdminErrorNotice error={error} />
      ) : status ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{status}</div>
      ) : null}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="size-4" />
              确认执行写操作
            </DialogTitle>
            <DialogDescription>本次 SQL 会直接修改数据库。请核对动作摘要，并输入确认词后再执行。</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-2xl border bg-muted/40 p-3 text-sm">
              <p>动作：{prepared?.statement_mode === "write" ? "WRITE" : "READ"}</p>
              <p>摘要：{prepared?.summary || "-"}</p>
              <p>目标表：{prepared?.target_tables?.join(", ") || "-"}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-sql-console-confirm">输入确认词 {prepared?.confirm_text || "EXECUTE"}</Label>
              <Input
                id="admin-sql-console-confirm"
                value={confirmText}
                onChange={(event) => setConfirmText(event.target.value)}
                placeholder={prepared?.confirm_text || "EXECUTE"}
                className="rounded-xl"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={executing}>
              取消
            </Button>
            <Button
              onClick={() =>
                void handleExecute({
                  confirmToken: prepared?.confirm_token || "",
                  confirmValue: confirmText,
                })
              }
              disabled={executing || confirmText.trim().toUpperCase() !== String(prepared?.confirm_text || "EXECUTE").toUpperCase()}
            >
              {executing ? "执行中..." : "确认执行"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

