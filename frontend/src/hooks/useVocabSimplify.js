/**
 * useVocabSimplify.js — 精准词汇简化 hook
 * =========================================
 * Phase 29: 精准词汇替换优化
 *
 * 流程：
 * 1. 用 VocabAnalyzer 提取超过目标 CEFR 级别的词汇
 * 2. 调用 /api/llm/simplify-vocabulary 获取替换列表
 * 3. 前端执行替换，生成简化后的句子
 *
 * 节省约 70-80% tokens：只发送超纲词而非整段文本
 */

import { useCallback, useState } from "react";
import { parseResponse } from "../shared/api/client";
import { readCefrLevel } from "../app/authStorage";

const CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2", "SUPER"];

/**
 * 根据用户级别计算目标简化级别（i+1 原则）
 */
function getTargetLevel(userLevel) {
  const idx = CEFR_ORDER.indexOf(userLevel);
  const targetIdx = Math.min(idx + 1, CEFR_ORDER.length - 1);
  return CEFR_ORDER[targetIdx];
}

/**
 * 在句子中按顺序替换词汇（支持多词短语替换）
 * @param {string} sentence - 原始句子
 * @param {{ original: string, replacement: string }[]} replacements - 替换对
 * @returns {string} 替换后的句子
 */
function applyReplacements(sentence, replacements) {
  let result = sentence;
  for (const { original, replacement } of replacements) {
    // 使用单词边界匹配，忽略大小写
    const regex = new RegExp(`\\b${original.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    result = result.replace(regex, replacement);
  }
  return result;
}

/**
 * useVocabSimplify — 词汇简化状态管理
 *
 * @param {object} props
 * @param {Function} props.apiCall - API 调用函数
 * @param {Function} props.analyzer - VocabAnalyzer 实例（ref.current）
 * @param {string} props.accessToken - 用户 access token
 */
export function useVocabSimplify({ apiCall, analyzer, accessToken }) {
  const [simplifyLoading, setSimplifyLoading] = useState(false);
  const [simplifyError, setSimplifyError] = useState(null);
  const [simplifyResult, setSimplifyResult] = useState(null);
  // simplifyResult 格式: { simplifiedSentence: string, replacements: { original, replacement }[], usage: object }

  const simplifySentence = useCallback(
    async (sentence, targetLevelOverride) => {
      const { toast } = await import("sonner");

      if (!accessToken) {
        const msg = "请先登录后再使用词汇简化";
        toast.error(msg);
        setSimplifyError(msg);
        return;
      }
      if (!apiCall) {
        const msg = "未接入请求接口";
        toast.error("无法发起简化：" + msg);
        setSimplifyError(msg);
        return;
      }
      if (!analyzer?.isLoaded) {
        const msg = "词汇表未加载，请稍后再试";
        toast.error(msg);
        setSimplifyError(msg);
        return;
      }

      const userLevel = readCefrLevel() || "B1";
      const targetLevel = targetLevelOverride || getTargetLevel(userLevel);

      // Step 1: 用 VocabAnalyzer 提取超过目标级别的词汇
      const highLevelWords = analyzer.extractWordsAboveLevel(sentence, targetLevel);

      if (highLevelWords.length === 0) {
        toast.info("当前句子没有需要简化的词汇");
        setSimplifyResult({ simplifiedSentence: sentence, replacements: [], usage: null });
        return;
      }

      setSimplifyLoading(true);
      setSimplifyError(null);

      try {
        const wordsToSimplify = highLevelWords.map((w) => w.word);

        // Step 2: 调用 API 获取替换列表
        const resp = await apiCall("/api/llm/simplify-vocabulary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sentences: [sentence],
            words_to_simplify: wordsToSimplify,
            target_level: targetLevel,
            enable_thinking: false,
          }),
        });

        const data = await parseResponse(resp);

        if (!resp.ok || !data.ok || !Array.isArray(data.replacements)) {
          const msg = data?.message || data?.detail || "简化失败";
          toast.error("简化失败：" + msg);
          setSimplifyError(msg);
          return;
        }

        // Step 3: 构建替换对（按顺序）
        const replacements = wordsToSimplify.map((word, i) => ({
          original: word,
          replacement: data.replacements[i] || word,
        }));

        // Step 4: 前端执行替换
        const simplifiedSentence = applyReplacements(sentence, replacements);

        setSimplifyResult({
          simplifiedSentence,
          replacements,
          usage: data.usage,
          charge_cents: data.charge_cents,
          model: data.model,
        });

        const chargeYuan = (data.charge_cents || 0) / 100;
        toast.success(
          "简化完成" +
            (chargeYuan > 0 ? "，消耗 " + chargeYuan.toFixed(2) + " 元" : "") +
            `（替换了 ${replacements.length} 个词）`
        );
      } catch (err) {
        const msg = err?.message || "网络错误";
        toast.error("简化失败：" + msg);
        setSimplifyError(msg);
      } finally {
        setSimplifyLoading(false);
      }
    },
    [accessToken, apiCall, analyzer]
  );

  const clearSimplify = useCallback(() => {
    setSimplifyResult(null);
    setSimplifyError(null);
  }, []);

  return {
    simplifySentence,
    clearSimplify,
    simplifyLoading,
    simplifyError,
    simplifyResult,
  };
}
