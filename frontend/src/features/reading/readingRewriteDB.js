/**
 * readingRewriteDB.js — IndexedDB 模块：重写结果持久化
 * ======================================================
 * Phase 32: Rewrite Persistence
 *
 * 设计决策：
 * - articleId 为主键（每篇文章一条记录，与 history 表独立）
 * - 原文/重写全文均独立存储，不依赖 history 表
 * - viewMode 按文章独立记忆（原文/重写版切换偏好）
 * - 提供徽章查询：哪些文章已有重写记录
 */
const DB_NAME = "reading_rewrites_v2";
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
 * @property {string}   rewrittenText — AI 重写版全文
 * @property {object[]}  mappings      — 词汇替换映射 [{original, rewritten, sentence}]
 * @property {"original"|"rewritten"} viewMode — 用户偏好的视图
 * @property {number}    rewrittenAt  — 重写时间戳
 */

/* ─── CRUD ───────────────────────────────────────────── */

/**
 * 保存（或更新）重写记录
 * @param {RewriteRecord} record
 * @returns {Promise<string>} articleId
 */
export async function saveRewriteRecord(record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put({ ...record, rewrittenAt: record.rewrittenAt ?? Date.now() });
    tx.oncomplete = () => resolve(record.articleId);
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
    req.onsuccess = () => resolve(req.result ?? null);
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
