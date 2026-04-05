/**
 * useReadingRewrite.js — 阅读板块 AI 重写状态管理
 * ==============================================
 * Phase 29: AI 重写与路由
 * Phase 32: IndexedDB 持久化（articleId 主键，自动加载，视图偏好记忆）
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { parseResponse } from "../shared/api/client";
import { readCefrLevel } from "../app/authStorage";
import {
  saveRewriteRecord as dbSave,
  getRewriteRecord,
  updateViewMode as dbUpdateViewMode,
} from "../features/reading/readingRewriteDB";

/* ─── CEFR 等级计算 ──────────────────────────────────── */

const CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"];

function getTargetLevel(userLevel) {
  const userIdx = CEFR_ORDER.indexOf(userLevel);
  const targetIdx = Math.min(userIdx + 1, CEFR_ORDER.length - 1);
  return CEFR_ORDER[targetIdx];
}

/* ─── useReadingRewrite hook ──────────────────────────── */

/**
 * useReadingRewrite — 阅读板块重写状态管理
 *
 * @param {object} props
 * @param {Function} props.apiCall — API 调用函数（来自 LearningShell）
 * @param {string} props.accessToken — 用户 access token
 * @param {string|null} props.articleId — 当前文章 ID（来自 history record.id）
 * @param {Function} props.onSuccess — 重写成功时回调（articleId, rewrittenText）
 */
export function useReadingRewrite({ apiCall, accessToken, articleId, onSuccess }) {
  const [rewrittenText, setRewrittenText] = useState(null);
  const [rewriteMappings, setRewriteMappings] = useState([]);
  const [viewMode, setViewModeState] = useState("original");
  const [isRewriting, setIsRewriting] = useState(false);
  const [rewriteError, setRewriteError] = useState(null);

  // 上一次成功保存到 DB 的 articleId（用于检测文章切换时清空状态）
  const savedArticleIdRef = useRef(null);

  // ── 自动加载：当 articleId 变化时从 IndexedDB 读取 ─────
  useEffect(() => {
    if (!articleId) return;

    let cancelled = false;
    (async () => {
      try {
        const record = await getRewriteRecord(articleId);
        if (cancelled || !record) return;

        // 换了文章但本地还有未保存的状态，先清空
        if (savedArticleIdRef.current !== articleId) {
          setRewrittenText(null);
          setRewriteMappings([]);
          setRewriteError(null);
        }

        savedArticleIdRef.current = articleId;
        setRewrittenText(record.rewrittenText);
        setRewriteMappings(record.mappings || []);
        // 如果存储了 viewMode 使用它；否则默认显示重写版
        setViewModeState(record.viewMode || "rewritten");
      } catch (e) {
        console.error("Failed to auto-load rewrite:", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [articleId]);

  const handleSwitchView = useCallback(
    (mode) => {
      if (mode === "rewritten" && !rewrittenText) return;
      setViewModeState(mode);
      // 持久化视图偏好
      if (articleId) {
        dbUpdateViewMode(articleId, mode).catch(console.error);
      }
    },
    [rewrittenText, articleId]
  );

  const clearRewrite = useCallback(() => {
    setRewrittenText(null);
    setRewriteMappings([]);
    setRewriteError(null);
    setViewModeState("original");
  }, []);

  const handleRewrite = useCallback(
    async (originalText) => {
      const { toast } = await import("sonner");

      if (!accessToken) {
        const msg = "请先登录后再使用 AI 重写";
        toast.error(msg);
        setRewriteError(msg);
        return;
      }
      if (!apiCall) {
        const devHint =
          import.meta.env.DEV
            ? "（开发）ReadingPage 未收到 apiCall，请在 LearningShellPanelContent 中传入 apiCall={apiCall}"
            : "";
        const msg = "未接入请求接口" + (devHint ? " " + devHint : "");
        toast.error("无法发起重写：" + msg, { duration: import.meta.env.DEV ? 12000 : 6000 });
        setRewriteError(msg);
        return;
      }

      setIsRewriting(true);
      setRewriteError(null);

      try {
        const userLevel = readCefrLevel() || "B1";
        const targetLevel = getTargetLevel(userLevel);

        const resp = await apiCall("/api/llm/rewrite-text", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: originalText,
            target_level: targetLevel,
            enable_thinking: false,
            include_mappings: true,
          }),
        });

        const data = await parseResponse(resp);

        if (!resp.ok || !data.ok || !data.rewritten_text) {
          const msg = data?.message || "重写失败";
          toast.error("重写失败：" + msg);
          setRewriteError(msg);
          return;
        }

        const id = data.trace_id || crypto.randomUUID();

        // 保存到 IndexedDB（articleId 主键）
        if (articleId) {
          await dbSave({
            articleId,
            originalText,
            rewrittenText: data.rewritten_text,
            mappings: data.rewrite_mappings || [],
            viewMode: "rewritten",
            rewrittenAt: Date.now(),
          });
          savedArticleIdRef.current = articleId;
          onSuccess?.(articleId, data.rewritten_text);
        }

        setRewrittenText(data.rewritten_text);
        setRewriteMappings(data.rewrite_mappings || []);
        setViewModeState("rewritten");

        const chargeYuan = (data.charge_cents || 0) / 100;
        toast.success(
          "重写完成" + (chargeYuan > 0 ? "，消耗 " + chargeYuan.toFixed(2) + " 元" : "")
        );
      } catch (err) {
        const msg = err?.message || "网络错误";
        toast.error("重写失败：" + msg);
        setRewriteError(msg);
      } finally {
        setIsRewriting(false);
      }
    },
    [accessToken, apiCall, articleId]
  );

  return {
    rewrittenText,
    rewriteMappings,
    viewMode,
    setViewMode: handleSwitchView,
    isRewriting,
    rewriteError,
    clearRewrite,
    handleRewrite,
  };
}

/* ─── 历史遗留导出（兼容旧调用方） ────────────────────── */
// eslint-disable-next-line no-unused-vars
const _deprecated = null; // 原 saveRewriteRecord/getRewriteRecordById/getLatestRewriteRecord 已移除，请使用 readingRewriteDB.js
