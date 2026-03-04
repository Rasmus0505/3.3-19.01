export function api(path, options = {}, accessToken = "") {
  const headers = new Headers(options.headers || {});
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
  return fetch(path, { ...options, headers });
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
