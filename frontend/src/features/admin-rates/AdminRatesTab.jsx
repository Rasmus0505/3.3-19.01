import { Settings2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AdminErrorNotice } from "../../shared/components/AdminErrorNotice";
import { formatDateTimeBeijing } from "../../shared/lib/datetime";
import { formatNetworkError, formatResponseError, parseJsonSafely } from "../../shared/lib/errorFormatter";
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
  Input,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../shared/ui";

function isDraftChanged(item, draft) {
  return (
    Number(item.points_per_minute || 0) !== Number(draft.points_per_minute || 0) ||
    Number(item.points_per_1k_tokens || 0) !== Number(draft.points_per_1k_tokens || 0) ||
    String(item.billing_unit || "minute") !== String(draft.billing_unit || "minute") ||
    Boolean(item.is_active) !== Boolean(draft.is_active) ||
    Boolean(item.parallel_enabled) !== Boolean(draft.parallel_enabled) ||
    Number(item.parallel_threshold_seconds || 0) !== Number(draft.parallel_threshold_seconds || 0) ||
    Number(item.segment_seconds || 0) !== Number(draft.segment_seconds || 0) ||
    Number(item.max_concurrency || 0) !== Number(draft.max_concurrency || 0)
  );
}

export function AdminRatesTab({ apiCall }) {
  const [rates, setRates] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingModel, setSavingModel] = useState("");
  const { error, clearError, captureError } = useErrorHandler();

  async function loadRates() {
    setLoading(true);
    setStatus("");
    clearError();
    try {
      const resp = await apiCall("/api/admin/billing-rates");
      const data = await parseJsonSafely(resp);
      if (!resp.ok) {
        const formattedError = captureError(
          formatResponseError(resp, data, {
            component: "AdminRatesTab",
            action: "加载计费配置",
            endpoint: "/api/admin/billing-rates",
            method: "GET",
            fallbackMessage: "加载计费配置失败",
          }),
        );
        setStatus(formattedError.displayMessage);
        return;
      }
      const list = Array.isArray(data.rates) ? data.rates : [];
      setRates(list);
      const draftMap = {};
      list.forEach((item) => {
        draftMap[item.model_name] = {
          points_per_minute: Number(item.points_per_minute || 0),
          points_per_1k_tokens: Number(item.points_per_1k_tokens || 0),
          billing_unit: String(item.billing_unit || "minute"),
          is_active: Boolean(item.is_active),
          parallel_enabled: Boolean(item.parallel_enabled),
          parallel_threshold_seconds: Number(item.parallel_threshold_seconds || 600),
          segment_seconds: Number(item.segment_seconds || 300),
          max_concurrency: Number(item.max_concurrency || 1),
        };
      });
      setDrafts(draftMap);
    } catch (error) {
      const formattedError = captureError(
        formatNetworkError(error, {
          component: "AdminRatesTab",
          action: "加载计费配置",
          endpoint: "/api/admin/billing-rates",
          method: "GET",
        }),
      );
      setStatus(formattedError.displayMessage);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRates();
  }, []);

  async function saveRate(modelName) {
    const draft = drafts[modelName];
    if (!draft) return;
    setSavingModel(modelName);
    setStatus("");
    clearError();
    try {
      const resp = await apiCall(`/api/admin/billing-rates/${encodeURIComponent(modelName)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          points_per_minute: Number(draft.points_per_minute || 0),
          points_per_1k_tokens: Number(draft.points_per_1k_tokens || 0),
          billing_unit: String(draft.billing_unit || "minute"),
          is_active: Boolean(draft.is_active),
          parallel_enabled: Boolean(draft.parallel_enabled),
          parallel_threshold_seconds: Number(draft.parallel_threshold_seconds || 1),
          segment_seconds: Number(draft.segment_seconds || 1),
          max_concurrency: Number(draft.max_concurrency || 1),
        }),
      });
      const data = await parseJsonSafely(resp);
      if (!resp.ok) {
        const formattedError = captureError(
          formatResponseError(resp, data, {
            component: "AdminRatesTab",
            action: "保存计费配置",
            endpoint: `/api/admin/billing-rates/${encodeURIComponent(modelName)}`,
            method: "PUT",
            meta: { model_name: modelName, draft },
            fallbackMessage: "保存计费配置失败",
          }),
        );
        setStatus(formattedError.displayMessage);
        return;
      }
      const message = `模型 ${modelName} 已更新`;
      setStatus(message);
      toast.success(message);
      await loadRates();
    } catch (error) {
      const formattedError = captureError(
        formatNetworkError(error, {
          component: "AdminRatesTab",
          action: "保存计费配置",
          endpoint: `/api/admin/billing-rates/${encodeURIComponent(modelName)}`,
          method: "PUT",
          meta: { model_name: modelName },
        }),
      );
      setStatus(formattedError.displayMessage);
    } finally {
      setSavingModel("");
    }
  }

  function updateDraft(modelName, patch) {
    setDrafts((prev) => ({
      ...prev,
      [modelName]: {
        ...prev[modelName],
        ...patch,
      },
    }));
  }

  const dirtyModels = rates
    .map((item) => ({ item, draft: drafts[item.model_name] || item }))
    .filter(({ item, draft }) => isDraftChanged(item, draft));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Settings2 className="size-4" />
          计费配置
        </CardTitle>
        <CardDescription>同一张表同时维护按分钟计费的 ASR 模型和按 1k Tokens 计费的翻译模型。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {dirtyModels.length > 0 ? (
          <Alert>
            <AlertDescription className="space-y-2">
              <p>当前有 {dirtyModels.length} 个模型存在未保存变更：</p>
              <div className="flex flex-wrap gap-2">
                {dirtyModels.map(({ item, draft }) => (
                  <Badge key={item.model_name} variant="outline">
                    {item.model_name}: {item.billing_unit}/{item.points_per_minute}/{item.points_per_1k_tokens}
                    {" -> "}
                    {draft.billing_unit}/{draft.points_per_minute}/{draft.points_per_1k_tokens}
                  </Badge>
                ))}
              </div>
            </AlertDescription>
          </Alert>
        ) : null}
        {loading ? <Skeleton className="h-10 w-full" /> : null}
        <ScrollArea className="w-full rounded-md border">
          <Table className="min-w-[1460px]">
            <TableHeader>
              <TableRow>
                <TableHead>模型</TableHead>
                <TableHead>计费单位</TableHead>
                <TableHead>点数/分钟</TableHead>
                <TableHead>点数/1k Tokens</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>并发开关</TableHead>
                <TableHead>并发阈值(秒)</TableHead>
                <TableHead>分段时长(秒)</TableHead>
                <TableHead>并发上限</TableHead>
                <TableHead>更新时间</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rates.map((item) => {
                const draft = drafts[item.model_name] || item;
                return (
                  <TableRow key={item.model_name}>
                    <TableCell className="font-medium">{item.model_name}</TableCell>
                    <TableCell>
                      <Select value={draft.billing_unit} onValueChange={(value) => updateDraft(item.model_name, { billing_unit: value })}>
                        <SelectTrigger className="w-[140px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="minute">minute</SelectItem>
                          <SelectItem value="1k_tokens">1k_tokens</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        value={draft.points_per_minute}
                        onChange={(e) => updateDraft(item.model_name, { points_per_minute: Number(e.target.value || 0) })}
                        className="max-w-[150px]"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        value={draft.points_per_1k_tokens}
                        onChange={(e) => updateDraft(item.model_name, { points_per_1k_tokens: Number(e.target.value || 0) })}
                        className="max-w-[170px]"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch checked={Boolean(draft.is_active)} onCheckedChange={(checked) => updateDraft(item.model_name, { is_active: checked })} />
                        <span className="text-xs text-muted-foreground">{draft.is_active ? "启用" : "停用"}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={Boolean(draft.parallel_enabled)}
                          onCheckedChange={(checked) => updateDraft(item.model_name, { parallel_enabled: checked })}
                        />
                        <span className="text-xs text-muted-foreground">{draft.parallel_enabled ? "启用" : "关闭"}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={1}
                        value={draft.parallel_threshold_seconds}
                        onChange={(e) => updateDraft(item.model_name, { parallel_threshold_seconds: Number(e.target.value || 1) })}
                        className="max-w-[150px]"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={1}
                        value={draft.segment_seconds}
                        onChange={(e) => updateDraft(item.model_name, { segment_seconds: Number(e.target.value || 1) })}
                        className="max-w-[150px]"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={1}
                        value={draft.max_concurrency}
                        onChange={(e) => updateDraft(item.model_name, { max_concurrency: Number(e.target.value || 1) })}
                        className="max-w-[140px]"
                      />
                    </TableCell>
                    <TableCell>{formatDateTimeBeijing(item.updated_at)}</TableCell>
                    <TableCell>
                      <Button size="sm" onClick={() => saveRate(item.model_name)} disabled={savingModel === item.model_name}>
                        {savingModel === item.model_name ? "保存中..." : "保存"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {rates.length === 0 && !loading ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-muted-foreground">
                    暂无计费配置
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </ScrollArea>

        {error ? (
          <AdminErrorNotice error={error} />
        ) : status ? (
          <Alert>
            <AlertDescription>{status}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
