/**
 * usePretextCache.ts — Pretext 测量结果 localStorage 缓存
 * ===========================================================
 * 缓存 key = text hash + font，命中则跳过 Pretext 内部测量。
 * 所有数据仅存在用户浏览器 localStorage，服务器零压力。
 */
const CACHE_PREFIX = "pt:prepare:";
const CACHE_VERSION = "v1";

function getCacheKey(text: string, font: string): string {
  // 简短文本直接拼 key；长文本取 base64 编码后截断（避免超长 key）
  const raw = `${CACHE_VERSION}:${text}:${font}`;
  if (raw.length <= 200) {
    return `${CACHE_PREFIX}${raw}`;
  }
  const encoded = btoa(encodeURIComponent(text));
  return `${CACHE_PREFIX}${CACHE_VERSION}:${encoded.slice(0, 64)}:${font}`;
}

function safeJsonParse<T>(str: string): T | null {
  try {
    return JSON.parse(str) as T;
  } catch {
    return null;
  }
}

/** localStorage 缓存操作 hook */
export function usePretextCache() {
  function get(text: string, font: string): string | null {
    try {
      return localStorage.getItem(getCacheKey(text, font));
    } catch {
      // Safari 私密模式等场景下 localStorage 可能抛错
      return null;
    }
  }

  function set(text: string, font: string, value: string): void {
    try {
      localStorage.setItem(getCacheKey(text, font), value);
    } catch {
      // localStorage 写满时静默丢弃（用户仍可正常使用）
    }
  }

  function remove(text: string, font: string): void {
    try {
      localStorage.removeItem(getCacheKey(text, font));
    } catch {
      /* ignore */
    }
  }

  function clear(): void {
    try {
      const keys = Object.keys(localStorage).filter((k) => k.startsWith(CACHE_PREFIX));
      keys.forEach((k) => localStorage.removeItem(k));
    } catch {
      /* ignore */
    }
  }

  function getCacheSize(): number {
    try {
      const keys = Object.keys(localStorage).filter((k) => k.startsWith(CACHE_PREFIX));
      return keys.length;
    } catch {
      return 0;
    }
  }

  return { get, set, remove, clear, getCacheSize };
}
