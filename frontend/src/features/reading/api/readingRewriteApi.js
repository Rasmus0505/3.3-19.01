/**
 * readingRewriteApi.js — Phase 34: 新 Schema API 调用
 *
 * 新流程：识别高难度词 → /simplify-words → 本地按顺序替换
 * 新流程 v2: /filter-and-simplify-words → 二次筛选 + 重写
 */
import { api } from "../../../shared/api/client.js";

/**
 * 估算重写 token 消耗（用于显示费用）
 * @param {string} text
 * @param {string} accessToken
 * @returns {Promise<{estimatedTokens: number, estimatedChargeYuan: number}>}
 */
export async function estimateRewriteTokens(text, accessToken) {
  const resp = await api("/api/llm/estimate-tokens?text=" + encodeURIComponent(text), {
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
 * Step 2: 调用筛选并简化词汇接口（新流程）
 * @param {string} sentence — 原文
 * @param {string[]} words — 词典筛选出的候选词列表
 * @param {object} wordLevels — 词典标注的等级 {word: level}
 * @param {string} targetLevel — 目标等级（i+1）
 * @param {string} userLevel — 用户当前等级
 * @param {string} accessToken
 * @param {boolean} [enableThinking=false]
 * @returns {Promise<{
 *   validI1Words: string[],
 *   validAboveI1Words: string[],
 *   removedWords: Array<{word: string, reason: string}>,
 *   simplifiedWords: string[],
 *   wordLevels: object,
 *   chargeCents: number,
 *   traceId: string
 * }>}
 */
export async function filterAndSimplifyWords(sentence, words, wordLevels, targetLevel, userLevel, accessToken, enableThinking = false) {
  const resp = await api("/api/llm/filter-and-simplify-words", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      sentence,
      words,
      word_levels: wordLevels,
      target_level: targetLevel,
      user_level: userLevel,
      enable_thinking: enableThinking,
    }),
  });

  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    throw new Error(data.detail || "筛选并简化词汇请求失败");
  }
  const data = await resp.json();
  return {
    validI1Words: data.valid_i1_words || [],
    validAboveI1Words: data.valid_above_i1_words || [],
    removedWords: data.removed_words || [],
    simplifiedWords: data.simplified_words || [],
    wordLevels: data.word_levels || {},
    chargeCents: data.charge_cents,
    traceId: data.trace_id,
  };
}

/**
 * 调用简化词汇接口（Phase 34 旧 Schema，保留向后兼容）
 * @param {string} sentence — 原文句子
 * @param {string[]} words — 需要简化的高难度词列表（按顺序）
 * @param {string} targetLevel — 目标 CEFR 等级
 * @param {string} accessToken
 * @param {boolean} [enableThinking=false]
 * @param {object|null} [wordLevels=null]
 * @returns {Promise<{simplifiedWords: string[], chargeCents: number, traceId: string}>}
 */
export async function simplifyWords(sentence, words, targetLevel, accessToken, enableThinking = false, wordLevels = null) {
  const resp = await api("/api/llm/simplify-words", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      sentence,
      words,
      target_level: targetLevel,
      enable_thinking: enableThinking,
      word_levels: wordLevels,
    }),
  });

  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    throw new Error(data.detail || "简化词汇请求失败");
  }
  const data = await resp.json();
  return {
    simplifiedWords: data.simplified_words,
    wordLevels: data.word_levels || {},  // DeepSeek 判断的 CEFR 等级
    chargeCents: data.charge_cents,
    traceId: data.trace_id,
  };
}
