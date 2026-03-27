import { Settings2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AdminErrorNotice } from "../../shared/components/AdminErrorNotice";
import { formatDateTimeBeijing } from "../../shared/lib/datetime";
import { formatNetworkError, formatResponseError, parseJsonSafely } from "../../shared/lib/errorFormatter";
import { formatMoneyYuanPerMinute } from "../../shared/lib/money";
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
  Skeleton,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../shared/ui";
import {
  RATE_DECIMAL_YUAN_MESSAGE,
  RATE_INTEGER_CENTS_MESSAGE,
  TOKEN_COST_DECIMAL_MESSAGE,
  TOKEN_COST_LABEL,
  TOKEN_RATE_LABEL,
  getInvalidRateFieldLabels,
  getRateDraftValidationMessage,
} from "./rateDraftValidation";

function isTokenBilling(item) {
  return String(item?.billing_unit || "minute") === "1k_tokens";
}

function toMinuteRateDraftValue(item, yuanField, centsField) {
  const yuanValue = item?.[yuanField];
  if (yuanValue !== undefined && yuanValue !== null && String(yuanValue).trim() !== "") {
    return String(yuanValue);
  }
  const centsValue = Number(item?.[centsField] || (centsField === "price_per_minute_cents" ? item?.points_per_minute : 0));
  return (Number.isFinite(centsValue) ? centsValue / 100 : 0).toFixed(4);
}

function parseDraftNumber(value) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : 0;
}

function formatTokenYuanValue(value) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized.toFixed(4) : "0.0000";
}

function getTokenPriceYuan(draft) {
  return Number(draft?.points_per_1k_tokens || 0) / 100;
}

function getTokenCostYuan(draft) {
  return parseDraftNumber(draft?.cost_per_minute_yuan);
}

function isDraftChanged(item, draft) {
  return (
    String(toMinuteRateDraftValue(item, "price_per_minute_yuan", "price_per_minute_cents")) !== String(draft.price_per_minute_yuan || "") ||
    Number(item.points_per_1k_tokens || 0) !== Number(draft.points_per_1k_tokens || 0) ||
    String(toMinuteRateDraftValue(item, "cost_per_minute_yuan", "cost_per_minute_cents")) !== String(draft.cost_per_minute_yuan || "") ||
    String(item.billing_unit || "minute") !== String(draft.billing_unit || "minute") ||
    Boolean(item.is_active) !== Boolean(draft.is_active)
  );
}

function formatDraftSummary(item, draft) {
  if (isTokenBilling(item) || isTokenBilling(draft)) {
    return `售价 ${Number(draft.points_per_1k_tokens || 0)} / 1k Tokens · 成本 ${formatTokenYuanValue(draft.cost_per_minute_yuan)} 元 / 1k Tokens`;
  }
  return `${formatMoneyYuanPerMinute(draft.price_per_minute_yuan, {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  })} / ${formatMoneyYuanPerMinute(draft.cost_per_minute_yuan, {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  })}`;
}

function formatItemSummary(item) {
  if (isTokenBilling(item)) {
    return `售价 ${Number(item.points_per_1k_tokens || 0)} / 1k Tokens · 成本 ${formatTokenYuanValue(item.cost_per_minute_yuan)} 元 / 1k Tokens`;
  }
  return `${formatMoneyYuanPerMinute(item.price_per_minute_yuan, {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  })} / ${formatMoneyYuanPerMinute(item.cost_per_minute_yuan, {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  })}`;
}

function buildDraftMap(list) {
  const draftMap = {};
  list.forEach((item) => {
    draftMap[item.model_name] = {
      price_per_minute_yuan: toMinuteRateDraftValue(item, "price_per_minute_yuan", "price_per_minute_cents"),
      points_per_1k_tokens: Number(item.points_per_1k_tokens || 0),
      cost_per_minute_yuan: toMinuteRateDraftValue(item, "cost_per_minute_yuan", "cost_per_minute_cents"),
      billing_unit: String(item.billing_unit || "minute"),
      is_active: Boolean(item.is_active),
    };
  });
  return draftMap;
}

