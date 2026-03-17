export const RATE_INTEGER_CENTS_MESSAGE = "分钟售价和分钟成本按分填写，必须是非负整数；例如 1 表示 ¥0.01。";

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

export function getInvalidMinuteCentsFieldLabels(draft) {
  const invalidLabels = [];
  if (!isNonNegativeInteger(Number(draft?.price_per_minute_cents ?? 0))) {
    invalidLabels.push("售价/分钟");
  }
  if (!isNonNegativeInteger(Number(draft?.cost_per_minute_cents ?? 0))) {
    invalidLabels.push("成本/分钟");
  }
  return invalidLabels;
}

export function getRateDraftValidationMessage(draft) {
  const invalidLabels = getInvalidMinuteCentsFieldLabels(draft);
  if (!invalidLabels.length) {
    return "";
  }
  return `${invalidLabels.join("、")} ${RATE_INTEGER_CENTS_MESSAGE}`;
}
