import React from "react";

/**
 * RewriteEstimateBanner — 重写前显示预估费用
 * Phase 34: 在发起重写前先显示 token 估算
 * @param {{ estimatedChargeYuan: number|null, estimatedTokens: number|null }} props
 */
export function RewriteEstimateBanner({ estimatedChargeYuan, estimatedTokens }) {
  if (estimatedChargeYuan === null && estimatedTokens === null) return null;

  return (
    <div className="rewrite-estimate-banner">
      <span className="rewrite-estimate-icon">⚡</span>
      <span>
        预计消耗：{estimatedChargeYuan !== null ? `${estimatedChargeYuan.toFixed(2)} 元` : "—"}
        {estimatedTokens !== null && ` (≈ ${estimatedTokens} tokens)`}
      </span>
    </div>
  );
}