export function AdminRatesTab({ apiCall }) {
  const [rates, setRates] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingModel, setSavingModel] = useState("");
  const [savingAll, setSavingAll] = useState(false);
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
      setDrafts(buildDraftMap(list));
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
    void loadRates();
  }, []);

  async function saveRate(modelName) {
    const draft = drafts[modelName];
    if (!draft) return false;
    const validationMessage = getRateDraftValidationMessage(draft);
    if (validationMessage) {
      setStatus(validationMessage);
      return false;
    }

    setSavingModel(modelName);
    setStatus("");
    clearError();
    try {
      const resp = await apiCall(`/api/admin/billing-rates/${encodeURIComponent(modelName)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          price_per_minute_yuan: parseDraftNumber(draft.price_per_minute_yuan),
          points_per_1k_tokens: Number(draft.points_per_1k_tokens || 0),
          cost_per_minute_yuan: parseDraftNumber(draft.cost_per_minute_yuan),
          billing_unit: String(draft.billing_unit || "minute"),
          is_active: Boolean(draft.is_active),
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
        return false;
      }
      const message = `模型 ${modelName} 的计费配置已更新`;
      setStatus(message);
      toast.success(message);
      await loadRates();
      return true;
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
      return false;
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
    .map((item) => ({ item, draft: drafts[item.model_name] || buildDraftMap([item])[item.model_name] }))
    .filter(({ item, draft }) => isDraftChanged(item, draft));

  const invalidModels = rates
    .map((item) => ({
      item,
      draft: drafts[item.model_name] || buildDraftMap([item])[item.model_name],
      validationMessage: getRateDraftValidationMessage(drafts[item.model_name] || buildDraftMap([item])[item.model_name]),
    }))
    .filter(({ validationMessage }) => Boolean(validationMessage));

  async function saveAllRates() {
    if (invalidModels.length > 0) {
      setStatus("请先修正所有非法的费率字段，再尝试一次保存全部更改。");
      return;
    }
    if (dirtyModels.length === 0) {
      setStatus("当前没有需要保存的计费变更。");
      return;
    }

    setSavingAll(true);
    setStatus("");
    clearError();
    try {
      for (const { item } of dirtyModels) {
        const ok = await saveRate(item.model_name);
        if (!ok) {
          break;
        }
      }
    } finally {
      setSavingAll(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Settings2 className="size-4" />
          计费配置
        </CardTitle>
        <CardDescription>这里只维护售价、成本参考、计费单位和启停状态；运行时调优不再作为日常计费编辑的一部分。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {dirtyModels.length > 0 ? (
          <Alert>
            <AlertDescription className="space-y-2">
              <p>当前有 {dirtyModels.length} 个模型存在未保存的计费变更。</p>
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

        {dirtyModels.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <p>已修改 {dirtyModels.length} 个模型，仅同步到页面草稿，保存后才会真正生效。</p>
            <Button size="sm" onClick={saveAllRates} disabled={savingAll || loading || savingModel || invalidModels.length > 0}>
              {savingAll ? "正在保存全部..." : "保存全部更改"}
            </Button>
          </div>
        ) : null}

        {loading ? <Skeleton className="h-10 w-full" /> : null}

        <div className="w-full overflow-x-auto rounded-md border">
          <Table className="min-w-[1160px]">
            <TableHeader>
              <TableRow>
                <TableHead>模型</TableHead>
                <TableHead>计费单位</TableHead>
                <TableHead>售价（元/分钟）</TableHead>
                <TableHead>售价 / 1k Tokens</TableHead>
                <TableHead>成本（元/分钟）</TableHead>
                <TableHead>毛利</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>更新时间</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rates.map((item) => {
                const fallbackDraft = buildDraftMap([item])[item.model_name];
                const draft = drafts[item.model_name] || fallbackDraft;
                const validationMessage = getRateDraftValidationMessage(draft);
                const tokenBilling = isTokenBilling(draft);
                const invalidFields = getInvalidRateFieldLabels(draft);
                const priceInvalid = invalidFields.includes("售价（元/分钟）");
                const tokenInvalid = invalidFields.includes(TOKEN_RATE_LABEL);
                const costInvalid = invalidFields.includes(TOKEN_COST_LABEL) || invalidFields.includes("成本(元/分钟)");
                const draftGrossProfit = tokenBilling
                  ? getTokenPriceYuan(draft) - getTokenCostYuan(draft)
                  : parseDraftNumber(draft.price_per_minute_yuan) - parseDraftNumber(draft.cost_per_minute_yuan);

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
                        step="0.0001"
                        value={draft.price_per_minute_yuan}
                        onChange={(event) => updateDraft(item.model_name, { price_per_minute_yuan: event.target.value })}
                        aria-invalid={priceInvalid}
                        className="max-w-[180px]"
                        disabled={tokenBilling}
                      />
                      <p className={`mt-1 text-xs ${priceInvalid ? "text-destructive" : "text-muted-foreground"}`}>
                        {tokenBilling
                          ? "仅 MT 模型使用上方字段"
                          : priceInvalid
                            ? RATE_DECIMAL_YUAN_MESSAGE
                            : formatMoneyYuanPerMinute(draft.price_per_minute_yuan, {
                                minimumFractionDigits: 4,
                                maximumFractionDigits: 4,
                              })}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        value={draft.points_per_1k_tokens}
                        onChange={(event) => updateDraft(item.model_name, { points_per_1k_tokens: Number(event.target.value || 0) })}
                        aria-invalid={tokenInvalid}
                        className="max-w-[150px]"
                        disabled={!tokenBilling}
                      />
                      <p className={`mt-1 text-xs ${tokenInvalid ? "text-destructive" : "text-muted-foreground"}`}>
                        {tokenBilling ? `${Number(draft.points_per_1k_tokens || 0)} / 1k Tokens` : "仅 MT 模型使用"}
                        {tokenInvalid ? ` ${RATE_INTEGER_CENTS_MESSAGE}` : ""}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        step="0.0001"
                        value={draft.cost_per_minute_yuan}
                        onChange={(event) => updateDraft(item.model_name, { cost_per_minute_yuan: event.target.value })}
                        aria-invalid={costInvalid}
                        className="max-w-[180px]"
                      />
                      <p className={`mt-1 text-xs ${costInvalid ? "text-destructive" : "text-muted-foreground"}`}>
                        {tokenBilling
                          ? costInvalid
                            ? TOKEN_COST_DECIMAL_MESSAGE
                            : `${formatTokenYuanValue(draft.cost_per_minute_yuan)} 元 / 1k Tokens`
                          : costInvalid
                            ? RATE_DECIMAL_YUAN_MESSAGE
                            : formatMoneyYuanPerMinute(draft.cost_per_minute_yuan, {
                                minimumFractionDigits: 4,
                                maximumFractionDigits: 4,
                              })}
                      </p>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">
                        {validationMessage
                          ? "请先修正费率"
                          : tokenBilling
                            ? `${formatTokenYuanValue(draftGrossProfit)} 元 / 1k Tokens`
                            : formatMoneyYuanPerMinute(draftGrossProfit, {
                                minimumFractionDigits: 4,
                                maximumFractionDigits: 4,
                              })}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={Boolean(draft.is_active)}
                          onCheckedChange={(checked) => updateDraft(item.model_name, { is_active: checked })}
                        />
                        <span className="text-xs text-muted-foreground">{draft.is_active ? "启用" : "停用"}</span>
                      </div>
                    </TableCell>
                    <TableCell>{formatDateTimeBeijing(item.updated_at)}</TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        onClick={() => saveRate(item.model_name)}
                        disabled={savingAll || savingModel === item.model_name || Boolean(validationMessage)}
                      >
                        {savingModel === item.model_name ? "保存中..." : "保存"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}

              {rates.length === 0 && !loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-muted-foreground">
                    暂无计费配置
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>

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
