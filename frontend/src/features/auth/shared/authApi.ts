import { api } from "../../../shared/api/client";

export interface AuthPayload {
  email?: string;
  password?: string;
  refresh_token?: string;
}

export interface AuthApiResult<T = any> {
  ok: boolean;
  status: number;
  data: T | Record<string, unknown>;
  message: string;
}

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

export function buildApiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const baseUrl = normalizeText(import.meta.env.VITE_API_BASE_URL).replace(/\/+$/, "");
  return baseUrl ? `${baseUrl}${normalizedPath}` : normalizedPath;
}

export function extractAuthMessage(data: unknown, fallbackMessage = "请求失败"): string {
  if (data && typeof data === "object") {
    const detail = normalizeText((data as { detail?: unknown }).detail);
    if (detail) {
      return detail;
    }
    const message = normalizeText((data as { message?: unknown }).message);
    if (message) {
      return message;
    }
  }
  return fallbackMessage;
}

async function parseJsonSafely(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }
  try {
    const data = JSON.parse(text);
    return data && typeof data === "object" ? data : {};
  } catch {
    return { detail: text };
  }
}

export async function postAuthJson<T = any>(
  path: string,
  payload: AuthPayload,
  fallbackMessage = "请求失败",
): Promise<AuthApiResult<T>> {
  try {
    const response = await api(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const data = await parseJsonSafely(response);
    return {
      ok: response.ok,
      status: response.status,
      data: data as T,
      message: extractAuthMessage(data, fallbackMessage),
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: {},
      message: `网络错误: ${String(error)}`,
    };
  }
}
