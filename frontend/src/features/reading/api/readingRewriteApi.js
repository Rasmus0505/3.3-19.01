/**
 * readingRewriteApi.js — Phase 34: 新 Schema API 调用
 *
 * 新流程：识别高难度词 → /simplify-words → 本地按顺序替换
 */
import { apiCall } from "../../shared/api/client.js";

/**
 * 估算重写 token 消耗（用于显示费用）
 * @param {string} text
 * @param {string} accessToken
 * @returns {Promise<{estimatedTokens: number, estimatedChargeYuan: number}>}
 */
export async function estimateRewriteTokens(text, accessToken) {
  const resp = await apiCall("/api/llm/estimate-tokens?text=" + encodeURIComponent(text), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    throw new Error(data.detail || "估算失败");
  }
  const data = await resp.json();
  return {
    estimatedTokens: data.estimated_tokens,
    estimatedChargeYuan: data.estimated_charge_yuan,
  };
}

/**
 * 调用简化词汇接口（Phase 34 新 Schema）
 * @param {string} sentence — 原文句子
 * @param {string[]} words — 需要简化的高难度词列表（按顺序）
 * @param {string} targetLevel — 目标 CEFR 等级
 * @param {string} accessToken
 * @param {boolean} [enableThinking=false]
 * @returns {Promise<{simplifiedWords: string[], chargeCents: number, traceId: string}>}
 */
export async function simplifyWords(sentence, words, targetLevel, accessToken, enableThinking = false) {
  const resp = await apiCall("/api/llm/simplify-words", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ sentence, words, target_level: targetLevel, enable_thinking: enableThinking }),
  });

  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    throw new Error(data.detail || "简化词汇请求失败");
  }
  const data = await resp.json();
  return {
    simplifiedWords: data.simplified_words,
    chargeCents: data.charge_cents,
    traceId: data.trace_id,
  };
}
