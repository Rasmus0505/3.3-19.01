export function api(path, options = {}, accessToken = "") {
  const headers = new Headers(options.headers || {});
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
  return fetch(path, { ...options, headers });
}

export function uploadWithProgress(path, options = {}, accessToken = "") {
  const { body, headers: rawHeaders, method = "POST", onUploadProgress, signal } = options;

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

    xhr.open(method, path, true);
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
  return `${data.error_code || "ERROR"}: ${data.message || fallback}`;
}
