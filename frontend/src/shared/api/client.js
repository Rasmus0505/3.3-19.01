const IDEMPOTENT_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const ENV_API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").trim();
let desktopRuntimeInfoPromise = null;

function withBase(path, baseUrl = "") {
  const safeBase = String(baseUrl || "").trim();
  if (!safeBase) return path;
  if (String(path).startsWith("http://") || String(path).startsWith("https://")) return path;
  if (!String(path).startsWith("/")) return `${safeBase}/${path}`;
  return `${safeBase}${path}`;
}

function hasDesktopRuntime() {
  return typeof window !== "undefined" && typeof window.desktopRuntime?.getRuntimeInfo === "function";
}

async function getDesktopRuntimeInfo() {
  if (!hasDesktopRuntime()) {
    return null;
  }
  if (!desktopRuntimeInfoPromise) {
    desktopRuntimeInfoPromise = Promise.resolve(window.desktopRuntime.getRuntimeInfo()).catch(() => null);
  }
  return desktopRuntimeInfoPromise;
}

async function resolveApiBaseUrl(baseUrl = "") {
  const configuredBase = String(baseUrl || "").trim();
  if (configuredBase) {
    return configuredBase;
  }
  if (ENV_API_BASE_URL) {
    return ENV_API_BASE_URL;
  }
  const runtimeInfo = await getDesktopRuntimeInfo();
  const runtimeApiBaseUrl = String(runtimeInfo?.cloud?.apiBaseUrl || "").trim();
  if (runtimeApiBaseUrl) {
    return runtimeApiBaseUrl;
  }
  return String(runtimeInfo?.cloud?.appBaseUrl || "").trim();
}

function normalizeMethod(options = {}) {
  return String(options.method || "GET").toUpperCase();
}

function shouldRetry(method, options = {}, attempt = 0, response = null, error = null) {
  const maxRetries =
    typeof options.retries === "number"
      ? Math.max(0, Number(options.retries))
      : IDEMPOTENT_METHODS.has(method)
        ? 2
        : 0;
  if (attempt >= maxRetries) return false;
  if (error) return IDEMPOTENT_METHODS.has(method);
  if (!response) return false;
  return response.status >= 500 && response.status < 600 && IDEMPOTENT_METHODS.has(method);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildHeaders(options = {}, accessToken = "") {
  const headers = new Headers(options.headers || {});
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
  return headers;
}

async function runFetch(path, options = {}, accessToken = "", baseUrl = "") {
  const method = normalizeMethod(options);
  const { retries, retryDelayMs = 250, onAuthError, ...fetchOptions } = options;
  const resolvedBaseUrl = await resolveApiBaseUrl(baseUrl);
  let attempt = 0;
  while (true) {
    try {
      const response = await fetch(withBase(path, resolvedBaseUrl), {
        ...fetchOptions,
        method,
        headers: buildHeaders(fetchOptions, accessToken),
      });
      if ((response.status === 401 || response.status === 403) && typeof onAuthError === "function") {
        onAuthError(response);
      }
      if (!shouldRetry(method, { retries }, attempt, response)) {
        return response;
      }
    } catch (error) {
      if (!shouldRetry(method, { retries }, attempt, null, error)) {
        throw error;
      }
    }
    attempt += 1;
    await sleep(Number(retryDelayMs || 250) * 2 ** (attempt - 1));
  }
}

export function createApiClient({ baseUrl = "" } = {}) {
  return function apiClient(path, options = {}, accessToken = "") {
    return runFetch(path, options, accessToken, baseUrl);
  };
}

export const api = createApiClient({ baseUrl: ENV_API_BASE_URL });

export async function uploadWithProgress(path, options = {}, accessToken = "", baseUrl = "") {
  const { body, headers: rawHeaders, method = "POST", onUploadProgress, signal } = options;
  const resolvedBaseUrl = await resolveApiBaseUrl(baseUrl);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const headers = new Headers(rawHeaders || {});
    let aborted = false;

    if (accessToken) {
      headers.set("Authorization", `Bearer ${accessToken}`);
    }

    const parsePayload = () => {
      const text = xhr.responseText || "";
      if (!text) return {};
      try {
        return JSON.parse(text);
      } catch (_) {
        return {};
      }
    };

    const rejectAbort = () => {
      aborted = true;
      reject(new DOMException("Request aborted", "AbortError"));
    };

    const abortHandler = () => {
      cleanup();
      xhr.abort();
      rejectAbort();
    };

    const cleanup = () => {
      if (signal) {
        signal.removeEventListener("abort", abortHandler);
      }
    };

    if (signal) {
      if (signal.aborted) {
        abortHandler();
        return;
      }
      signal.addEventListener("abort", abortHandler, { once: true });
    }

    xhr.open(method, withBase(path, resolvedBaseUrl), true);
    headers.forEach((value, key) => {
      if (value != null) {
        xhr.setRequestHeader(key, value);
      }
    });

    xhr.upload.onprogress = (event) => {
      if (typeof onUploadProgress !== "function") return;
      const total = Number(event.total || 0);
      const loaded = Number(event.loaded || 0);
      const percent = event.lengthComputable && total > 0 ? Math.round((loaded / total) * 100) : 0;
      onUploadProgress({ loaded, total, percent, lengthComputable: Boolean(event.lengthComputable) });
    };

    xhr.onload = () => {
      cleanup();
      resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        data: parsePayload(),
        responseText: xhr.responseText || "",
      });
    };

    xhr.onerror = () => {
      cleanup();
      reject(new Error("Network request failed"));
    };

    xhr.onabort = () => {
      cleanup();
      if (!aborted) {
        rejectAbort();
      }
    };

    xhr.send(body);
  });
}

export async function parseResponse(resp) {
  try {
    return await resp.json();
  } catch (_) {
    return {};
  }
}

export function toErrorText(data, fallback) {
  if (typeof data === "string" && data.trim()) {
    return data.trim();
  }
  return `${data?.error_code || "ERROR"}: ${data?.message || fallback}`;
}
