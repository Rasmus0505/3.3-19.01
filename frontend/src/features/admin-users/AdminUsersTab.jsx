import { Users } from "lucide-react";
import { useEffect, useState } from "react";

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, Select } from "../../shared/ui";

function parseError(data, fallback) {
  return `${data?.error_code || "ERROR"}: ${data?.message || fallback}`;
}

async function jsonOrEmpty(resp) {
  try {
    return await resp.json();
  } catch (_) {
    return {};
  }
}

function formatDateTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString();
}

function formatPoints(points) {
  return `${Number(points || 0)} 点`;
}

export function AdminUsersTab({ apiCall }) {
  const [keywordInput, setKeywordInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [users, setUsers] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [sortBy, setSortBy] = useState("created_at");
  const [sortDir, setSortDir] = useState("desc");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  const [adjustingUser, setAdjustingUser] = useState(null);
  const [deltaPoints, setDeltaPoints] = useState(0);
  const [reason, setReason] = useState("");
  const [adjustLoading, setAdjustLoading] = useState(false);

  async function loadUsers() {
    setLoading(true);
    setStatus("");
    try {
      const query = new URLSearchParams({
        keyword,
        page: String(page),
        page_size: String(pageSize),
        sort_by: sortBy,
        sort_dir: sortDir,
      });
      const resp = await apiCall(`/api/admin/users?${query.toString()}`);
      const data = await jsonOrEmpty(resp);
      if (!resp.ok) {
        setStatus(parseError(data, "加载用户失败"));
        return;
      }
      setUsers(Array.isArray(data.items) ? data.items : []);
      setTotal(Number(data.total || 0));
    } catch (error) {
      setStatus(`网络错误: ${String(error)}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword, page, pageSize, sortBy, sortDir]);

  async function submitAdjust() {
    if (!adjustingUser) return;
    setAdjustLoading(true);
    setStatus("");
    try {
      const resp = await apiCall(`/api/admin/users/${adjustingUser.id}/wallet-adjust`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delta_points: Number(deltaPoints), reason }),
      });
      const data = await jsonOrEmpty(resp);
      if (!resp.ok) {
        setStatus(parseError(data, "调账失败"));
        return;
      }
      setStatus(`调账成功：${adjustingUser.email}，余额 ${formatPoints(data.balance_points)}`);
      setAdjustingUser(null);
      setDeltaPoints(0);
      setReason("");
      await loadUsers();
    } catch (error) {
      setStatus(`网络错误: ${String(error)}`);
    } finally {
      setAdjustLoading(false);
    }
  }

  function toggleSort(nextSortBy) {
    if (sortBy === nextSortBy) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
      return;
    }
    setSortBy(nextSortBy);
    setSortDir("desc");
  }

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="size-4" />
          用户与余额
        </CardTitle>
        <CardDescription>搜索、分页、排序与手工调账。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Input value={keywordInput} onChange={(e) => setKeywordInput(e.target.value)} placeholder="按邮箱搜索" className="max-w-xs" />
          <Button
            variant="outline"
            onClick={() => {
              setPage(1);
              setKeyword(keywordInput.trim());
            }}
          >
            查询
          </Button>
          <Button variant="ghost" onClick={loadUsers} disabled={loading}>刷新</Button>
          <Select value={String(pageSize)} onChange={(e) => { setPage(1); setPageSize(Number(e.target.value)); }} className="max-w-[120px]">
            <option value="10">10 / 页</option>
            <option value="20">20 / 页</option>
            <option value="50">50 / 页</option>
          </Select>
        </div>

        <div className="overflow-x-auto rounded-md border border-input">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-3 py-2 text-left">ID</th>
                <th className="px-3 py-2 text-left"><button type="button" onClick={() => toggleSort("email")}>邮箱</button></th>
                <th className="px-3 py-2 text-left"><button type="button" onClick={() => toggleSort("balance_points")}>余额</button></th>
                <th className="px-3 py-2 text-left"><button type="button" onClick={() => toggleSort("created_at")}>创建时间</button></th>
                <th className="px-3 py-2 text-left">操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map((item) => (
                <tr key={item.id} className="border-t border-input">
                  <td className="px-3 py-2">{item.id}</td>
                  <td className="px-3 py-2">{item.email}</td>
                  <td className="px-3 py-2">{formatPoints(item.balance_points)}</td>
                  <td className="px-3 py-2">{formatDateTime(item.created_at)}</td>
                  <td className="px-3 py-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setAdjustingUser(item);
                        setDeltaPoints(0);
                        setReason("");
                      }}
                    >
                      调账
                    </Button>
                  </td>
                </tr>
              ))}
              {users.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-muted-foreground" colSpan={5}>暂无数据</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">总计 {total} 条</p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</Button>
            <span className="text-xs text-muted-foreground">{page} / {pageCount}</span>
            <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setPage(page + 1)}>下一页</Button>
          </div>
        </div>

        {status ? <p className="text-sm text-muted-foreground">{status}</p> : null}

        {adjustingUser ? (
          <div className="rounded-md border border-input bg-muted/20 p-3">
            <p className="mb-2 text-sm font-medium">调账用户：{adjustingUser.email}</p>
            <div className="grid gap-2 md:grid-cols-3">
              <div className="grid gap-1">
                <Label>增减点数（可负数）</Label>
                <Input type="number" value={deltaPoints} onChange={(e) => setDeltaPoints(Number(e.target.value || 0))} />
              </div>
              <div className="grid gap-1 md:col-span-2">
                <Label>备注（必填）</Label>
                <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例如：线下充值 1000 点" />
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <Button onClick={submitAdjust} disabled={adjustLoading || !reason.trim()}>
                {adjustLoading ? "提交中..." : "确认调账"}
              </Button>
              <Button variant="ghost" onClick={() => setAdjustingUser(null)}>取消</Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
