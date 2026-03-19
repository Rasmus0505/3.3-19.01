import { Settings2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AdminErrorNotice } from "../../shared/components/AdminErrorNotice";
import { formatDateTimeBeijing } from "../../shared/lib/datetime";
import { formatNetworkError, formatResponseError, parseJsonSafely } from "../../shared/lib/errorFormatter";
import { formatMoneyCents, formatMoneyPerMinute } from "../../shared/lib/money";
import { useErrorHandler } from "../../shared/hooks/useErrorHandler";
import { getRateDraftValidationMessage, RATE_INTEGER_CENTS_MESSAGE } from "./rateDraftValidation";
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
  Skeleton,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../shared/ui";

function isTokenBilling(item) {
  return String(item?.billing_unit || "minute") === "1k_tokens";
}

function isDraftChanged(item, draft) {
  return (
    Number(item.price_per_minute_cents || 0) !== Number(draft.price_per_minute_cents || 0) ||
    Number(item.points_per_1k_tokens || 0) !== Number(draft.points_per_1k_tokens || 0) ||
    Number(item.cost_per_minute_cents || 0) !== Number(draft.cost_per_minute_cents || 0) ||
    String(item.billing_unit || "minute") !== String(draft.billing_unit || "minute") ||
    Boolean(item.is_active) !== Boolean(draft.is_active) ||
    Boolean(item.parallel_enabled) !== Boolean(draft.parallel_enabled) ||
    Number(item.parallel_threshold_seconds || 0) !== Number(draft.parallel_threshold_seconds || 0) ||
    Number(item.segment_seconds || 0) !== Number(draft.segment_seconds || 0) ||
    Number(item.max_concurrency || 0) !== Number(draft.max_concurrency || 0)
  );
}

function formatDraftSummary(item, draft) {
  if (isTokenBilling(item) || isTokenBilling(draft)) {
    return `${Number(draft.points_per_1k_tokens || 0)} / 1k Tokens`;
  }
  return `${formatMoneyCents(draft.price_per_minute_cents)} / ${formatMoneyCents(draft.cost_per_minute_cents)}`;
}

