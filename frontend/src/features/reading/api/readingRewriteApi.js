/**
 * readingRewriteApi.js — Phase 34: 新 Schema API 调用
 *
 * 新流程 v3 (词形还原版):
 * 1. 词典 extractWordsAboveLevel() → 提取 >i+1 的词
 * 2. /extract-lemmas → 返回原型词列表
 * 3. 词典二次判断原型等级
 * 4. /simplify-words → 重写筛选后的词
 */
import { api } from "../../../shared/api/client.js";

function createReadingRewriteApiError(message, debug = {}) {
  const error = new Error(message);
  error.name = "ReadingRewriteApiError";
  error.debug = debug;
  return error;
}

async function readErrorPayload(response) {
  const rawText = await response.text().catch(() => "");
  let parsed = {};
  if (rawText) {
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = {};
    }
  }
  return {
    rawText,
    parsed,
    detail: parsed.detail || "",
  };
}

/**
 * Step 1: 提取词汇的原型词（词形还原）
 * @param {string} sentence — 原文
 * @param {string[]} words — 需要还原的词列表
 * @param {string} accessToken
 * @returns {Promise<{lemmas: string[], traceId: string}>}
 */
export async function extractLemmas(sentence, words, accessToken) {
  const resp = await api("/api/llm/extract-lemmas", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ sentence, words }),
  });

  if (!resp.ok) {
    const payload = await readErrorPayload(resp);
    throw createReadingRewriteApiError(payload.detail || "提取原型词请求失败", {
      endpoint: "/api/llm/extract-lemmas",
      status: resp.status,
      sentenceLength: String(sentence || "").length,
      wordsCount: Array.isArray(words) ? words.length : 0,
      words,
      detail: payload.detail || "",
      rawText: payload.rawText || "",
    });
  }
  const data = await resp.json();
  return {
    lemmas: data.lemmas,
    traceId: data.trace_id,
  };
}

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
    const payload = await readErrorPayload(resp);
    throw createReadingRewriteApiError(payload.detail || "估算失败", {
      endpoint: "/api/llm/estimate-tokens",
      status: resp.status,
      textLength: String(text || "").length,
      detail: payload.detail || "",
      rawText: payload.rawText || "",
    });
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
    const payload = await readErrorPayload(resp);
    throw createReadingRewriteApiError(payload.detail || "筛选并简化词汇请求失败", {
      endpoint: "/api/llm/filter-and-simplify-words",
      status: resp.status,
      sentenceLength: String(sentence || "").length,
      wordsCount: Array.isArray(words) ? words.length : 0,
      words,
      targetLevel,
      userLevel,
      detail: payload.detail || "",
      rawText: payload.rawText || "",
    });
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
 * @param {string} targetLevel — 目标 Collins 等级
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
    const payload = await readErrorPayload(resp);
    throw createReadingRewriteApiError(payload.detail || "简化词汇请求失败", {
      endpoint: "/api/llm/simplify-words",
      status: resp.status,
      sentenceLength: String(sentence || "").length,
      wordsCount: Array.isArray(words) ? words.length : 0,
      words,
      targetLevel,
      enableThinking: Boolean(enableThinking),
      wordLevels,
      detail: payload.detail || "",
      rawText: payload.rawText || "",
    });
  }
  const data = await resp.json();
  return {
    simplifiedWords: data.simplified_words,
    wordLevels: data.word_levels || {},  // DeepSeek 判断的 Collins 等级
    chargeCents: data.charge_cents,
    traceId: data.trace_id,
  };
}


/**
 * Sync a reading pack record to the backend (fire-and-forget).
 * Maps IndexedDB RewriteRecord fields to the backend API schema.
 * @param {object} record — IndexedDB RewriteRecord
 * @param {Function} apiCall — authenticated fetch wrapper
 */
export async function syncReadingPackToServer(record, apiCall) {
  if (!record?.articleId || !apiCall) return;
  try {
    await apiCall("/api/reading-packs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        article_id: record.articleId,
        title: (record.originalText || "").slice(0, 60),
        original_text: record.originalText || "",
        rewritten_text: record.rewrittenText || "",
        target_level: record.diagnosticSnapshot?.selectedTargetLevel || "B1",
        flow_status: record.flowStatus || "idle",
        mappings: record.mappings || null,
        word_levels: record.wordLevels || null,
        valid_i1_words: record.validI1Words || null,
        valid_above_i1_words: record.validAboveI1Words || null,
        removed_words: record.removedWords || null,
        diagnostic: record.diagnosticSnapshot || null,
        quiz: record.quiz || null,
        vocab_cards: record.vocabCards || null,
        course_data: record.readingCourse || record.courseData || null,
      }),
    });
  } catch {
    // Silent failure — backend sync is best-effort
  }
}


