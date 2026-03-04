import { Settings2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Select } from "../../shared/ui";

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