function formatItemSummary(item) {
  if (isTokenBilling(item)) {
    return `${Number(item.points_per_1k_tokens || 0)} / 1k Tokens`;
  }
  return `${formatMoneyCents(item.price_per_minute_cents)} / ${formatMoneyCents(item.cost_per_minute_cents)}`;
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
          price_per_minute_cents: Number(item.price_per_minute_cents || item.points_per_minute || 0),
          points_per_1k_tokens: Number(item.points_per_1k_tokens || 0),
          cost_per_minute_cents: Number(item.cost_per_minute_cents || 0),
          billing_unit: String(item.billing_unit || "minute"),
          is_active: Boolean(item.is_active),
          parallel_enabled: Boolean(item.parallel_enabled),
          parallel_threshold_seconds: Number(item.parallel_threshold_seconds || 600),
          segment_seconds: Number(item.segment_seconds || 300),
          max_concurrency: Number(item.max_concurrency || 1),
        };
      });
      setDrafts(draftMap);
    } catch (requestError) {
      const formattedError = captureError(
        formatNetworkError(requestError, {
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
    const validationMessage = getRateDraftValidationMessage(draft);
    if (validationMessage) {
      console.debug("[DEBUG] admin billing rate save blocked by integer validation", {
        modelName,
        draft,
      });
      setStatus(validationMessage);
      return;
    }
    setSavingModel(modelName);
    setStatus("");
    clearError();
    try {
      const resp = await apiCall(`/api/admin/billing-rates/${encodeURIComponent(modelName)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          price_per_minute_cents: Number(draft.price_per_minute_cents || 0),
          points_per_1k_tokens: Number(draft.points_per_1k_tokens || 0),
          cost_per_minute_cents: Number(draft.cost_per_minute_cents || 0),
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
    } catch (requestError) {
      const formattedError = captureError(
        formatNetworkError(requestError, {
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
  const invalidModels = rates
    .map((item) => ({ item, draft: drafts[item.model_name] || item, validationMessage: getRateDraftValidationMessage(drafts[item.model_name] || item) }))
    .filter(({ validationMessage }) => Boolean(validationMessage));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Settings2 className="size-4" />
          计费配置
        </CardTitle>
        <CardDescription>这里只维护 3 个 ASR 模型和 1 个 MT 翻译模型，不包含浏览器本地试玩模型。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {dirtyModels.length > 0 ? (
          <Alert>
            <AlertDescription className="space-y-2">
              <p>当前有 {dirtyModels.length} 个模型存在未保存变更。</p>
              <div className="flex flex-wrap gap-2">
                {dirtyModels.map(({ item, draft }) => (
                  <Badge key={item.model_name} variant="outline">
                    {item.display_name || item.model_name}: {formatItemSummary(item)} {" -> "} {formatDraftSummary(item, draft)}
                  </Badge>
                ))}
              </div>
            </AlertDescription>
          </Alert>
        ) : null}
        {invalidModels.length > 0 ? (
          <Alert variant="destructive">
            <AlertDescription className="space-y-2">
              <p>以下模型的费率字段不合法，保存前需要先修正。</p>
              <div className="flex flex-wrap gap-2">
                {invalidModels.map(({ item, validationMessage }) => (
                  <Badge key={item.model_name} variant="outline">
                    {item.display_name || item.model_name}: {validationMessage}
                  </Badge>
                ))}
              </div>
            </AlertDescription>
          </Alert>
        ) : null}
        {loading ? <Skeleton className="h-10 w-full" /> : null}
        <ScrollArea className="w-full rounded-md border">
          <Table className="min-w-[1560px]">
            <TableHeader>
              <TableRow>
                <TableHead>模型</TableHead>
                <TableHead>计费单位</TableHead>
                <TableHead>售价/分钟</TableHead>
                <TableHead>售价/1k Tokens</TableHead>
                <TableHead>成本/分钟</TableHead>
                <TableHead>毛利</TableHead>
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
                const validationMessage = getRateDraftValidationMessage(draft);
                const tokenBilling = isTokenBilling(draft);
                const priceInvalid = !tokenBilling && Number.isFinite(Number(draft.price_per_minute_cents)) && !Number.isInteger(Number(draft.price_per_minute_cents || 0));
                const tokenInvalid = tokenBilling && Number.isFinite(Number(draft.points_per_1k_tokens)) && !Number.isInteger(Number(draft.points_per_1k_tokens || 0));
                const costInvalid = !tokenBilling && Number.isFinite(Number(draft.cost_per_minute_cents)) && !Number.isInteger(Number(draft.cost_per_minute_cents || 0));
                return (
                  <TableRow key={item.model_name}>
                    <TableCell className="font-medium">
                      <div className="space-y-1">
                        <p>{item.display_name || item.model_name}</p>
                        <p className="text-xs text-muted-foreground">{item.model_name}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{tokenBilling ? "1k_tokens" : "minute"}</Badge>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        value={draft.price_per_minute_cents}
                        onChange={(e) => updateDraft(item.model_name, { price_per_minute_cents: Number(e.target.value || 0) })}
                        aria-invalid={priceInvalid}
                        className="max-w-[150px]"
                        disabled={tokenBilling}
                      />
                      <p className={`mt-1 text-xs ${priceInvalid ? "text-destructive" : "text-muted-foreground"}`}>
                        {tokenBilling ? "仅 ASR 模型使用" : priceInvalid ? RATE_INTEGER_CENTS_MESSAGE : formatMoneyPerMinute(draft.price_per_minute_cents)}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        value={draft.points_per_1k_tokens}
                        onChange={(e) => updateDraft(item.model_name, { points_per_1k_tokens: Number(e.target.value || 0) })}
                        aria-invalid={tokenInvalid}
                        className="max-w-[150px]"
                        disabled={!tokenBilling}
                      />
                      <p className={`mt-1 text-xs ${tokenInvalid ? "text-destructive" : "text-muted-foreground"}`}>
                        {tokenBilling ? `${Number(draft.points_per_1k_tokens || 0)} / 1k Tokens` : "仅 MT 模型使用"}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        value={draft.cost_per_minute_cents}
                        onChange={(e) => updateDraft(item.model_name, { cost_per_minute_cents: Number(e.target.value || 0) })}
                        aria-invalid={costInvalid}
                        className="max-w-[150px]"
                        disabled={tokenBilling}
                      />
                      <p className={`mt-1 text-xs ${costInvalid ? "text-destructive" : "text-muted-foreground"}`}>
                        {tokenBilling ? "仅 ASR 模型使用" : costInvalid ? RATE_INTEGER_CENTS_MESSAGE : formatMoneyPerMinute(draft.cost_per_minute_cents)}
                      </p>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">
                        {validationMessage
                          ? "请先修正费率"
                          : tokenBilling
                            ? `${Number(draft.points_per_1k_tokens || 0)} / 1k Tokens`
                            : formatMoneyPerMinute(Number(draft.price_per_minute_cents || 0) - Number(draft.cost_per_minute_cents || 0))}
                      </div>
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
                      <Button
                        size="sm"
                        onClick={() => saveRate(item.model_name)}
                        disabled={savingModel === item.model_name || Boolean(validationMessage)}
                      >
                        {savingModel === item.model_name ? "保存中..." : "保存"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {rates.length === 0 && !loading ? (
                <TableRow>
                  <TableCell colSpan={13} className="text-muted-foreground">
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
