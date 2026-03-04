import { Settings2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { formatDateTimeBeijing } from "../../shared/lib/datetime";
import { Alert, AlertDescription, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, ScrollArea, Skeleton, Switch, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../shared/ui";

function parseError(data, fallback) {
  return data?.message || fallback;
}

async function jsonOrEmpty(resp) {
  try {
    return await resp.json();
  } catch (_) {
    return {};
  }
}

export function AdminRatesTab({ apiCall }) {
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
        const message = parseError(data, "加载计费配置失败");
        setStatus(message);
        toast.error(message);
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
      const message = "网络连接异常，请重试。";
      setStatus(message);
      toast.error(message);
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
        const message = parseError(data, "保存失败");
        setStatus(message);
        toast.error(message);
        return;
      }
      const message = `模型 ${modelName} 已更新`;
      setStatus(message);
      toast.success(message);
      await loadRates();
    } catch (error) {
      const message = "网络连接异常，请重试。";
      setStatus(message);
      toast.error(message);
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
        <CardDescription>按模型维护每分钟点数与启用状态（时间为北京时间）。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? <Skeleton className="h-10 w-full" /> : null}
        <ScrollArea className="w-full rounded-md border">
          <Table className="min-w-[720px]">
            <TableHeader>
              <TableRow>
                <TableHead>模型</TableHead>
                <TableHead>点数/分钟</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>更新时间</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rates.map((item) => {
                const draft = drafts[item.model_name] || item;
                return (
                  <TableRow key={item.model_name}>
                    <TableCell>{item.model_name}</TableCell>
                    <TableCell>
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
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={Boolean(draft.is_active)}
                          onCheckedChange={(checked) => {
                            setDrafts((prev) => ({
                              ...prev,
                              [item.model_name]: {
                                ...prev[item.model_name],
                                is_active: checked,
                              },
                            }));
                          }}
                        />
                        <span className="text-xs text-muted-foreground">
                          {draft.is_active ? "启用" : "停用"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>{formatDateTimeBeijing(item.updated_at)}</TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        onClick={() => saveRate(item.model_name)}
                        disabled={savingModel === item.model_name}
                      >
                        {savingModel === item.model_name ? "保存中..." : "保存"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {rates.length === 0 ? (
                <TableRow>
                  <TableCell className="text-muted-foreground" colSpan={5}>
                    {loading ? "加载中..." : "暂无配置，请先创建计费模型。"}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </ScrollArea>
        {status ? (
          <Alert>
            <AlertDescription>{status}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
