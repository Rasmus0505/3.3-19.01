import { LogOut, ScrollText, Settings2, Shield, Users } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import { Select } from "./components/ui/select";
import { Separator } from "./components/ui/separator";

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

function toDateTimeLocalString(date) {
  const value = new Date(date);
  const pad = (n) => String(n).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

function UsersTab({ apiCall }) {
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

function LogsTab({ apiCall }) {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [eventType, setEventType] = useState("all");
  const [dateFrom, setDateFrom] = useState(toDateTimeLocalString(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)));
  const [dateTo, setDateTo] = useState(toDateTimeLocalString(new Date()));

  async function loadLogs() {
    setLoading(true);
    setStatus("");
    try {
      const query = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
        user_email: userEmail.trim(),
        event_type: eventType,
      });
      if (dateFrom) query.set("date_from", dateFrom);
      if (dateTo) query.set("date_to", dateTo);
      const resp = await apiCall(`/api/admin/wallet-logs?${query.toString()}`);
      const data = await jsonOrEmpty(resp);
      if (!resp.ok) {
        setStatus(parseError(data, "加载流水失败"));
        return;
      }
      setItems(Array.isArray(data.items) ? data.items : []);
      setTotal(Number(data.total || 0));
    } catch (error) {
      setStatus(`网络错误: ${String(error)}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ScrollText className="size-4" />
          余额流水
        </CardTitle>
        <CardDescription>预扣 / 消费 / 退款 / 手工调账明细。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 md:grid-cols-5">
          <Input value={userEmail} onChange={(e) => setUserEmail(e.target.value)} placeholder="用户邮箱" />
          <Select value={eventType} onChange={(e) => setEventType(e.target.value)}>
            <option value="all">全部类型</option>
            <option value="reserve">reserve</option>
            <option value="consume">consume</option>
            <option value="refund">refund</option>
            <option value="manual_adjust">manual_adjust</option>
          </Select>
          <Input type="datetime-local" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <Input type="datetime-local" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          <Button
            variant="outline"
            onClick={() => {
              setPage(1);
              loadLogs();
            }}
            disabled={loading}
          >
            查询
          </Button>
        </div>

        <div className="overflow-x-auto rounded-md border border-input">
          <table className="w-full min-w-[940px] text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-3 py-2 text-left">时间</th>
                <th className="px-3 py-2 text-left">用户</th>
                <th className="px-3 py-2 text-left">类型</th>
                <th className="px-3 py-2 text-left">变动</th>
                <th className="px-3 py-2 text-left">余额</th>
                <th className="px-3 py-2 text-left">模型</th>
                <th className="px-3 py-2 text-left">时长(ms)</th>
                <th className="px-3 py-2 text-left">课程ID</th>
                <th className="px-3 py-2 text-left">备注</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-input">
                  <td className="px-3 py-2">{formatDateTime(item.created_at)}</td>
                  <td className="px-3 py-2">{item.user_email}</td>
                  <td className="px-3 py-2">
                    <Badge
                      variant={
                        item.event_type === "refund"
                          ? "secondary"
                          : item.event_type === "manual_adjust"
                            ? "outline"
                            : "default"
                      }
                    >
                      {item.event_type}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">{item.delta_points}</td>
                  <td className="px-3 py-2">{item.balance_after}</td>
                  <td className="px-3 py-2">{item.model_name || "-"}</td>
                  <td className="px-3 py-2">{item.duration_ms ?? "-"}</td>
                  <td className="px-3 py-2">{item.lesson_id ?? "-"}</td>
                  <td className="px-3 py-2">{item.note || "-"}</td>
                </tr>
              ))}
              {items.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-muted-foreground" colSpan={9}>暂无数据</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">总计 {total} 条</p>
          <div className="flex items-center gap-2">
            <Select value={String(pageSize)} onChange={(e) => { setPage(1); setPageSize(Number(e.target.value)); }} className="max-w-[120px]">
              <option value="10">10 / 页</option>
              <option value="20">20 / 页</option>
              <option value="50">50 / 页</option>
            </Select>
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</Button>
            <span className="text-xs text-muted-foreground">{page} / {pageCount}</span>
            <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setPage(page + 1)}>下一页</Button>
          </div>
        </div>

        {status ? <p className="text-sm text-muted-foreground">{status}</p> : null}
      </CardContent>
    </Card>
  );
}

function RatesTab({ apiCall }) {
  const [rates, setRates] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingModel, setSavingModel] = useState("");

  async function loadRates() {
    setLoading(true);
    setStatus("");
    try {
      const resp = await apiCall("/api/admin/billing-rates");
      const data = await jsonOrEmpty(resp);
      if (!resp.ok) {
        setStatus(parseError(data, "加载计费配置失败"));
        return;
      }
      const list = Array.isArray(data.rates) ? data.rates : [];
      setRates(list);
      const draftMap = {};
      list.forEach((item) => {
        draftMap[item.model_name] = {
          points_per_minute: item.points_per_minute,
          is_active: item.is_active,
        };
      });
      setDrafts(draftMap);
    } catch (error) {
      setStatus(`网络错误: ${String(error)}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveRate(modelName) {
    const draft = drafts[modelName];
    if (!draft) return;
    setSavingModel(modelName);
    setStatus("");
    try {
      const resp = await apiCall(`/api/admin/billing-rates/${encodeURIComponent(modelName)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          points_per_minute: Number(draft.points_per_minute),
          is_active: Boolean(draft.is_active),
        }),
      });
      const data = await jsonOrEmpty(resp);
      if (!resp.ok) {
        setStatus(parseError(data, "保存失败"));
        return;
      }
      setStatus(`模型 ${modelName} 已更新`);
      await loadRates();
    } catch (error) {
      setStatus(`网络错误: ${String(error)}`);
    } finally {
      setSavingModel("");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Settings2 className="size-4" />
          计费配置
        </CardTitle>
        <CardDescription>按模型维护每分钟点数与启用状态。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="overflow-x-auto rounded-md border border-input">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-3 py-2 text-left">模型</th>
                <th className="px-3 py-2 text-left">点数/分钟</th>
                <th className="px-3 py-2 text-left">状态</th>
                <th className="px-3 py-2 text-left">更新时间</th>
                <th className="px-3 py-2 text-left">操作</th>
              </tr>
            </thead>
            <tbody>
              {rates.map((item) => {
                const draft = drafts[item.model_name] || item;
                return (
                  <tr key={item.model_name} className="border-t border-input">
                    <td className="px-3 py-2">{item.model_name}</td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        min={1}
                        value={draft.points_per_minute}
                        onChange={(e) => {
                          const nextValue = Number(e.target.value || 1);
                          setDrafts((prev) => ({
                            ...prev,
                            [item.model_name]: {
                              ...prev[item.model_name],
                              points_per_minute: nextValue,
                            },
                          }));
                        }}
                        className="max-w-[160px]"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Select
                        value={draft.is_active ? "active" : "inactive"}
                        onChange={(e) => {
                          setDrafts((prev) => ({
                            ...prev,
                            [item.model_name]: {
                              ...prev[item.model_name],
                              is_active: e.target.value === "active",
                            },
                          }));
                        }}
                        className="max-w-[160px]"
                      >
                        <option value="active">启用</option>
                        <option value="inactive">停用</option>
                      </Select>
                    </td>
                    <td className="px-3 py-2">{formatDateTime(item.updated_at)}</td>
                    <td className="px-3 py-2">
                      <Button
                        size="sm"
                        onClick={() => saveRate(item.model_name)}
                        disabled={savingModel === item.model_name}
                      >
                        {savingModel === item.model_name ? "保存中..." : "保存"}
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {rates.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-muted-foreground" colSpan={5}>
                    {loading ? "加载中..." : "暂无配置"}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {status ? <p className="text-sm text-muted-foreground">{status}</p> : null}
      </CardContent>
    </Card>
  );
}

export function AdminApp({ apiCall, onLogout }) {
  const [activeTab, setActiveTab] = useState("users");

  return (
    <div className="style-vega section-soft min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="container-wrapper">
          <div className="container flex h-14 items-center gap-2">
            <Button size="icon-sm" variant="ghost" aria-label="logo">
              <Shield className="size-4" />
            </Button>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">Admin</span>
              <Badge variant="outline">OneAPI Style</Badge>
            </div>
            <Separator orientation="vertical" className="mx-1 hidden h-4 md:block" />
            <div className="hidden items-center gap-2 md:flex">
              <Badge variant={activeTab === "users" ? "default" : "outline"}>用户</Badge>
              <Badge variant={activeTab === "logs" ? "default" : "outline"}>流水</Badge>
              <Badge variant={activeTab === "rates" ? "default" : "outline"}>计费</Badge>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => { window.location.href = "/"; }}>
                返回学习页
              </Button>
              <Button variant="outline" size="sm" onClick={onLogout}>
                <LogOut className="size-4" />
                退出
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container-wrapper pb-6">
        <div className="container space-y-4 pt-4">
          <div className="flex flex-wrap gap-2">
            <Button variant={activeTab === "users" ? "default" : "outline"} onClick={() => setActiveTab("users")}>
              <Users className="size-4" />
              用户
            </Button>
            <Button variant={activeTab === "logs" ? "default" : "outline"} onClick={() => setActiveTab("logs")}>
              <ScrollText className="size-4" />
              流水
            </Button>
            <Button variant={activeTab === "rates" ? "default" : "outline"} onClick={() => setActiveTab("rates")}>
              <Settings2 className="size-4" />
              计费配置
            </Button>
          </div>

          {activeTab === "users" ? <UsersTab apiCall={apiCall} /> : null}
          {activeTab === "logs" ? <LogsTab apiCall={apiCall} /> : null}
          {activeTab === "rates" ? <RatesTab apiCall={apiCall} /> : null}
        </div>
      </main>
    </div>
  );
}
