export const RATE_INTEGER_CENTS_MESSAGE = "费率字段必须填写为非负整数。";

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function isTokenBillingDraft(draft) {
  return String(draft?.billing_unit || "minute") === "1k_tokens";
}

export function getInvalidRateFieldLabels(draft) {
  const invalidLabels = [];
  if (isTokenBillingDraft(draft)) {
    if (!isNonNegativeInteger(Number(draft?.points_per_1k_tokens ?? 0))) {
      invalidLabels.push("售价/1k Tokens");
    }
    return invalidLabels;
  }
  if (!isNonNegativeInteger(Number(draft?.price_per_minute_cents ?? 0))) {
    invalidLabels.push("售价/分钟");
  }
  if (!isNonNegativeInteger(Number(draft?.cost_per_minute_cents ?? 0))) {
    invalidLabels.push("成本/分钟");
  }
  return invalidLabels;
}

export function getRateDraftValidationMessage(draft) {
  const invalidLabels = getInvalidRateFieldLabels(draft);
  if (!invalidLabels.length) {
    return "";
  }
  return `${invalidLabels.join("、")} ${RATE_INTEGER_CENTS_MESSAGE}`;
}
