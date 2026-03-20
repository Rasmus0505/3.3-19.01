export const RATE_INTEGER_CENTS_MESSAGE = "1k Tokens 费率必须填写为非负整数。";
export const RATE_DECIMAL_YUAN_MESSAGE = "元/分钟费率必须填写为非负数字，且最多保留 4 位小数。";

export const TOKEN_RATE_LABEL = "售价/1k Tokens";
export const PRICE_PER_MINUTE_YUAN_LABEL = "售价(元/分钟)";
export const COST_PER_MINUTE_YUAN_LABEL = "成本(元/分钟)";

function isTokenBillingDraft(draft) {
  return String(draft?.billing_unit || "minute") === "1k_tokens";
}

function isNonNegativeInteger(value) {
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized >= 0;
}

function isNonNegativeDecimalWithScale(value, scale = 4) {
  const text = String(value ?? "").trim();
  if (!text) return false;
  if (!/^\d+(?:\.\d+)?$/.test(text)) return false;
  const parts = text.split(".");
  return parts.length < 2 || parts[1].length <= scale;
}

export function getInvalidMinuteYuanFieldLabels(draft) {
  const invalidLabels = [];
  if (!isNonNegativeDecimalWithScale(draft?.price_per_minute_yuan, 4)) {
    invalidLabels.push(PRICE_PER_MINUTE_YUAN_LABEL);
  }
  if (!isNonNegativeDecimalWithScale(draft?.cost_per_minute_yuan, 4)) {
    invalidLabels.push(COST_PER_MINUTE_YUAN_LABEL);
  }
  return invalidLabels;
}

export function getInvalidRateFieldLabels(draft) {
  if (isTokenBillingDraft(draft)) {
    return isNonNegativeInteger(draft?.points_per_1k_tokens) ? [] : [TOKEN_RATE_LABEL];
  }
  return getInvalidMinuteYuanFieldLabels(draft);
}

export function getRateDraftValidationMessage(draft) {
  const invalidLabels = getInvalidRateFieldLabels(draft);
  if (!invalidLabels.length) {
    return "";
  }
  const suffix = isTokenBillingDraft(draft) ? RATE_INTEGER_CENTS_MESSAGE : RATE_DECIMAL_YUAN_MESSAGE;
  return `${invalidLabels.join("、")} ${suffix}`;
}
