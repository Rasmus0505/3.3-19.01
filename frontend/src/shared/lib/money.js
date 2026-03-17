export function formatMoneyCents(amountCents) {
  const normalized = Number(amountCents || 0) / 100;
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(normalized) ? normalized : 0);
}

export function formatMoneyPerMinute(amountCents) {
  return `${formatMoneyCents(amountCents)}/分钟`;
}

export function formatAmountByUnit(value, unit = "cents") {
  if (String(unit || "").toLowerCase() === "points") {
    return `${Number(value || 0)} 点`;
  }
  return formatMoneyCents(value);
}
