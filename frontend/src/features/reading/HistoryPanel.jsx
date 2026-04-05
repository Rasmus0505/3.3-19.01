/**
 * HistoryPanel.jsx — 阅读板块顶部历史记录区
 * ==========================================
 * 展示用户之前阅读过的文章列表，点击后加载到左侧阅读区。
 *
 * 存储使用 IndexedDB (reading_history 数据库)。
 */
import { Clock, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "../../lib/utils";

/* ─── IndexedDB ─────────────────────────────────── */

const DB_NAME = "reading_history";
const DB_VERSION = 1;
const STORE_NAME = "history";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("read_at", "read_at", { unique: false });
      }
    };
  });
}

export async function saveHistoryRecord(record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(record);
    req.onsuccess = () => resolve(record.id);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllHistoryRecords() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => {
      const records = req.result || [];
      records.sort((a, b) => (b.read_at || 0) - (a.read_at || 0));
      resolve(records);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteHistoryRecord(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function clearAllHistory() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/* ─── 辅助函数 ─────────────────────────────────── */

function getPreview(text) {
  if (!text) return "";
  const firstLine = text.trim().split(/\n/)[0] || "";
  return firstLine.length > 60 ? firstLine.slice(0, 60) + "…" : firstLine;
}

function formatTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return "刚刚";
  if (diff < 3600000) return Math.floor(diff / 60000) + " 分钟前";
  if (diff < 86400000) return Math.floor(diff / 3600000) + " 小时前";
  return d.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

/* ─── HistoryPanel ─────────────────────────────── */

/**
 * @param {object} props
 * @param {Function} props.onSelect — 点击历史记录回调 (record) => void
 * @param {string|null} props.activeId — 当前选中的历史记录 id
 */
export function HistoryPanel({ onSelect, activeId }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const fetched = useRef(false);

  const load = useCallback(async () => {
    try {
      const data = await getAllHistoryRecords();
      setRecords(data);
    } catch (e) {
      console.error("Failed to load reading history:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;
    load();
  }, [load]);

  const handleDelete = useCallback(async (e, id) => {
    e.stopPropagation();
    await deleteHistoryRecord(id);
    setRecords((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const handleClearAll = useCallback(async () => {
    await clearAllHistory();
    setRecords([]);
  }, []);

  if (loading) {
    return (
      <div className="history-panel">
        <div className="history-panel__skeleton">
          {[80, 65, 90].map((w, i) => (
            <div key={i} className="h-7 animate-pulse rounded bg-muted" style={{ width: w }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("history-panel", collapsed && "history-panel--collapsed")}>
      <div className="history-panel__header">
        <div className="history-panel__header-left">
          <Clock className="history-panel__icon" />
          <span className="history-panel__title">阅读历史</span>
          {records.length > 0 && (
            <span className="history-panel__badge">{records.length}</span>
          )}
        </div>
        <div className="history-panel__header-actions">
          {records.length > 0 && (
            <button
              className="history-panel__clear-btn"
              onClick={handleClearAll}
              title="清空历史"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
          <button
            className="history-panel__collapse-btn"
            onClick={() => setCollapsed((c) => !c)}
          >
            {collapsed ? "展开" : "收起"}
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          {records.length === 0 ? (
            <div className="history-panel__empty">
              暂无阅读历史，在左侧粘贴文章即可开始阅读
            </div>
          ) : (
            <div className="history-panel__list">
              {records.map((record) => (
                <button
                  key={record.id}
                  className={cn(
                    "history-panel__item",
                    activeId === record.id && "history-panel__item--active"
                  )}
                  onClick={() => onSelect?.(record)}
                >
                  <span className="history-panel__item-preview">{getPreview(record.text)}</span>
                  <div className="history-panel__item-meta">
                    <span className="history-panel__item-time">{formatTime(record.read_at)}</span>
                    <button
                      className="history-panel__item-delete"
                      onClick={(e) => handleDelete(e, record.id)}
                      aria-label="删除"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
