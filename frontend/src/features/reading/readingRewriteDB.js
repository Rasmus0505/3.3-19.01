/**
 * readingRewriteDB.js — IndexedDB 模块：重写结果持久化
 * ======================================================
 * Phase 32: Rewrite Persistence
 * v2 Enhancement: 新流程支持（i+1 保留、>i+1 重写）
 *
 * 设计决策：
 * - articleId 为主键（每篇文章一条记录，与 history 表独立）
 * - 原文/重写全文均独立存储，不依赖 history 表
 * - viewMode 按文章独立记忆（原文/重写版切换偏好）
 * - 提供徽章查询：哪些文章已有重写记录
 */
import { createInitialPipelineState, normalizePipelineState } from "./readingPipelineMachine";

const DB_NAME = "reading_rewrites_v3";
const DB_VERSION = 1;
const STORE_NAME = "rewrites";

/* ─── DB Open ────────────────────────────────────────── */

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "articleId" });
        store.createIndex("rewrittenAt", "rewrittenAt", { unique: false });
      }
    };
  });
}

/* ─── Schema ──────────────────────────────────────────── */

/**
 * @typedef {Object} RewriteRecord
 * @property {string}   articleId     — 文章 ID（主键，来自 history record.id）
 * @property {string}   originalText  — 原始文章全文
 * @property {string}   rewrittenText — AI 重写版全文（>i+1 词已被替换）
 * @property {object[]}  mappings      — >i+1 词汇替换映射
 *   每个条目：{
 *     original: string,      — 重写版中显示的词形（替换后的 i+1 词）
 *     originalLower: string, — 原文词小写（原文视图匹配用）
 *     rewritten: string,     — 原文词形（tooltip 对照用）
 *     confirmed: boolean,    — true=已简化，false=无需简化（返回空字符串）
 *     finalLevel: string     — 二次筛选后的最终等级
 *   }
 * @property {string[]}  validI1Words     — 有效的 i+1 词汇列表（原文视图用绿色下划线）
 * @property {string[]}  validAboveI1Words — 有效的 >i+1 词汇列表（原文视图用红色下划线）
 * @property {object[]}  removedWords      — 被过滤的词汇 [{word, reason}]
 * @property {object}    wordLevels       — 二次筛选后的最终等级 {word: level}
 * @property {object|null} diagnosticSnapshot — 诊断阶段快照（Phase 35）
 * @property {object|null} pipeline    — Phase 36 显式阶段快照
 * @property {object|null} readingPack — Phase 36 阅读包资产
 * @property {string|null} flowStatus — idle | diagnosed | pipeline | failed | generated
 * @property {"original"|"rewritten"} viewMode — 用户偏好的视图
 * @property {"original"|"rewritten"|"comparison"} packViewMode — 阅读包视图偏好
 * @property {number}    rewrittenAt  — 重写时间戳
 * @property {{questions: object[], generatedAt: number}|null} quiz — Phase 41 测验数据
 */

export function deriveFlowStatus(record = {}) {
  if (record.flowStatus) {
    return record.flowStatus;
  }
  if (record.readingPack?.status === "completed" || record.rewrittenText) {
    return "generated";
  }
  if (record.pipeline?.error?.stage) {
    return "failed";
  }
  if (record.pipeline?.currentStage || record.pipeline?.lastCompletedStage) {
    return "pipeline";
  }
  if (record.diagnosticSnapshot) {
    return "diagnosed";
  }
  return "idle";
}

export function normalizeRewriteRecord(record) {
  if (!record) {
    return null;
  }
  return {
    ...record,
    pipeline: normalizePipelineState(record.pipeline || createInitialPipelineState()),
    readingPack: record.readingPack || null,
    packViewMode: record.packViewMode || record.viewMode || "original",
    flowStatus: deriveFlowStatus(record),
    quiz: record.quiz ?? null,
    vocabCards: record.vocabCards ?? null,
    courseData: record.courseData ?? null,
  };
}

/* ─── CRUD ───────────────────────────────────────────── */

/**
 * 保存（或更新）重写记录
 * @param {RewriteRecord} record
 * @returns {Promise<string>} articleId
 */
export async function saveRewriteRecord(record) {
  const db = await openDB();
  const nextRecord = normalizeRewriteRecord(record);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put({ ...nextRecord, rewrittenAt: nextRecord.rewrittenAt ?? Date.now() });
    tx.oncomplete = () => resolve(nextRecord.articleId);
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * 按 articleId 读取重写记录
 * @param {string} articleId
 * @returns {Promise<RewriteRecord|null>}
 */
export async function getRewriteRecord(articleId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(articleId);
    req.onsuccess = () => resolve(normalizeRewriteRecord(req.result ?? null));
    req.onerror = () => reject(req.error);
  });
}

/**
 * 更新指定文章的视图偏好
 * @param {string} articleId
 * @param {"original"|"rewritten"} viewMode
 * @returns {Promise<void>}
 */
export async function updateViewMode(articleId, viewMode) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(articleId);
    getReq.onsuccess = () => {
      const record = getReq.result;
      if (!record) return resolve();
      record.viewMode = viewMode;
      if (!record.packViewMode || viewMode === "original" || viewMode === "rewritten") {
        record.packViewMode = viewMode;
      }
      const putReq = store.put(record);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

export async function updatePackViewMode(articleId, packViewMode) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(articleId);
    getReq.onsuccess = () => {
      const record = getReq.result;
      if (!record) return resolve();
      record.packViewMode = packViewMode;
      const putReq = store.put(record);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

/**
 * 删除重写记录
 * @param {string} articleId
 * @returns {Promise<void>}
 */
export async function deleteRewriteRecord(articleId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(articleId);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/* ─── Badge Queries ──────────────────────────────────── */

/**
 * 获取所有已有重写记录的文章 ID 集合
 * 用于 HistoryPanel 徽章显示
 * @returns {Promise<Set<string>>}
 */
export async function getRewrittenArticleIds() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => resolve(new Set((req.result || []).map((r) => r.articleId)));
    req.onerror = () => reject(req.error);
  });
}

/**
 * 检查指定文章是否有重写记录
 * @param {string} articleId
 * @returns {Promise<boolean>}
 */
export async function hasRewrite(articleId) {
  const record = await getRewriteRecord(articleId);
  return record !== null;
}

export async function getAllRewriteRecords() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => resolve((req.result || []).map((record) => normalizeRewriteRecord(record)));
    req.onerror = () => reject(req.error);
  });
}

/**
 * 保存测验数据到指定文章的记录
 * @param {string} articleId
 * @param {{questions: object[], generatedAt: number}} quiz
 * @returns {Promise<void>}
 */
export async function saveQuizToRecord(articleId, quiz) {
  const existing = await getRewriteRecord(articleId);
  if (!existing) return;
  await saveRewriteRecord({ ...existing, quiz });
}

/**
 * Save course data (discussion script + progress) to an article's record.
 * @param {string} articleId
 * @param {object} courseData — { discussion, progress, settings }
 * @returns {Promise<void>}
 */
export async function saveCourseDataToRecord(articleId, courseData) {
  const existing = await getRewriteRecord(articleId);
  if (!existing) return;
  await saveRewriteRecord({ ...existing, courseData });
}

export async function clearAllRewriteRecords() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
