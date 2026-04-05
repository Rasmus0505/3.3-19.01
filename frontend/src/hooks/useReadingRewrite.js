/**
 * useReadingRewrite.js — 阅读板块 AI 重写状态管理
 * ==============================================
 * 提供重写 API 调用、IndexedDB 本地存储、原文/重写版切换状态。
 *
 * Phase 29: AI 重写与路由
 */
import { useCallback, useState } from "react";
import { parseResponse } from "../shared/api/client";
import { readCefrLevel } from "../app/authStorage";

/* ─── IndexedDB 存储 ─────────────────────────────────── */

const DB_NAME = "reading_rewrites";
const DB_VERSION = 1;
const STORE_NAME = "rewrites";

function openRewriteDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("created_at", "created_at", { unique: false });
      }
    };
  });
}

/**
 * 保存重写记录到 IndexedDB
 * @param {object} record — { id, lesson_id, original_text, rewritten_text, target_level, user_level, created_at }
 * @returns {Promise<string>} — rewrite id
 */
export async function saveRewriteRecord(record) {
  const db = await openRewriteDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(record);
    req.onsuccess = () => resolve(record.id);
    req.onerror = () => reject(req.error);
  });
}

/**
 * 根据 id 获取重写记录
 */
export async function getRewriteRecordById(id) {
  const db = await openRewriteDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

/**
 * 获取最近一条重写记录
 */
export async function getLatestRewriteRecord() {
  const db = await openRewriteDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const index = store.index("created_at");
    const req = index.openCursor(null, "prev");
    req.onsuccess = () => {
      const cursor = req.result;
      resolve(cursor ? cursor.value : null);
    };
    req.onerror = () => reject(req.error);
  });
}

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
 */
export function useReadingRewrite({ apiCall, accessToken }) {
  const [rewrittenText, setRewrittenText] = useState(null);
  const [rewriteMappings, setRewriteMappings] = useState([]);
  const [rewriteId, setRewriteId] = useState(null);
  const [viewMode, setViewModeState] = useState("original");
  const [isRewriting, setIsRewriting] = useState(false);
  const [rewriteError, setRewriteError] = useState(null);

  const handleSwitchView = useCallback(
    (mode) => {
      if (mode === "rewritten" && !rewrittenText) return;
      setViewModeState(mode);
    },
    [rewrittenText]
  );

  const clearRewrite = useCallback(() => {
    setRewrittenText(null);
    setRewriteMappings([]);
    setRewriteId(null);
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

        await saveRewriteRecord({
          id,
          lesson_id: null,
          original_text: originalText,
          rewritten_text: data.rewritten_text,
          target_level: targetLevel,
          user_level: userLevel,
          created_at: Date.now(),
        });

        setRewriteId(id);
        setRewrittenText(data.rewritten_text);
        // #region agent log
        fetch('http://127.0.0.1:7741/ingest/66ae8bbb-d4f3-40a4-b6d9-17b56f3fcb44',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ff3acd'},body:JSON.stringify({sessionId:'ff3acd',location:'useReadingRewrite.js:handleRewrite-success',message:'rewrite response',data:{ok:data.ok,rewrittenTextLen:((data.rewritten_text)||'').length,mappingsLen:((data.rewrite_mappings)||[]).length,mappingsSample:((data.rewrite_mappings)||[]).slice(0,3).map(m=>({r:(m.rewritten||'').slice(0,20),o:(m.original||'').slice(0,20)}))},timestamp:Date.now(),runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
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
    [accessToken, apiCall]
  );

  return {
    rewrittenText,
    rewriteMappings,
    rewriteId,
    viewMode,
    setViewMode: handleSwitchView,
    isRewriting,
    rewriteError,
    clearRewrite,
    handleRewrite,
  };
}
