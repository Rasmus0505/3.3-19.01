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

function isHttpUrl(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized.startsWith("http://") || normalized.startsWith("https://");
}

function hasDesktopRuntime() {
  return typeof window !== "undefined" && typeof window.desktopRuntime?.getRuntimeInfo === "function";
}

function hasDesktopCloudBridge() {
  return hasDesktopRuntime() && typeof window.desktopRuntime?.requestCloudApi === "function";
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

function buildDesktopApiBaseUrlMissingError() {
  return new Error("Desktop cloud API base URL is not configured. Update desktop-runtime.json or set DESKTOP_CLOUD_API_BASE_URL before packaging.");
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

function arrayBufferToBase64(arrayBuffer) {
  const bytes = arrayBuffer instanceof Uint8Array ? arrayBuffer : new Uint8Array(arrayBuffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function base64ToUint8Array(base64 = "") {
  const normalized = String(base64 || "");
  if (!normalized) {
    return new Uint8Array(0);
  }
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function createAbortError() {
  return new DOMException("Request aborted", "AbortError");
}

function resolveDesktopFilePath(fileLike) {
  if (!fileLike || typeof fileLike !== "object" || !hasDesktopRuntime()) {
    return "";
  }
  try {
    return String(window.desktopRuntime?.getPathForFile?.(fileLike) || fileLike.path || fileLike.sourcePath || "").trim();
  } catch {
    return String(fileLike.path || fileLike.sourcePath || "").trim();
  }
}

async function serializeBodyForDesktopBridge(body) {
  if (body == null) {
    return { kind: "none" };
  }

  if (typeof FormData !== "undefined" && body instanceof FormData) {
    const entries = [];
    for (const [name, value] of body.entries()) {
      if (typeof value === "string") {
        entries.push({
          kind: "text",
          name,
          value,
        });
        continue;
      }

      const sourcePath = resolveDesktopFilePath(value);
      if (sourcePath) {
        entries.push({
          kind: "file-path",
          name,
          sourcePath,
          filename: String(value?.name || "").trim() || "upload.bin",
          contentType: String(value?.type || "").trim() || "application/octet-stream",
        });
        continue;
      }

      entries.push({
        kind: "file-bytes",
        name,
        filename: String(value?.name || "").trim() || "upload.bin",
        contentType: String(value?.type || "").trim() || "application/octet-stream",
        base64: arrayBufferToBase64(await value.arrayBuffer()),
      });
    }
    return {
      kind: "form-data",
      entries,
    };
  }

  if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) {
    return {
      kind: "text",
      text: body.toString(),
    };
  }

  if (typeof Blob !== "undefined" && body instanceof Blob) {
    const sourcePath = resolveDesktopFilePath(body);
    if (sourcePath) {
      return {
        kind: "file-path",
        sourcePath,
        filename: String(body?.name || "").trim() || "upload.bin",
        contentType: String(body.type || "").trim() || "application/octet-stream",
      };
    }
    return {
      kind: "bytes",
      base64: arrayBufferToBase64(await body.arrayBuffer()),
    };
  }

  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
    const bytes = body instanceof ArrayBuffer ? new Uint8Array(body) : new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
    return {
      kind: "bytes",
      base64: arrayBufferToBase64(bytes),
    };
  }

  if (typeof body === "string") {
    return {
      kind: "text",
      text: body,
    };
  }

  return {
    kind: "text",
    text: JSON.stringify(body),
  };
}

function createDesktopBridgeResponse(payload = {}) {
  if (payload?.aborted) {
    throw createAbortError();
  }
  const status = Number(payload?.status || 0);
  const bytes = base64ToUint8Array(payload?.bodyBase64 || "");
  return new Response(bytes.byteLength > 0 ? bytes : null, {
    status: status > 0 ? status : 200,
    statusText: String(payload?.statusText || ""),
    headers: payload?.headers || {},
  });
}

function createDesktopRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `desktop-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function runDesktopBridgeRequest(targetUrl, options = {}, accessToken = "") {
  if (!hasDesktopCloudBridge()) {
    throw new Error("Desktop cloud request bridge is unavailable.");
  }

  const method = normalizeMethod(options);
  const headers = buildHeaders(options, accessToken);
  const requestId = createDesktopRequestId();
  const signal = options?.signal;
  const abortHandler = () => {
    window.desktopRuntime?.cancelCloudRequest?.(requestId);
  };

  if (signal?.aborted) {
    throw createAbortError();
  }

  if (signal) {
    signal.addEventListener("abort", abortHandler, { once: true });
  }

  try {
    const payload = await window.desktopRuntime.requestCloudApi({
      requestId,
      url: targetUrl,
      method,
      headers: Object.fromEntries(headers.entries()),
      body: await serializeBodyForDesktopBridge(options?.body),
    });
    return createDesktopBridgeResponse(payload);
  } finally {
    if (signal) {
      signal.removeEventListener("abort", abortHandler);
    }
  }
}

async function runFetch(path, options = {}, accessToken = "", baseUrl = "") {
  const method = normalizeMethod(options);
  const { retries, retryDelayMs = 250, onAuthError, ...fetchOptions } = options;
  const resolvedBaseUrl = await resolveApiBaseUrl(baseUrl);
  if (!resolvedBaseUrl && hasDesktopRuntime() && !isHttpUrl(path)) {
    throw buildDesktopApiBaseUrlMissingError();
  }

  const targetUrl = withBase(path, resolvedBaseUrl);
  let attempt = 0;
  while (true) {
    try {
      const response = hasDesktopCloudBridge()
        ? await runDesktopBridgeRequest(targetUrl, { ...fetchOptions, method }, accessToken)
        : await fetch(targetUrl, {
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
  if (!resolvedBaseUrl && hasDesktopRuntime() && !isHttpUrl(path)) {
    throw buildDesktopApiBaseUrlMissingError();
  }

  const targetUrl = withBase(path, resolvedBaseUrl);
  if (hasDesktopCloudBridge()) {
    if (signal?.aborted) {
      throw createAbortError();
    }
    if (typeof onUploadProgress === "function") {
      onUploadProgress({ loaded: 0, total: 0, percent: 0, lengthComputable: false });
    }
    const response = await runDesktopBridgeRequest(
      targetUrl,
      {
        method,
        headers: rawHeaders,
        body,
        signal,
      },
      accessToken,
    );
    const responseText = await response.text();
    let data = {};
    try {
      data = responseText ? JSON.parse(responseText) : {};
    } catch (_) {
      data = {};
    }
    if (typeof onUploadProgress === "function") {
      onUploadProgress({ loaded: 1, total: 1, percent: 100, lengthComputable: false });
    }
    return {
      ok: response.ok,
      status: response.status,
      data,
      responseText,
    };
  }

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
      reject(createAbortError());
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

    xhr.open(method, targetUrl, true);
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
